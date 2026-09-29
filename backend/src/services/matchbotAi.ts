import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import yauzl from 'yauzl';
import { safeFile } from './addonFiles.js';

const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
export const BOT_PROFILES_SHA256 = '39e6e8a137dbbbdef842cdb4318ef1069b3467127a0cc19bdc6eca1d5d693e38';
export const MATCHBOT_AI_PROVENANCE = ['bot-dependencies.json', 'upstream-LICENSE', 'upstream-LICENSE-TRANSITION.md'] as const;
export function matchbotAiDestination(name: string) {
  return ['cstrike/BotProfile.db', 'cstrike/BotChatter.db'].includes(name)
    || /^cstrike\/maps\/[a-z0-9_-]{1,64}\.nav$/.test(name)
    || /^cstrike\/sound\/radio\/bot\/[a-z0-9_]+\.wav$/.test(name)
    || MATCHBOT_AI_PROVENANCE.some(file => name === 'cstrike/addons/matchbot/resources/' + file)
    || ['cstrike/addons/matchbot/resources/nav-proof.json', 'cstrike/addons/matchbot/resources/navigation-manifest.json'].includes(name);
}

/** The upstream archive is immutable. Never extract a path or execute an archive entry. */
export async function readBotProfiles(bytes: Buffer) {
  if (hash(bytes) !== BOT_PROFILES_SHA256) throw new Error('source_verification_failed');
  const files = new Map<string, Buffer>();
  const seen = new Set<string>();
  let expanded = 0;
  await new Promise<void>((resolve, reject) => yauzl.fromBuffer(bytes, { lazyEntries: true, validateEntrySizes: true }, (error, zip) => {
    if (error || !zip) return reject(error || new Error('invalid_bot_profiles'));
    const fail = (error: unknown) => { zip.close(); reject(error); };
    zip.on('error', fail); zip.on('end', resolve);
    zip.on('entry', entry => {
      const name = entry.fileName;
      const type = (entry.externalFileAttributes >>> 16) & 0o170000;
      if (seen.has(name) || seen.size >= 512 || type && type !== 0o100000 && type !== 0o040000) return fail(new Error('invalid_bot_profiles'));
      seen.add(name);
      if (['cstrike/', 'cstrike/sound/', 'cstrike/sound/radio/', 'cstrike/sound/radio/bot/'].includes(name)) return zip.readEntry();
      if (!/^(?:cstrike\/Bot(?:Profile|Chatter)\.db|cstrike\/sound\/radio\/bot\/[a-z0-9_]+\.wav)$/.test(name) || type === 0o040000 || entry.uncompressedSize > 1024 * 1024) return fail(new Error('invalid_bot_profiles'));
      expanded += entry.uncompressedSize;
      if (expanded > 16 * 1024 ** 2) return fail(new Error('invalid_bot_profiles'));
      zip.openReadStream(entry, (error, stream) => {
        if (error || !stream) return fail(error || new Error('invalid_bot_profiles'));
        void (async () => {
          const chunks: Buffer[] = [];
          for await (const chunk of stream) chunks.push(Buffer.from(chunk));
          files.set(name, Buffer.concat(chunks)); zip.readEntry();
        })().catch(fail);
      });
    }); zip.readEntry();
  }));
  if (files.size !== 489 || !files.has('cstrike/BotProfile.db') || !files.has('cstrike/BotChatter.db')) throw new Error('invalid_bot_profiles');
  return files;
}

/** Change only active bot_enable commands, preserving comments, other settings and line endings. */
export function enableMatchbotAi(text: string) {
  let found = false;
  const merge = (command: string) => command.replace(/^(\s*(?:bot_enable|"bot_enable"))(?=\s|$)([ \t]*)(?:"[^"\r\n]*"|(?!\/\/)[^\s;]+)?/i, (_all, name, spacing) => {
    found = true; return name + (spacing || ' ') + '"1"';
  });
  // Configs may chain commands; semicolons in comments/quoted strings aren't separators.
  let result = '', start = 0, quoted = false, comment = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (!comment && quoted && char === '\\') { i++; continue; }
    if (!comment && char === '"') quoted = !quoted;
    if (!quoted && char === '/' && text[i + 1] === '/') comment = true;
    if (char === '\r' || char === '\n' || char === ';' && !quoted && !comment) {
      result += merge(text.slice(start, i)) + char; start = i + 1;
      if (char !== ';') { comment = false; quoted = false; }
    }
  }
  result += merge(text.slice(start));
  if (found) return result;
  const newline = text.includes('\r\n') ? '\r\n' : '\n';
  return result + (result && !/[\r\n]$/.test(result) ? newline : '') + 'bot_enable "1"' + newline;
}

export type MatchbotAiAssets = {
  profiles: Map<string, Buffer>; nav: Buffer; proof: Buffer; provenance: Map<string, Buffer>;
  navigation?: { nav: Buffer; proof: Buffer }[]; navigationManifest?: Buffer;
};
export type MatchbotAiSummary = {
  botEnable: 'enable' | 'enabled'; filesToAdd: number; filesPreserved: number;
  navigation: { map: string; status: 'install' | 'verified' | 'preserved' | 'bsp_mismatch' | 'missing_bsp'; bspMatches: boolean }[];
};

/** Plan only missing resources and a scoped cfg merge; custom profiles, audio and NAV stay intact. */
export async function planMatchbotAi(root: string, assets: MatchbotAiAssets) {
  const proof = JSON.parse(assets.proof.toString('utf8'));
  if (proof.map !== 'de_dust2') throw new Error('source_verification_failed');
  const navigation = [{ nav: assets.nav, proof: assets.proof }, ...assets.navigation || []].map(item => ({ ...item, parsed: JSON.parse(item.proof.toString('utf8')) }));
  const maps = new Set<string>();
  if (navigation.length > 32) throw new Error('source_verification_failed');
  for (const { nav, parsed } of navigation) {
    if (typeof parsed.map !== 'string' || !/^[a-z0-9_-]{1,64}$/.test(parsed.map) || maps.has(parsed.map) || !/^[a-f0-9]{64}$/.test(parsed.bsp_sha256)
        || !Number.isSafeInteger(parsed.bsp_bytes) || parsed.bsp_bytes <= 0
        || parsed.nav_sha256 !== hash(nav) || nav.length !== parsed.nav_bytes || nav.length < 12 || nav.readUInt32LE(0) !== 0xfeedface
        || nav.readUInt32LE(4) !== 5 || nav.readUInt32LE(8) !== parsed.bsp_bytes) throw new Error('source_verification_failed');
    maps.add(parsed.map);
  }
  for (const name of ['BotProfile.db', 'BotChatter.db']) {
    const bytes = assets.profiles.get('cstrike/' + name);
    if (!bytes || hash(bytes) !== proof[name]) throw new Error('source_verification_failed');
  }
  const plan = new Map<string, Buffer>();
  const states: [string, string | null][] = [];
  let existingBytes = 0;
  const read = async (name: string, limit = 1024 * 1024) => {
    const file = await safeFile(root, name);
    if (!file?.stat) { states.push([name, null]); return null; }
    if (file.stat.size > limit || (existingBytes += file.stat.size) > 192 * 1024 ** 2) throw new Error('invalid_matchbot_ai_file');
    const bytes = await fs.readFile(file.filename);
    states.push([name, hash(bytes)]); return bytes;
  };
  let filesPreserved = 0;
  const resources = new Map(assets.profiles);
  for (const name of MATCHBOT_AI_PROVENANCE) {
    const bytes = assets.provenance.get(name);
    if (!bytes) throw new Error('source_verification_failed');
    resources.set('cstrike/addons/matchbot/resources/' + name, bytes);
  }
  resources.set('cstrike/addons/matchbot/resources/nav-proof.json', assets.proof);
  if (assets.navigationManifest) resources.set('cstrike/addons/matchbot/resources/navigation-manifest.json', assets.navigationManifest);
  for (const [name, bytes] of resources) {
    if (!matchbotAiDestination(name)) throw new Error('invalid_matchbot_ai_destination');
    if (await read(name)) filesPreserved++; else plan.set(name, bytes);
  }
  const filename = 'cstrike/game_init.cfg';
  const config = await read(filename, 128 * 1024);
  if (config && !Buffer.from(config.toString('utf8')).equals(config)) throw new Error('invalid_matchbot_ai_config');
  const merged = Buffer.from(enableMatchbotAi(config?.toString('utf8') || ''));
  const botEnable = config?.equals(merged) ? 'enabled' : 'enable';
  if (botEnable === 'enable') plan.set(filename, merged);
  const summary: MatchbotAiSummary = { botEnable, filesToAdd: resources.size - filesPreserved, filesPreserved, navigation: [] };
  for (const item of navigation) {
    const navProof = item.parsed;
    const bsp = await read('cstrike/maps/' + navProof.map + '.bsp', 64 * 1024 ** 2);
    const nav = await read('cstrike/maps/' + navProof.map + '.nav', 64 * 1024 ** 2);
    const bspMatches = Boolean(bsp && bsp.length === navProof.bsp_bytes && hash(bsp) === navProof.bsp_sha256);
    const status = nav ? bspMatches && hash(nav) === navProof.nav_sha256 ? 'verified' : 'preserved'
      : !bsp ? 'missing_bsp' : bspMatches ? 'install' : 'bsp_mismatch';
    if (status === 'install') plan.set('cstrike/maps/' + navProof.map + '.nav', item.nav);
    summary.navigation.push({ map: navProof.map, status, bspMatches });
  }
  const fingerprint = hash(Buffer.from(JSON.stringify([states, [...resources].map(([name, bytes]) => [name, hash(bytes)]), navigation.map(item => [hash(item.nav), hash(item.proof)])])));
  return { plan, fingerprint, summary };
}
