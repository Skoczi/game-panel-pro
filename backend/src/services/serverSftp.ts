import { promises as fs } from 'node:fs';
import path from 'node:path';
import { isIP } from 'node:net';
import { randomBytes } from 'node:crypto';
import { serverRepository } from '../database/index.js';
import { getServerStoragePaths } from '../utils/storage.js';
import { parseStoredMounts, parseStoredPorts } from '../providers/runtimeConfig.js';
import { nativeServerTemplate } from './nativeBackups.js';
import type { GameServerRow } from '../types/gameServer.js';

type ServiceConfig = { apiUrl: string; admin: string; secret: string; port: number; publicIps: string[]; fingerprint: string };
type RemoteUser = { status: number; username: string; home_dir: string };
export type SftpStatus = { available: boolean; enabled: boolean; host: string | null; port: number | null; username: string | null; directory: string | null; fingerprint: string | null; reason?: string; password?: string };
const fail = (message: string, statusCode = 503) => Object.assign(new Error(message), { statusCode });

async function configuration(): Promise<ServiceConfig | null> {
  try {
    const value = JSON.parse(await fs.readFile('/data/sftp-service.json', 'utf8')) as ServiceConfig;
    const url = new URL(value.apiUrl);
    if (url.protocol !== 'http:' || !url.hostname.endsWith('-sftp') || url.port !== '8080' || url.username || url.password || !value.admin || !value.secret || !Number.isInteger(value.port) || value.port < 1 || value.port > 65535 || !Array.isArray(value.publicIps) || value.publicIps.some(ip => isIP(ip) !== 4)) throw fail('SFTP service configuration is invalid');
    return value;
  } catch (error: any) { if (error.code === 'ENOENT') return null; throw fail('SFTP service configuration is unavailable'); }
}

export function sftpIdentity(server: GameServerRow, config: ServiceConfig) {
  if (!server.runtime_uuid || !/^[a-f0-9-]{32,36}$/i.test(server.runtime_uuid)) throw fail('Server identity is unavailable', 409);
  const ports = parseStoredPorts(server);
  // Never fall back to the node's public address or a wildcard binding.
  const host = [...(ports.udp || []), ...(ports.tcp || [])].map(p => p.hostIp).find(ip => ip && config.publicIps.includes(ip));
  const native = Boolean(nativeServerTemplate(server));
  const supported = parseStoredMounts(server).some(m => m.key === 'data');
  return { host: host || null, username: server.runtime_uuid, native, supported,
    directory: native ? '/serverfiles' : '/data',
    relative: `${server.id}/data${native ? '/serverfiles' : ''}` };
}

async function api(config: ServiceConfig, endpoint: string, method = 'GET', body?: unknown): Promise<any> {
  // Tokens are short-lived and never persisted or returned through the panel API.
  try {
    const tokenResponse = await fetch(`${config.apiUrl}/api/v2/token`, { headers: { Authorization: `Basic ${Buffer.from(`${config.admin}:${config.secret}`).toString('base64')}` }, signal: AbortSignal.timeout(5000) });
    if (!tokenResponse.ok) throw fail('Cannot authenticate to the SFTP service');
    const token = await tokenResponse.json() as { access_token: string };
    const response = await fetch(`${config.apiUrl}/api/v2${endpoint}`, { method, headers: { Authorization: `Bearer ${token.access_token}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(8000) });
    if (response.status === 404) return null;
    if (!response.ok) throw fail('SFTP service rejected the operation');
    return response.status === 204 ? {} : await response.json();
  } catch { throw fail('SFTP service is unavailable. Refresh its status before retrying.'); }
}

async function load(serverId: number) {
  const server = await serverRepository.findById(serverId);
  if (!server) throw fail('Server not found', 404);
  const config = await configuration();
  return { server, config };
}

export async function serverSftpStatus(serverId: number): Promise<SftpStatus> {
  const { server, config } = await load(serverId);
  const unavailable = (reason: string, enabled = false): SftpStatus => ({ available: false, enabled, host: null, port: null, username: null, directory: null, fingerprint: null, reason });
  if (!config) return unavailable('SFTP is not configured on this node. A dedicated game IP is required.');
  const identity = sftpIdentity(server, config);
  const account: RemoteUser | null = await api(config, `/users/${encodeURIComponent(identity.username)}`);
  if (!identity.supported) return unavailable('This server does not have a managed data directory. Disable any existing SFTP access before changing its storage.', account?.status === 1);
  if (!identity.host) return unavailable('SFTP requires an assigned game IP configured for SFTP on this node. Disable any existing access before changing its IP. The node management IP is never used.', account?.status === 1);
  return { available: true, enabled: account?.status === 1, host: identity.host, port: config.port, username: identity.username, directory: identity.directory, fingerprint: config.fingerprint };
}

const busy = new Set<number>();
export async function updateServerSftp(serverId: number, input: unknown): Promise<SftpStatus> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw fail('Expected an SFTP operation', 400);
  const body = input as Record<string, unknown>;
  if (!['enable', 'disable', 'rotate'].includes(String(body.action)) || Object.keys(body).some(k => k !== 'action')) throw fail('Invalid SFTP operation', 400);
  if (busy.has(serverId)) throw fail('Another SFTP operation is in progress', 409);
  busy.add(serverId);
  try {
    const { server, config } = await load(serverId);
    if (!config) throw fail('SFTP is not configured on this node', 409);
    const identity = sftpIdentity(server, config);
    const url = `/users/${encodeURIComponent(identity.username)}`;
    const current: RemoteUser | null = await api(config, url);
    if (body.action === 'disable') {
      if (current) await api(config, `${url}?disconnect=1`, 'PUT', { ...current, status: 0, public_keys: [] });
      return serverSftpStatus(serverId);
    }
    if (!identity.supported || !identity.host) throw fail('Assign a dedicated game IP with SFTP support first', 409);
    if (body.action === 'rotate' && current?.status !== 1) throw fail('Enable SFTP before rotating its password', 409);
    const root = getServerStoragePaths(server.id).serverRoot;
    const target = path.join(root, 'data', ...(identity.native ? ['serverfiles'] : []));
    const actual = await fs.realpath(target);
    if (actual !== path.resolve(target)) throw fail('SFTP requires a real server directory without symlink parents', 409);
    const stat = await fs.stat(actual);
    if (!stat.isDirectory() || stat.uid !== 1000 || stat.gid !== 1000) throw fail('The game directory must be owned by the managed game user (1000:1000)', 409);
    const password = randomBytes(24).toString('base64url');
    const protectedPaths = parseStoredMounts(server).filter(m => m.shared && m.containerPath.startsWith('/data/serverfiles/')).map(m => m.containerPath.slice('/data/serverfiles'.length));
    const permissions: Record<string, string[]> = { '/': ['list', 'download', 'upload', 'overwrite', 'delete_files', 'delete_dirs', 'rename', 'create_dirs', 'chtimes'] };
    for (const folder of protectedPaths) permissions[folder] = [];
    const account = { username: identity.username, status: 1, password, home_dir: `/servers/${identity.relative}`, uid: 1000, gid: 1000, max_sessions: 8,
      permissions,
      filesystem: { provider: 0 }, public_keys: [], filters: { denied_protocols: ['FTP', 'DAV', 'HTTP'], allow_api_key_auth: false,
        ...(protectedPaths.length ? {file_patterns:[{path:'/',denied_patterns:['.eserv-shared-files.json'],deny_policy:1}]} : {}) } };
    await api(config, current ? `${url}?disconnect=1` : '/users', current ? 'PUT' : 'POST', account);
    const state = await serverSftpStatus(serverId);
    if (!state.enabled) throw fail('SFTP activation could not be confirmed');
    return { ...state, password };
  } finally { busy.delete(serverId); }
}

export async function revokeServerSftp(server: GameServerRow): Promise<void> {
  const config = await configuration();
  if (!config || !server.runtime_uuid) return;
  // Revoke and disconnect before any server files or identity are removed.
  const url = `/users/${encodeURIComponent(server.runtime_uuid)}`;
  const current = await api(config, url);
  if (current) {
    await api(config, `${url}?disconnect=1`, 'PUT', { ...current, status: 0, public_keys: [] });
    await api(config, url, 'DELETE');
  }
}
