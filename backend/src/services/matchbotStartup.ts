import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { safeFile } from './addonFiles.js';

const hash = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
const cfgPath = /^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*\.cfg$/;
const startupPath = 'cstrike/game_init.cfg';
type Startup = { argv: string[]; cfg?: string };

/** Read commands, never evaluate config strings or expand arbitrary shell variables. */
function commands(text: string, shell = false) {
  const result: string[][] = [];
  let parts: string[] = [], word = '', quote = '', comment = false;
  const token = () => { if (word) parts.push(word); word = ''; };
  const command = () => { token(); if (parts.length) result.push(parts); parts = []; };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (comment) { if (char === '\r' || char === '\n') { comment = false; command(); } continue; }
    if (quote !== "'" && char === '\\' && (quote && ['"', '\\'].includes(text[i + 1]) || shell && ['"', "'", '\\', ' ', ';', '&', '|', '#'].includes(text[i + 1]))) { word += text[++i]; continue; }
    if (char === '"' || shell && char === "'") {
      if (!quote) { quote = char; continue; }
      if (quote === char) { quote = ''; continue; }
    }
    if (!quote && (!shell && char === '/' && text[i + 1] === '/' || shell && char === '#' && !word)) { comment = true; continue; }
    if (!quote && (char === ';' || char === '\n' || char === '\r')) { command(); continue; }
    if (!quote && shell && (char === '&' && text[i + 1] === '&' || char === '|' && text[i + 1] === '|')) { command(); i++; continue; }
    if (!quote && /\s/.test(char)) { token(); continue; }
    word += char;
  }
  command(); return result;
}

const gameExecutable = (value = '') => /(?:^|\/)hlds_(?:linux|run)$/.test(value);
const basename = (value = '') => value.split('/').pop();
const invalidStartup = () => new Error('invalid_matchbot_startup');

/** Accept common launch prefixes without executing assignments, env or shell code. */
function engineCommand(tokens: string[], forwarded?: string[]) {
  let index = 0, exec = false;
  const assignments = () => {
    while (/^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[index] || '')) {
      index++;
    }
  };
  assignments();
  if (tokens[index] === 'exec') {
    exec = true; index++;
    while (['-c', '-l', '--', '-a'].includes(tokens[index])) {
      const flag = tokens[index++];
      if (flag === '-a') index++;
      if (flag === '--') break;
    }
    assignments();
  }
  if (basename(tokens[index]) === 'env') {
    index++;
    while (tokens[index]?.startsWith('-')) {
      const flag = tokens[index++];
      if (flag === '--') break;
      if (['-i', '--ignore-environment'].includes(flag)) continue;
      if (['-u', '--unset'].includes(flag)) { if (!tokens[index++]) throw invalidStartup(); continue; }
      if (/^--unset=.+$/.test(flag)) continue;
      throw invalidStartup();
    }
    assignments();
  }
  if (exec && ['$@', '${@}'].includes(tokens[index]) && forwarded) return engineCommand(forwarded);
  // Shell argument expansion precedes same-command VAR=value/env assignments.
  // "$CFG" therefore refers to the parent environment, not an env-prefix value.
  if (gameExecutable(tokens[index])) return tokens.slice(index);
  // These commands can contain examples; they cannot launch the referenced game.
  if (['echo', 'printf', 'test', '[', '[[', 'alias'].includes(tokens[index])) return null;
  // Do not simulate shell state changes that could alter a later "$CFG" argument.
  if (index === tokens.length && tokens.some(value => value.startsWith('CFG='))
      || ['export', 'readonly', 'declare', 'typeset'].includes(tokens[index]) && tokens.some(value => /^CFG(?:=|$)/.test(value))) throw invalidStartup();
  if (exec || tokens.some(gameExecutable)) throw invalidStartup();
  return null;
}

/** The managed shell template execs hlds_linux; unknown game launch syntax fails closed. */
function startupCommands(argv: string[]) {
  const rows: string[][] = [];
  let shellFound = false;
  for (let index = 0; index < argv.length - 1; index++) {
    if (!['bash', 'sh', 'dash'].includes(basename(argv[index]) || '')) continue;
    shellFound = true;
    let script = -1;
    for (let flagIndex = index + 1; flagIndex < argv.length; flagIndex++) {
      const flag = argv[flagIndex];
      if (['--noprofile', '--norc', '--posix', '--login'].includes(flag)) continue;
      if (['-o', '+o', '-O', '+O'].includes(flag)) { flagIndex++; continue; }
      if (!/^-[a-zA-Z]+$/.test(flag)) break;
      if (flag.includes('c')) { script = flagIndex + 1; break; }
    }
    if (script < 0 || typeof argv[script] !== 'string') throw invalidStartup();
    for (const tokens of commands(argv[script].replace(/\\\r?\n/g, ''), true)) {
      const engine = engineCommand(tokens, argv.slice(script + 2));
      if (engine) rows.push(engine);
    }
    // The remainder contains $0 and game arguments, not another shell invocation.
    break;
  }
  if (!shellFound) {
    let direct = argv;
    if (['tini', 'dumb-init'].includes(basename(direct[0]) || '')) {
      const separator = direct.indexOf('--');
      if (separator < 0) throw invalidStartup();
      direct = direct.slice(separator + 1);
    }
    const engine = engineCommand(direct);
    if (engine) rows.push(engine);
  }
  if (!rows.length) throw invalidStartup();
  const game: string[][] = [];
  for (const row of rows) {
    for (let i = 0; i < row.length; i++) {
      if (/^\+(?:log|exec|servercfgfile|sv_rcon_condebug)$/i.test(row[i]) && row[i + 1]) game.push([row[i].slice(1).toLowerCase(), row[++i]]);
    }
  }
  return game;
}

/**
 * ReGameDLL executes game_init.cfg once from GameDLLInit. Keep logging out of
 * server.cfg (executed per map), agent polling and controller phase transitions.
 * Existing logging in the operator's startup/config chain stays untouched.
 */
export async function planMatchbotStartup(root: string, startup: Startup, plannedGameInit?: Buffer) {
  if (startup.argv.some(value => typeof value !== 'string') || startup.argv.join('\0').length > 128 * 1024) throw new Error('invalid_matchbot_startup');
  const initial = startupCommands(startup.argv);
  const resolveCfg = (value: string) => /^(?:\$CFG|\$\{CFG\})$/.test(value) ? startup.cfg || 'server.cfg' : value;
  const activeCfg = resolveCfg(initial.filter(command => command[0] === 'servercfgfile').pop()?.[1] || startup.cfg || 'server.cfg');
  const queue = ['game_init.cfg', 'game.cfg', 'autoexec.cfg', activeCfg, ...initial.filter(command => command[0] === 'exec').map(command => resolveCfg(command[1]))];
  const visited = new Set<string>();
  const states: [string, string | null][] = [];
  const logging = initial.filter(command => command[0] === 'log').map(command => command[1].toLowerCase());
  const rconDebug = initial.filter(command => command[0] === 'sv_rcon_condebug').map(command => command[1]);
  let gameInit = Buffer.alloc(0), total = 0;
  for (let index = 0; index < queue.length; index++) {
    const name = queue[index];
    if (!cfgPath.test(name) || name.length > 192) throw new Error('invalid_matchbot_startup');
    if (visited.has(name)) continue;
    visited.add(name);
    if (visited.size > 32) throw new Error('invalid_matchbot_startup');
    const file = await safeFile(root, 'cstrike/' + name);
    if (!file?.stat) { states.push([name, null]); continue; }
    if (file.stat.size > 128 * 1024 || (total += file.stat.size) > 1024 * 1024) throw new Error('invalid_matchbot_startup');
    const bytes = await fs.readFile(file.filename);
    if (!Buffer.from(bytes.toString('utf8')).equals(bytes)) throw new Error('invalid_matchbot_startup');
    states.push([name, hash(bytes)]);
    if (name === 'game_init.cfg') gameInit = bytes;
    for (const command of commands(bytes.toString('utf8'))) {
      if (command[0].toLowerCase() === 'log' && command.length === 2) logging.push(command[1].toLowerCase());
      if (command[0].toLowerCase() === 'sv_rcon_condebug' && command.length >= 2) rconDebug.push(command[1]);
      if (command[0].toLowerCase() === 'exec' && command.length === 2) queue.push(command[1]);
    }
  }
  // Do not silently defeat an operator's explicit disabling command elsewhere.
  // The reviewed installer can retry once that conflicting startup setting is resolved.
  if (logging.some(value => !['on', 'off'].includes(value))) throw invalidStartup();
  if (logging.includes('off')) throw new Error('startup_logging_conflict');
  // ReHLDS defaults to logging raw RCON requests, including the password. Never
  // enable game logging while an explicit startup/config override can restore it.
  const isZero = (value: string) => /^[+-]?(?:0+(?:\.0*)?|\.0+)$/.test(value);
  if (rconDebug.some(value => !isZero(value))) throw new Error('unsafe_rcon_logging');
  const startupLogging = logging.includes('on') ? 'configured' : 'add';
  const plan = new Map<string, Buffer>();
  let text = (plannedGameInit || gameInit).toString('utf8');
  const newline = text.includes('\r\n') ? '\r\n' : '\n';
  const first = commands(text)[0];
  const rconLogging = first?.[0].toLowerCase() === 'sv_rcon_condebug' && first.length === 2 && isZero(first[1]) ? 'protected' : 'protect';
  // Put protection before any existing log/exec/alias command, not merely before
  // our new log line. Preserve safe operator entries later in the file unchanged.
  if (rconLogging === 'protect') text = 'sv_rcon_condebug 0' + newline + text;
  if (startupLogging === 'add') {
    text += (text && !/[\r\n]$/.test(text) ? newline : '') + 'log on' + newline;
  }
  if (rconLogging === 'protect' || startupLogging === 'add') plan.set(startupPath, Buffer.from(text));
  // Include the new protection policy/plan so pre-guard previews cannot authorize it.
  const fingerprint = hash(JSON.stringify([2, startup, states, plannedGameInit ? hash(plannedGameInit) : null, rconLogging, startupLogging, [...plan].map(([name, bytes]) => [name, hash(bytes)])]));
  return { plan, fingerprint, startupLogging, rconLogging };
}
