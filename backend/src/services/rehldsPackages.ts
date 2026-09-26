import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';
import tar from 'tar-stream';
import yauzl from 'yauzl';

export const REHLDS_ADDON_PACK = Object.freeze({ id: 'metamod-1.3.0.149-amxx-1.10.5486', metamod: '1.3.0.149', amxx: '1.10.0.5486', platform: 'Linux x86',
  sources: [
    { module: 'metamod', kind: 'zip', url: 'https://github.com/rehlds/Metamod-R/releases/download/1.3.0.149/metamod-bin-1.3.0.149.zip', sha256: 'ede7f59c4e0220afe8c02aa348a130cce527f87d36ffdb674e37a501ce57be94' },
    { module: 'amxx', kind: 'tar', url: 'https://github.com/alliedmodders/amxmodx/releases/download/1.10.0.5486/amxmodx-1.10.0-git5486-base-linux.tar.gz', sha256: '9f5041325cc656dcc292cafb9d2c9cb4deeedb57192d8a7ed43947530e04e5b7' },
    { module: 'amxx', kind: 'tar', url: 'https://github.com/alliedmodders/amxmodx/releases/download/1.10.0.5486/amxmodx-1.10.0-git5486-cstrike-linux.tar.gz', sha256: '686d875010792d84ac765d2f78af227ab7000c9b567995ea56b836e0a41fc7a7' },
  ] });
export const REHLDS_MODULES = [
  { id: 'rehlds', name: 'ReHLDS', version: '3.15.0.896', requires: [] },
  { id: 'metamod', name: 'Metamod-R', version: '1.3.0.149', requires: [] },
  { id: 'amxx', name: 'AMX Mod X', version: '1.10.0.5486', requires: ['metamod'] },
  { id: 'regamedll', name: 'ReGameDLL_CS', version: '5.30.0.814', requires: ['rehlds'] },
  { id: 'reapi', name: 'ReAPI', version: '5.29.0.358', requires: ['rehlds', 'regamedll', 'amxx'] },
  { id: 'reunion', name: 'Reunion', version: '0.2.0.25', requires: ['rehlds', 'metamod'] },
];
export function selectedModules(value: unknown): string[] {
  if (!Array.isArray(value) || !value.length || value.length > 6 || value.some(id => !REHLDS_MODULES.some(m => m.id === id))) throw Object.assign(new Error('Select known addon modules'), { statusCode: 400 });
  const ids = new Set<string>(value);
  for (const id of ids) for (const dependency of REHLDS_MODULES.find(m => m.id === id)!.requires) ids.add(dependency);
  return REHLDS_MODULES.map(m => m.id).filter(id => ids.has(id));
}
const extraSources = [
  { module: 'rehlds', kind: 'zip', url: 'https://github.com/rehlds/ReHLDS/releases/download/3.15.0.896/rehlds-bin-3.15.0.896.zip', sha256: '997baeb7ef3842dab3e034d82dc651ebfe560c23b158adce660a6b97976b4e2b' },
  { module: 'regamedll', kind: 'zip', url: 'https://github.com/rehlds/ReGameDLL_CS/releases/download/5.30.0.814/regamedll-bin-5.30.0.814.zip', sha256: '457f5c96a4d10280fcad47f106cbd5be86363a47df1ccab91c514e9d1bc6fd18' },
  { module: 'reapi', kind: 'zip', url: 'https://github.com/rehlds/ReAPI/releases/download/5.29.0.358/reapi-bin-5.29.0.358.zip', sha256: 'f33a7435540bea8706db3fa948e51a85b511f5b18c383b97402a204dc5419195' },
  { module: 'reunion', kind: 'zip', url: 'https://github.com/rehlds/ReUnion/releases/download/0.2.0.25/reunion-0.2.0.25.zip', sha256: '0f238276719274216bd169c578eac2db4e041946b8b9f0e407e41ef9d85efdf5' },
];
export const packageSources = [...REHLDS_ADDON_PACK.sources, ...extraSources];
export function addonPath(name: string) {
  const parts = name.split('/');
  if (name.startsWith('/') || parts.some(p => !p || p === '.' || p === '..') || /[\\\x00-\x1f]/.test(name)) throw new Error('Invalid addon archive path');
  return name;
}
export async function downloadAddonFiles(selected: string[]) {
  const modules = selectedModules(selected);
  const files = new Map<string, Buffer>();
  let expanded = 0;
  const add = (name: string, data: Buffer) => {
    addonPath(name); expanded += data.length;
    if (expanded > 64 * 1024 * 1024 || data.length > 8 * 1024 * 1024 || files.size > 3000) throw new Error('Addon package exceeds limits');
    files.set(name, data);
  };
  for (const source of packageSources.filter(s => modules.includes(s.module))) {
    const response = await fetch(source.url, { signal: AbortSignal.timeout(30000) });
    if (!response.ok || !response.body) throw new Error('Official addon package is unavailable');
    const chunks: Uint8Array[] = []; let size = 0;
    for await (const chunk of response.body as any) { size += chunk.length; if (size > 10 * 1024 * 1024) throw new Error('Addon download exceeds limit'); chunks.push(chunk); }
    const bytes = Buffer.concat(chunks);
    if (createHash('sha256').update(bytes).digest('hex') !== source.sha256) throw new Error('Addon package checksum mismatch');
    if (source.kind === 'zip') {
      await new Promise<void>((resolve, reject) => yauzl.fromBuffer(bytes, { lazyEntries: true }, (error, zip) => {
        if (error || !zip) return reject(error); zip.on('error', reject); zip.on('end', resolve);
        zip.on('entry', entry => {
          const name = entry.fileName;
          let destination: string | undefined;
          if (source.module === 'metamod' && ['addons/metamod/metamod_i386.so', 'addons/metamod/config.ini'].includes(name)) destination = 'cstrike/' + name;
          if (source.module === 'rehlds' && ['bin/linux32/engine_i486.so', 'bin/linux32/hlds_linux', 'bin/linux32/filesystem_stdio.so'].includes(name)) destination = name.slice('bin/linux32/'.length);
          if (source.module === 'regamedll' && ['bin/linux32/cstrike/delta.lst', 'bin/linux32/cstrike/dlls/cs.so', 'bin/linux32/cstrike/game.cfg', 'bin/linux32/cstrike/game_init.cfg'].includes(name)) destination = name.slice('bin/linux32/'.length);
          if (source.module === 'reapi' && name.startsWith('addons/amxmodx/') && (name.endsWith('.inc') || name.endsWith('_i386.so'))) destination = 'cstrike/' + name;
          if (source.module === 'reunion') destination = name === 'reunion.cfg' ? 'cstrike/reunion.cfg' : name === 'bin/Linux/reunion_mm_i386.so' ? 'cstrike/addons/metamod/reunion/reunion_mm_i386.so' : undefined;
          if (!destination) return zip.readEntry();
          if (entry.uncompressedSize > 8 * 1024 * 1024) { zip.close(); return reject(new Error('Addon file too large')); }
          zip.openReadStream(entry, (error, stream) => {
            if (error || !stream) { zip.close(); return reject(error); }
            void (async () => { const chunks: Buffer[] = []; for await (const chunk of stream) chunks.push(Buffer.from(chunk)); add(destination!, Buffer.concat(chunks)); zip.readEntry(); })().catch(error => { zip.close(); reject(error); });
          });
        }); zip.readEntry();
      }));
    } else {
      const extract = tar.extract(); let count = 0; const seen = new Set<string>();
      extract.on('entry', (header, stream, next) => {
        void (async () => {
          if (++count > 3000 || !['file', 'directory'].includes(header.type || '') || (header.size || 0) > 8 * 1024 * 1024) throw new Error('Unsupported addon archive entry');
          const name = addonPath(header.name.replace(/\/$/, ''));
          if (name !== 'addons' && !name.startsWith('addons/amxmodx')) throw new Error('Unsupported AMXX root');
          if (seen.has(name)) throw new Error('Duplicate addon path'); seen.add(name);
          if (header.type === 'directory') { stream.resume(); next(); return; }
          const chunks: Buffer[] = []; for await (const chunk of stream) chunks.push(Buffer.from(chunk));
          add('cstrike/' + name, Buffer.concat(chunks)); next();
        })().catch(error => extract.destroy(error));
      });
      await pipeline(Readable.from(bytes), createGunzip(), extract);
    }
  }
  const required: Record<string, string> = { rehlds: 'hlds_linux', metamod: 'cstrike/addons/metamod/metamod_i386.so', amxx: 'cstrike/addons/amxmodx/dlls/amxmodx_mm_i386.so', regamedll: 'cstrike/dlls/cs.so', reapi: 'cstrike/addons/amxmodx/modules/reapi_amxx_i386.so', reunion: 'cstrike/addons/metamod/reunion/reunion_mm_i386.so' };
  for (const module of modules) if (!files.has(required[module])) throw new Error('Incomplete addon package');
  return files;
}
