import { freshSummary, type RuntimeSummary } from '../services/apiServerDto.js';
import { Router, type Response, type ErrorRequestHandler } from 'express';
import type { ApiToken, ApiTokenStore } from '../services/apiTokens.js';
import { tokenAllows } from '../services/apiTokens.js';
import type { FleetRow } from '../fleet/store.js';
import { ApiRateLimit } from '../services/apiRateLimit.js';
import type { ApiOperationStore } from '../services/apiOperations.js';

type Owner = { userId: number; isRoot: boolean; enabled: boolean };
type Dependencies = {
    extension?: (router: ReturnType<typeof Router>) => void;
    store: () => ApiTokenStore;
    owner: (id: number) => Promise<Owner | null>;
    servers: () => Promise<FleetRow[]>;
    permissions: (server: FleetRow, owner: Owner) => Promise<string[] | null>;
    summary?: (server: FleetRow) => RuntimeSummary | null;
    availability?: (server: FleetRow) => Promise<{ available: boolean; node: { id: string; name: string; location: string | null } }>;
    detail?: (server: FleetRow, ownerId: number) => Promise<RuntimeSummary | null>;
    power?: (server: FleetRow, ownerId: number, operationId: string, action: 'start' | 'stop' | 'restart') => Promise<void>;
    powerEvent?: (event: { id: string; serverId: string; action: string; status: string }) => Promise<void>;
    resources?: (server: FleetRow, ownerId: number) => Promise<unknown>;
    backups?: (server: FleetRow, ownerId: number) => Promise<Array<{ name: string }>>;
    operations?: {
        store: () => ApiOperationStore;
        normalizeName: (name: unknown) => string;
        start: (server: FleetRow, ownerId: number, operationId: string, name: string) => Promise<string>;
        readJob: (server: FleetRow, ownerId: number, jobId: string) => Promise<{ status: string; startedAt: string | null; completedAt: string | null }>;
    };
};
function error(res: Response, status: number, code: string, message: string) {
    return res.status(status).json({ error: { code, message }, requestId: res.locals.requestId });
}
export const publicApiErrorHandler: ErrorRequestHandler = (cause, _req, res, _next) => {
    if (res.headersSent) { _next(cause); return; }
    const status = cause?.status === 413 ? 413 : cause?.status === 400 ? 400 : 500;
    res.setHeader('Cache-Control', 'no-store');
    error(res, status, status === 413 ? 'payload_too_large' : status === 400 ? 'invalid_request' : 'internal_error',
        status === 413 ? 'Request body exceeds the panel limit' : status === 400 ? 'Invalid JSON request body' : 'API request failed');
};
const matchesServer = (row: FleetRow, id: string) => row.id === id || (/^[1-9]\d*$/.test(id) && row.server_number === Number(id));

/** Deliberately separate from session authentication and internal runtime DTOs. */
export function publicApi(deps: Dependencies) {
    const router = Router();
    const sourceLimit = new ApiRateLimit(240), tokenLimit = new ApiRateLimit(120);
    router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
    router.use(async (req, res, next) => {
        try {
            const match = /^Bearer (gpp_[A-Za-z0-9_-]{43})$/.exec(req.headers.authorization || '');
            const token = match ? await deps.store().authenticate(match[1]) : null;
            const owner = token ? await deps.owner(token.ownerId) : null;
            if (!token || !owner?.enabled) {
                // Invalid credentials have a separate budget. Traffic through one
                // proxy must not exhaust unrelated authenticated integrations.
                const source = (req.ip || req.socket.remoteAddress || 'unknown').replace(/^::ffff:/, '');
                const rate = sourceLimit.take(source);
                if (!rate.allowed) {
                    res.setHeader('Retry-After', rate.retryAfterSeconds);
                    error(res, 429, 'rate_limited', 'Too many invalid API credentials'); return;
                }
                error(res, 401, 'unauthorized', 'Invalid or expired API token'); return;
            }
            const rate = tokenLimit.take(token.id);
            if (!rate.allowed) {
                res.setHeader('Retry-After', rate.retryAfterSeconds);
                error(res, 429, 'rate_limited', 'Too many requests for this token'); return;
            }
            res.locals.apiToken = token; res.locals.apiOwner = owner;
            next();
        } catch { error(res, 503, 'unavailable', 'API authentication unavailable'); }
    });
    deps.extension?.(router);
    router.get(['/servers', '/servers/:id'], async (req, res) => {
        const token = res.locals.apiToken as ApiToken, owner = res.locals.apiOwner as Owner;
        if (!token.scopes.includes('servers.read')) { error(res, 403, 'forbidden', 'Token requires servers.read'); return; }
        const detail = Boolean(req.params.id);
        const rawLimit = detail ? '1' : req.query.limit ?? '50', after = detail ? undefined : req.query.after;
        const sort = detail ? 'id' : req.query.sort ?? 'id';
        if (typeof rawLimit !== 'string' || !/^[1-9]\d?$|^100$/.test(rawLimit) ||
            (after !== undefined && (typeof after !== 'string' || !/^[0-9a-f-]{36}$/.test(after))) ||
            typeof sort !== 'string' || !['id', 'number', 'name', 'address'].includes(sort) ||
            ['search', 'status', 'game', 'node'].some(k => req.query[k] !== undefined && (typeof req.query[k] !== 'string' || String(req.query[k]).length > 128))) {
            error(res, 400, 'invalid_query', 'Invalid filter, sort, limit (1–100) or after cursor'); return;
        }
        try {
            const candidates = (await deps.servers()).filter(row => !row.missing && token.serverIds.includes(row.id) && (!detail || matchesServer(row, req.params.id)));
            const selected = [];
            for (const row of candidates) {
                const permissions = await deps.permissions(row, owner);
                if (!tokenAllows(token, row.id, 'servers.read', { enabled: owner.enabled, permissions })) continue;
                let state = await deps.availability?.(row) ?? { available: Date.now() - row.observed_at < 75000, node: { id: row.node_id, name: row.node_id, location: null } };
                let summary = deps.summary?.(row) ?? null;
                if (detail && state.available && deps.detail) {
                    try { summary = await deps.detail(row, owner.userId); }
                    catch { state = { ...state, available: false }; }
                }
                const status = state.available ? (detail ? summary?.runtimeStatus ?? row.status : row.status) : 'unknown';
                if (!detail && ((req.query.status && req.query.status !== status) || (req.query.node && req.query.node !== row.node_id) ||
                    (req.query.game && req.query.game !== row.catalog_id) || (req.query.search && !`${row.name} ${row.server_number} ${(summary?.ports ?? []).map(p => `${p.ip}:${p.port}`).join(' ')}`.toLowerCase().includes(String(req.query.search).toLowerCase())))) continue;
                const effective = token.scopes.filter(scope => tokenAllows(token, row.id, scope, { enabled: owner.enabled, permissions }));
                const resourceUsage = detail && effective.includes('resources.read') && state.available ? await deps.resources?.(row, owner.userId).catch(() => null) : undefined;
                selected.push({ ...(resourceUsage !== undefined ? { resourceUsage } : {}), id: row.id, number: row.server_number, name: row.name, provider: row.provider, catalogId: row.catalog_id,
                    status, observedAt: new Date(row.observed_at).toISOString(), available: state.available, stale: !state.available,
                    node: state.node, ...freshSummary(summary, state.available),
                    capabilities: { power: effective.includes('servers.power'), backupsRead: effective.includes('backups.read'), backupsCreate: effective.includes('backups.create'), membersRead: owner.isRoot && effective.includes('members.read'), membersWrite: owner.isRoot && effective.includes('members.write'), gameAdminsRead: effective.includes('game-admins.read') && /cs16|cstrike|rehlds/i.test(row.catalog_id || ''), gameAdminsWrite: effective.includes('game-admins.write') && /cs16|cstrike|rehlds/i.test(row.catalog_id || '') },
                    links: { self: `/api/v1/servers/${row.id}`, panel: `/s/${row.server_number}/console`, resources: `/api/v1/servers/${row.id}/resources` } });
            }
            selected.sort((a, b) => {
                let cmp = 0;
                if (sort === 'number') cmp = a.number - b.number;
                if (sort === 'name') cmp = a.name.localeCompare(b.name, 'en');
                if (sort === 'address') {
                    const x = a.ports?.[0], y = b.ports?.[0];
                    cmp = (x?.ip ?? '').localeCompare(y?.ip ?? '', 'en', { numeric: true }) || (x?.port ?? 0) - (y?.port ?? 0);
                }
                return cmp || a.id.localeCompare(b.id);
            });
            if (detail && !selected.length) { error(res, 404, 'not_found', 'Server not found'); return; }
            const offset = after ? selected.findIndex(r => r.id === after) + 1 : 0;
            if (after && offset === 0) { error(res, 400, 'invalid_cursor', 'Cursor no longer belongs to this result; restart pagination'); return; }
            await deps.store().markUsed(token.id);
            if (detail) { res.json({ data: selected[0], requestId: res.locals.requestId }); return; }
            const page = selected.slice(offset, offset + Number(rawLimit));
            res.json({ data: page, nextCursor: offset + page.length < selected.length ? page[page.length - 1].id : null, requestId: res.locals.requestId });
        } catch { error(res, 503, 'unavailable', 'Server inventory unavailable'); }
    });
    router.get('/servers/:id/resources', async (req, res) => {
        const token = res.locals.apiToken as ApiToken, owner = res.locals.apiOwner as Owner;
        if (!token.scopes.includes('resources.read')) { error(res, 403, 'forbidden', 'Token requires resources.read'); return; }
        try {
            const row = (await deps.servers()).find(row => matchesServer(row, req.params.id) && !row.missing);
            if (!row || !token.serverIds.includes(row.id) ||
                !tokenAllows(token, row.id, 'resources.read', { enabled: owner.enabled, permissions: await deps.permissions(row, owner) })) {
                error(res, 404, 'not_found', 'Server not found'); return;
            }
            if (!deps.resources) throw new Error('Resources unavailable');
            const data = await deps.resources(row, owner.userId);
            await deps.store().markUsed(token.id);
            res.json({ data, requestId: res.locals.requestId });
        } catch { error(res, 503, 'unavailable', 'Server resources unavailable; verify node connection and agent version'); }
    });
    router.get('/servers/:id/backups', async (req, res) => {
        const token = res.locals.apiToken as ApiToken, owner = res.locals.apiOwner as Owner;
        if (!token.scopes.includes('backups.read')) { error(res, 403, 'forbidden', 'Token requires backups.read'); return; }
        const rawLimit = req.query.limit ?? '50', after = req.query.after;
        if (typeof rawLimit !== 'string' || !/^[1-9]\d?$|^100$/.test(rawLimit) ||
            (after !== undefined && (typeof after !== 'string' || after.length > 255))) {
            error(res, 400, 'invalid_query', 'Use limit 1–100 and a backup name for after'); return;
        }
        try {
            const row = (await deps.servers()).find(row => matchesServer(row, req.params.id) && !row.missing);
            if (!row || !token.serverIds.includes(row.id) ||
                !tokenAllows(token, row.id, 'backups.read', { enabled: owner.enabled, permissions: await deps.permissions(row, owner) })) {
                error(res, 404, 'not_found', 'Server not found'); return;
            }
            if (!deps.backups) throw new Error('Backups unavailable');
            const entries = (await deps.backups(row, owner.userId)).filter(entry => !after || entry.name > after);
            const page = entries.slice(0, Number(rawLimit));
            await deps.store().markUsed(token.id);
            res.json({ data: page, nextCursor: entries.length > page.length ? page[page.length - 1].name : null,
                requestId: res.locals.requestId });
        } catch { error(res, 503, 'unavailable', 'Backup inventory unavailable'); }
    });
    router.post('/servers/:id/backups', async (req, res) => {
        const token = res.locals.apiToken as ApiToken, owner = res.locals.apiOwner as Owner, operations = deps.operations;
        if (!token.scopes.includes('backups.create')) { error(res, 403, 'forbidden', 'Token requires backups.create'); return; }
        const key = req.headers['idempotency-key'];
        if (typeof key !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(key) ||
            !req.body || typeof req.body !== 'object' || Array.isArray(req.body) || Object.keys(req.body).some(key => key !== 'name')) {
            error(res, 400, 'invalid_request', 'Provide a JSON object with optional name and an Idempotency-Key of 16–128 letters, digits, hyphens or underscores'); return;
        }
        if (!operations) { error(res, 503, 'unavailable', 'Backup API unavailable'); return; }
        let name: string;
        try { name = operations.normalizeName(req.body.name); }
        catch { error(res, 400, 'invalid_name', 'Use a backup name of up to 64 letters, numbers, spaces, dots, hyphens or underscores, starting with a letter or number'); return; }
        try {
            const row = (await deps.servers()).find(row => matchesServer(row, req.params.id) && !row.missing);
            if (!row || !token.serverIds.includes(row.id) ||
                !tokenAllows(token, row.id, 'backups.create', { enabled: owner.enabled, permissions: await deps.permissions(row, owner) })) {
                error(res, 404, 'not_found', 'Server not found'); return;
            }
            const admission = await operations.store().admit({ tokenId: token.id, ownerId: owner.userId, serverId: row.id,
                nodeId: row.node_id, runtimeId: row.runtime_id, runtimeKey: row.runtime_key, key, name });
            const operation = admission.operation;
            if (admission.conflict) { error(res, 409, 'idempotency_conflict', 'This key already belongs to a different backup request'); return; }
            res.setHeader('Location', `/api/v1/operations/${operation.id}`);
            if (!admission.fresh) res.setHeader('Idempotency-Replayed', 'true');
            if (admission.fresh) {
                try {
                    const jobId = await operations.start(row, owner.userId, operation.id, name);
                    await operations.store().started(operation.id, jobId);
                    operation.state = 'started';
                } catch {
                    await operations.store().uncertain(operation.id);
                    operation.state = 'uncertain';
                }
            }
            await deps.store().markUsed(token.id);
            const data = { id: operation.id, serverId: operation.server_id,
                status: operation.state === 'started' ? 'accepted' : operation.state === 'admitted' ? 'dispatching' : 'uncertain',
                createdAt: new Date(operation.created_at).toISOString() };
            res.status(operation.state === 'uncertain' ? 409 : 202).json({ data, requestId: res.locals.requestId,
                ...(operation.state === 'uncertain' ? { error: { code: 'outcome_uncertain', message: 'Dispatch was not confirmed. Inspect panel backup history before submitting a new key. This request will not be dispatched again.' } } : {}) });
        } catch { error(res, 503, 'unavailable', 'Backup admission unavailable. Retry only with the same Idempotency-Key.'); }
    });
    router.post('/servers/:id/power', async (req, res) => {
        const token = res.locals.apiToken as ApiToken, owner = res.locals.apiOwner as Owner, operations = deps.operations;
        if (!token.scopes.includes('servers.power')) { error(res, 403, 'forbidden', 'Token requires servers.power'); return; }
        const key = req.headers['idempotency-key'], action = req.body?.action;
        if (typeof key !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(key) || !req.body || Array.isArray(req.body) || Object.keys(req.body).some(k => k !== 'action') || !['start', 'stop', 'restart'].includes(action)) {
            error(res, 400, 'invalid_request', 'Provide action start, stop or restart and a stable Idempotency-Key'); return;
        }
        if (!operations || !deps.power) { error(res, 503, 'unavailable', 'Power API unavailable'); return; }
        try {
            const row = (await deps.servers()).find(r => matchesServer(r, req.params.id) && !r.missing);
            if (!row || !tokenAllows(token, row.id, 'servers.power', { enabled: owner.enabled, permissions: await deps.permissions(row, owner) })) { error(res, 404, 'not_found', 'Server not found'); return; }
            const admission = await operations.store().admit({ tokenId: token.id, ownerId: owner.userId, serverId: row.id, nodeId: row.node_id, runtimeId: row.runtime_id, runtimeKey: row.runtime_key, key, name: '', kind: `power.${action as 'start' | 'stop' | 'restart'}` });
            const op = admission.operation;
            if (admission.conflict) { error(res, 409, 'idempotency_conflict', 'This key belongs to a different operation'); return; }
            res.setHeader('Location', `/api/v1/operations/${op.id}`);
            if (!admission.fresh) res.setHeader('Idempotency-Replayed', 'true');
            if (admission.fresh) void (async () => {
                let status = 'uncertain';
                try { await deps.power!(row, owner.userId, op.id, action); await operations.store().started(op.id, 'power.completed'); status = 'completed'; }
                catch { await operations.store().uncertain(op.id); }
                await deps.powerEvent?.({ id: op.id, serverId: row.id, action, status });
            })().catch(() => console.error('API power outcome could not be persisted', op.id));
            await deps.store().markUsed(token.id);
            res.status(op.state === 'uncertain' ? 409 : 202).json({ data: { id: op.id, serverId: row.id, action, status: op.state === 'started' ? 'completed' : op.state === 'admitted' ? 'dispatching' : 'uncertain', createdAt: new Date(op.created_at).toISOString() }, requestId: res.locals.requestId,
                ...(op.state === 'uncertain' ? { error: { code: 'outcome_uncertain', message: 'Power result was not confirmed. Check server state and Activity before issuing a new key. This operation will not be repeated.' } } : {}) });
        } catch { error(res, 503, 'unavailable', 'Power admission unavailable; retry only with the same Idempotency-Key'); }
    });
    router.get('/operations/:id', async (req, res) => {
        const token = res.locals.apiToken as ApiToken, owner = res.locals.apiOwner as Owner, operations = deps.operations;
        if (!token.scopes.includes('operations.read')) { error(res, 403, 'forbidden', 'Token requires operations.read'); return; }
        if (!operations) { error(res, 503, 'unavailable', 'Operations API unavailable'); return; }
        try {
            const operation = await operations.store().get(req.params.id);
            const row = operation && operation.owner_id === owner.userId
                ? (await deps.servers()).find(row => row.id === operation.server_id && !row.missing) : undefined;
            const permissions = row ? await deps.permissions(row, owner) : null;
            if (!row || !operation || !permissions?.includes(operation.kind?.startsWith('power.') ? 'server.power' : 'backups.create') ||
                !tokenAllows(token, row.id, 'operations.read', { enabled: owner.enabled, permissions })) {
                error(res, 404, 'not_found', 'Operation not found'); return;
            }
            if (row.node_id !== operation.node_id || row.runtime_key !== operation.runtime_key || row.runtime_id !== operation.runtime_id) {
                error(res, 409, 'runtime_changed', 'The operation belongs to an earlier runtime placement'); return;
            }
            const job = operation.state === 'started' && operation.job_id ? (operation.kind?.startsWith('power.') ? { status: 'completed', startedAt: null, completedAt: null } : await operations.readJob(row, owner.userId, operation.job_id)) : null;
            await deps.store().markUsed(token.id);
            res.json({ data: { id: operation.id, serverId: row.id, createdAt: new Date(operation.created_at).toISOString(),
                status: job?.status ?? (operation.state === 'admitted' ? 'dispatching' : 'uncertain'),
                startedAt: job?.startedAt ?? null, completedAt: job?.completedAt ?? null }, requestId: res.locals.requestId });
        } catch { error(res, 503, 'unavailable', 'Operation status unavailable'); }
    });
    router.use((_req, res) => { error(res, 404, 'not_found', 'API endpoint not found'); });
    return router;
}
