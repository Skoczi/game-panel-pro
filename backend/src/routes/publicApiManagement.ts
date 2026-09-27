import type { Router, Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import { getDatabase } from '../database/init.js';
import { userRepository, serverMemberRepository } from '../database/index.js';
import { fleet, fleetPermissions } from '../fleet/control.js';
import { nodes } from '../nodes/control.js';
import { TemplateStore } from '../templates/store.js';
import { issueTemplateTicket } from '../templates/tickets.js';
import { getConfig } from '../config.js';
import { apiFail, validateProvisionInput, type ApiProvisionStore, type ProvisionRow } from '../services/apiProvisioning.js';
import { provisionNative, provisionReceipt } from '../services/apiProvisionRuntime.js';
import { apiNodeRequest } from '../services/apiNodeRequest.js';
import { globalSettings } from '../services/globalSettings.js';
import { type ApiScope, type ApiToken, type ApiTokenStore, tokenAllows } from '../services/apiTokens.js';
import { hashPassword } from '../utils/auth.js';
import { accountRole } from '../utils/accountRole.js';
import { readGameAdmins, writeGameAdmin } from '../services/rehldsContent.js';
import { enterServerMutation } from '../services/nativeOperationLock.js';
import { steamId } from '../services/gameAdminEntries.js';
import type { ApiOperationStore } from '../services/apiOperations.js';

export const API_MEMBER_PRESETS = {
    viewer: ['container.logs.read'],
    'console-operator': ['container.logs.read', 'server.command.send', 'server.power'],
    'server-admin': ['server.players.read', 'container.logs.read', 'server.command.send', 'server.power', 'fs.read', 'fs.write', 'backups.read', 'backups.create', 'backups.restore', 'backups.download', 'backups.rename', 'backups.delete', 'scheduledtasks.read', 'scheduledtasks.write', 'sftp.manage'],
} as const;
function requireScope(res: Response, scope: ApiScope, admin = false) {
    const token = res.locals.apiToken as ApiToken;
    if (!token.scopes.includes(scope) || (admin && !res.locals.apiOwner.isRoot)) apiFail(403, `This operation requires ${scope}${admin ? ' and a panel administrator' : ''}`);
    return token;
}
const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => {
    void fn(req, res, next).catch(e => { const status = [400,403,404,409,412,428].includes(e.statusCode) ? e.statusCode : 503;
        res.status(status).json({ error: { code: status === 503 ? 'unavailable' : status === 409 ? 'conflict' : status === 404 ? 'not_found' : status === 403 ? 'forbidden' : 'invalid_request', message: status === 503 ? 'API operation unavailable; inspect operation state before retrying' : e.message }, requestId: res.locals.requestId }); });
};
const send = (res: Response, data: unknown, status = 200) => res.status(status).json({ data, requestId: res.locals.requestId });
async function accessible(req: Request, res: Response, scope: ApiScope, admin = false) {
    const token = requireScope(res, scope, admin);
    const row = /^[1-9]\d*$/.test(req.params.id) ? await fleet().getByNumber(Number(req.params.id)) : await fleet().get(req.params.id);
    if (!row || row.missing || !tokenAllows(token, row.id, scope, { enabled: res.locals.apiOwner.enabled, permissions: await fleetPermissions(row, res.locals.apiOwner) })) apiFail(404, 'Server not found');
    return row!;
}
export function registerPublicManagement(router: Router, deps: { tokens: () => ApiTokenStore; provisions: () => ApiProvisionStore; operations: () => ApiOperationStore }) {
    async function dispatched(row: ProvisionRow, receipt: any) {
        if (!receipt || !Number.isSafeInteger(receipt.id) || !/^[a-f0-9]{32}$/.test(receipt.runtimeKey)) return row;
        if (row.runtime_key && (row.runtime_key !== receipt.runtimeKey || row.runtime_id !== receipt.id)) apiFail(409, 'Installation runtime identity changed');
        await fleet().observe(row.node_id, [receipt], row.node_id !== 'local', false);
        const server = (await fleet().list()).find(s => s.node_id === row.node_id && s.runtime_key === receipt.runtimeKey);
        if (!server) throw new Error('Server registration unavailable');
        await deps.tokens().attachServer(row.token_id, server.id);
        await deps.provisions().attach(row.id, receipt.id, receipt.runtimeKey, server.id);
        return (await deps.provisions().get(row.id))!;
    }
    async function receipt(row: ProvisionRow, actorId: number) {
        return row.node_id === 'local' ? provisionReceipt(row.id) : apiNodeRequest(row.node_id, `/api/runtime-provisioning/${row.id}`, actorId);
    }
    router.get('/templates', wrap(async (_req, res) => {
        const token = requireScope(res, 'templates.read', true);
        const rows = await new TemplateStore(await getDatabase()).list();
        send(res, rows.filter(t => t.status === 'published' && t.document.lifecycle && (!token.provisioning || token.provisioning.templateIds.includes(t.id))).map(t => ({
            id: t.id, version: t.version, name: t.document.name, game: t.document.runtime.catalogId, architectures: t.document.runtime.architectures,
            ports: t.document.ports.map((p: any) => ({ key: p.key, label: p.label, protocol: p.protocol, suggested: p.suggested, ...(p.sameAs ? { sameAs: p.sameAs } : {}) })),
            variables: t.document.variables.map((v: any) => ({ key: v.key, label: v.label, type: v.type, required: v.required, secret: v.secret, ...(!v.secret ? { default: v.default } : {}) })),
            startAfterInstall: false,
        })));
    }));
    router.get('/nodes', wrap(async (_req, res) => {
        const token = requireScope(res, 'nodes.read', true);
        const all = [{ id: 'local', name: 'Local', location: 'Panel host', enabled: 1 }, ...await nodes().list()];
        send(res, all.filter(n => n.enabled && (!token.provisioning || token.provisioning.nodeIds.includes(n.id))).map(n => ({ id: n.id, name: n.name, location: n.location })));
    }));
    router.get('/nodes/:id/allocations', wrap(async (req, res) => {
        const token = requireScope(res, 'nodes.read', true);
        if (token.provisioning && !token.provisioning.nodeIds.includes(req.params.id)) apiFail(404, 'Node not found');
        const data = req.params.id === 'local' ? { allocations: globalSettings().snapshot().network.allocations } : await apiNodeRequest(req.params.id, '/api/runtime-provisioning/allocations', token.ownerId);
        send(res, data.allocations.map((a: any) => ({ ip: a.ip, tcp: a.tcp, udp: a.udp })));
    }));
    for (const plan of [true, false]) router.post(plan ? '/servers/plan' : '/servers', wrap(async (req, res) => {
        const token = requireScope(res, 'servers.create', true);
        const input = validateProvisionInput(token, req.body);
        const template = await new TemplateStore(await getDatabase()).get(input.templateId, input.templateVersion);
        if (template.status !== 'published' || !template.document.lifecycle) apiFail(409, 'Select a published Native template');
        let key = getConfig().jwtSecret;
        if (input.nodeId !== 'local') {
            const node = await nodes().get(input.nodeId);
            if (!node?.enabled || !node.key_encrypted) apiFail(409, 'Node unavailable');
            key = nodes().key(node!);
        }
        const ticket = issueTemplateTicket({ id: template.id, version: template.version, hash: template.hash, document: template.document }, key, input.nodeId);
        if (plan) {
            const body = { ...input, ticket };
            send(res, input.nodeId === 'local' ? await provisionNative(body, `api-user:${token.ownerId}`, true) : await apiNodeRequest(input.nodeId, '/api/runtime-provisioning/plan', token.ownerId, 'POST', body, randomUUID())); return;
        }
        const admission = await deps.provisions().admit(token, String(req.headers['idempotency-key'] || ''), input);
        let row = admission.row;
        res.setHeader('Location', `/api/v1/operations/${row.id}`);
        if (!admission.fresh) res.setHeader('Idempotency-Replayed', 'true');
        if (admission.fresh) {
            try {
                const body = { ...input, ticket, operationId: row.id };
                const value = input.nodeId === 'local' ? await provisionNative(body, `api-user:${token.ownerId}`) : await apiNodeRequest(input.nodeId, '/api/runtime-provisioning/install', token.ownerId, 'POST', body, row.id);
                row = await dispatched(row, value);
            } catch { await deps.provisions().uncertain(row.id); row = (await deps.provisions().get(row.id))!; }
        }
        if (row.state === 'uncertain') { try { row = await dispatched(row, await receipt(row, token.ownerId)); } catch { /* GET operation can reconcile later. */ } }
        await deps.tokens().markUsed(token.id);
        send(res, { id: row.id, kind: 'server.install', status: row.state, serverId: row.server_id, startAfterInstall: false }, row.state === 'uncertain' ? 409 : 202);
    }));
    router.get('/operations/:id', wrap(async (req, res, next) => {
        const token = requireScope(res, 'operations.read');
        let row = await deps.provisions().get(req.params.id);
        if (!row) { next(); return; }
        if (row.token_id !== token.id || !res.locals.apiOwner.isRoot || !token.provisioning?.nodeIds.includes(row.node_id)) apiFail(404, 'Operation not found');
        const value = await receipt(row, token.ownerId);
        if (value) row = await dispatched(row, value);
        const install = value?.installation;
        send(res, { id: row.id, kind: 'server.install', serverId: row.server_id, number: row.runtime_id,
            status: install?.status === 'completed' ? 'completed' : install?.status === 'failed' ? 'failed' : value ? 'running' : row.state,
            stage: install?.status ?? null, percent: install?.percent ?? null, createdAt: new Date(row.created_at).toISOString(), completedAt: install?.completedAt ?? null,
            links: { server: row.server_id ? `/api/v1/servers/${row.server_id}` : null } });
    }));
    router.get('/operations', wrap(async (req, res) => {
        const token = requireScope(res, 'operations.read');
        const limit = Number(req.query.limit ?? 50);
        if (!Number.isInteger(limit) || limit < 1 || limit > 100 || (req.query.after !== undefined && typeof req.query.after !== 'string')) apiFail(400, 'Invalid limit or cursor');
        const existing = await deps.operations().list(token.id);
        const visible = [];
        for (const o of existing) {
            const s = await fleet().get(o.server_id);
            const current = s ? await fleetPermissions(s, res.locals.apiOwner) : null;
            if (s && !s.missing && current?.includes(o.kind.startsWith('power.') ? 'server.power' : 'backups.create') && tokenAllows(token, s.id, 'operations.read', { enabled: true, permissions: current })) visible.push({ id: o.id, kind: o.kind, status: o.state, serverId: s.id, createdAt: o.created_at });
        }
        if (res.locals.apiOwner.isRoot) for (const o of await deps.provisions().list(token.id)) if (token.provisioning?.nodeIds.includes(o.node_id)) visible.push({ id: o.id, kind: 'server.install', status: o.state, serverId: o.server_id, createdAt: o.created_at });
        visible.sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id));
        const offset = req.query.after ? visible.findIndex(o => o.id === req.query.after) + 1 : 0;
        if (req.query.after && !offset) apiFail(400, 'Invalid cursor');
        const page = visible.slice(offset, offset + limit);
        res.json({ data: page.map(o => ({ ...o, createdAt: new Date(o.createdAt).toISOString(), links: { self: `/api/v1/operations/${o.id}` } })), nextCursor: offset + page.length < visible.length ? page[page.length - 1].id : null, requestId: res.locals.requestId });
    }));
    router.get('/users', wrap(async (req, res) => {
        requireScope(res, 'users.read', true);
        const limit = Number(req.query.limit ?? 50), after = Number(req.query.after ?? 0);
        if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(after) || after < 0) apiFail(400, 'Invalid pagination');
        const all = (await userRepository.list()).filter(u => u.id > after).sort((a, b) => a.id - b.id);
        const page = all.slice(0, limit);
        res.json({ data: page.map(u => ({ id: u.id, username: u.username, role: accountRole(u), enabled: !!u.is_enabled })), nextCursor: all.length > page.length ? String(page[page.length - 1].id) : null, requestId: res.locals.requestId });
    }));
    router.post('/users', wrap(async (req, res) => {
        const token = requireScope(res, 'users.create', true), b = req.body;
        if (!b || typeof b !== 'object' || Array.isArray(b) || Object.keys(b).some(k => !['username','password'].includes(k)) || typeof b.username !== 'string' || !/^[A-Za-z0-9_.-]{1,12}$/.test(b.username) || typeof b.password !== 'string' || b.password.length < 8 || b.password.length > 128) apiFail(400, 'Provide username (1–12 characters) and password (8–128 characters)');
        if (await userRepository.findByUsername(b.username)) apiFail(409, 'Username already exists');
        const id = await userRepository.create(b.username, await hashPassword(b.password));
        await deps.tokens().markUsed(token.id);
        send(res, { id, username: b.username, role: 'user', enabled: true }, 201);
    }));
    router.get('/servers/:id/members', wrap(async (req, res) => {
        const s = await accessible(req, res, 'members.read', true);
        const list = s.node_id === 'local' ? await serverMemberRepository.listByServer(s.runtime_id) : await fleet().grants(s.id);
        send(res, { members: list.map(m => ({ userId: m.user_id, username: m.username, permissions: JSON.parse(m.permissions_json) })), presets: API_MEMBER_PRESETS });
    }));
    for (const method of ['put', 'delete'] as const) router[method]('/servers/:id/members/:userId', wrap(async (req, res) => {
        const s = await accessible(req, res, 'members.write', true), id = Number(req.params.userId);
        if (!Number.isSafeInteger(id) || id < 1) apiFail(400, 'Invalid user ID');
        const user = await userRepository.findById(id);
        if (!user) apiFail(404, 'User not found');
        if (accountRole(user!) !== 'user') apiFail(403, 'Panel administrator access cannot be changed through server membership');
        const permissions = method === 'put' ? API_MEMBER_PRESETS[req.body?.preset as keyof typeof API_MEMBER_PRESETS] : [];
        if (!Array.isArray(permissions) || (method === 'put' && Object.keys(req.body).some(k => k !== 'preset'))) apiFail(400, 'Select viewer, console-operator or server-admin preset');
        const actor = res.locals.apiOwner.userId;
        if (s.node_id === 'local') {
            if (method === 'delete') await serverMemberRepository.delete(s.runtime_id, id);
            else if (await serverMemberRepository.find(s.runtime_id, id)) await serverMemberRepository.update(s.runtime_id, id, [...permissions]);
            else await serverMemberRepository.create(s.runtime_id, id, [...permissions]);
            await fleet().audit(s.id, actor, `api:${method}:member:${id}`);
        } else if (method === 'delete') await fleet().revoke(s.id, id, actor);
        else await fleet().grant(s.id, id, [...permissions], actor);
        send(res, { userId: id, permissions });
    }));
    for (const method of ['get', 'put', 'delete'] as const) router[method](method === 'get' ? '/servers/:id/game-admins' : '/servers/:id/game-admins/:steamId', wrap(async (req, res) => {
        const s = await accessible(req, res, method === 'get' ? 'game-admins.read' : 'game-admins.write');
        const actorId = res.locals.apiOwner.userId, write = method !== 'get';
        const version = String(req.headers['if-match'] || '').replace(/^"|"$/g, '');
        if (write && !/^[a-f0-9]{64}$/.test(version)) apiFail(428, 'Provide the current ETag in If-Match');
        if (write && (!steamId.test(req.params.steamId) || (method === 'put' && (!req.body || Object.keys(req.body).some(k => k !== 'flags') || !/^[a-y]{1,25}$/.test(req.body.flags))))) apiFail(400, 'Invalid Steam ID or flags');
        const body = { steamId: req.params.steamId, flags: method === 'delete' ? null : req.body?.flags, version: `"${version}"` };
        let data: any;
        if (s.node_id === 'local') { const release = write ? enterServerMutation(s.runtime_id) : () => {}; try { data = write ? await writeGameAdmin(s.runtime_id, body, `api-user:${actorId}`) : await readGameAdmins(s.runtime_id); } finally { release(); } }
        else data = await apiNodeRequest(s.node_id, `/api/servers/${s.runtime_id}/game-admins`, actorId, write ? 'PUT' : 'GET', write ? body : undefined, write ? randomUUID() : undefined,
            { actorId, serverId: s.runtime_id, runtimeKey: s.runtime_key, permissions: write ? ['fs.read','fs.write'] : ['fs.read'] });
        res.setHeader('ETag', data.version);
        send(res, data);
    }));
}
