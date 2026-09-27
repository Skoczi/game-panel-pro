import { createHash, randomUUID } from 'node:crypto';
import type { Database } from 'sqlite';
import type { ApiToken } from './apiTokens.js';
export const apiFail = (statusCode: number, message: string): never => { throw Object.assign(new Error(message), { statusCode }); };
export function canonical(value: any): string {
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
    return JSON.stringify(value);
}
export type ProvisionRow = { id: string; token_id: string; owner_id: number; node_id: string; request_key: string; fingerprint: string; state: string; runtime_id: number | null; runtime_key: string | null; server_id: string | null; created_at: number };
export class ApiProvisionStore {
    constructor(private db: Database) {}
    async initialize() {
        await this.db.exec(`CREATE TABLE IF NOT EXISTS api_provisions (
            id TEXT PRIMARY KEY, token_id TEXT NOT NULL, owner_id INTEGER NOT NULL, node_id TEXT NOT NULL,
            request_key TEXT NOT NULL, fingerprint TEXT NOT NULL, state TEXT NOT NULL,
            runtime_id INTEGER, runtime_key TEXT, server_id TEXT, created_at INTEGER NOT NULL,
            UNIQUE(token_id,request_key)); UPDATE api_provisions SET state='uncertain' WHERE state='dispatching'`);
    }
    async admit(token: ApiToken, key: string, input: any) {
        if (!/^[A-Za-z0-9_-]{16,128}$/.test(key)) apiFail(400, 'Provide an Idempotency-Key of 16–128 letters, digits, hyphens or underscores');
        const fingerprint = createHash('sha256').update(canonical(input)).digest('hex');
        const id = randomUUID();
        // One statement enforces the lifetime creation budget, including pending and ambiguous requests.
        const result = await this.db.run(`INSERT OR IGNORE INTO api_provisions(id,token_id,owner_id,node_id,request_key,fingerprint,state,created_at)
            SELECT ?,?,?,?,?,?,'dispatching',? WHERE (SELECT COUNT(*) FROM api_provisions WHERE token_id=?) < ?`,
            id, token.id, token.ownerId, input.nodeId, key, fingerprint, Date.now(), token.id, token.provisioning!.maxServers);
        const row = await this.db.get<ProvisionRow>('SELECT * FROM api_provisions WHERE token_id=? AND request_key=?', token.id, key);
        if (!row) apiFail(409, 'Token provisioning budget exhausted');
        if (row!.fingerprint !== fingerprint) apiFail(409, 'Idempotency key belongs to a different request');
        return { row: row!, fresh: result.changes === 1 };
    }
    async attach(id: string, runtimeId: number, runtimeKey: string, serverId: string) {
        await this.db.run("UPDATE api_provisions SET state='accepted',runtime_id=?,runtime_key=?,server_id=? WHERE id=?", runtimeId, runtimeKey, serverId, id);
    }
    async uncertain(id: string) { await this.db.run("UPDATE api_provisions SET state='uncertain' WHERE id=? AND state='dispatching'", id); }
    get(id: string) { return this.db.get<ProvisionRow>('SELECT * FROM api_provisions WHERE id=?', id); }
    list(tokenId: string) { return this.db.all<ProvisionRow[]>('SELECT * FROM api_provisions WHERE token_id=? ORDER BY created_at DESC,id', tokenId); }
}
export function validateProvisionInput(token: ApiToken, input: any) {
    const p = token.provisioning;
    if (!p || !input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(k => !['nodeId','templateId','templateVersion','name','bindings','variables','resourceLimits'].includes(k))) apiFail(400, 'Use nodeId, templateId, templateVersion, name, bindings, variables and resourceLimits');
    if (!p!.nodeIds.includes(input.nodeId) || !p!.templateIds.includes(input.templateId)) apiFail(403, 'Node or template is outside the token policy');
    if (!Number.isInteger(input.templateVersion) || input.templateVersion < 1 || typeof input.name !== 'string' || input.name.trim().length < 3 || input.name.trim().length > 50 || /[\x00-\x1f\x7f]/.test(input.name)) apiFail(400, 'Invalid template version or server name');
    const l = input.resourceLimits;
    if (!l || Object.keys(l).some(k => !['cpu','memoryMb'].includes(k)) || !Number.isFinite(l.cpu) || l.cpu < 0.1 || l.cpu > p!.maxCpu || !Number.isInteger(l.memoryMb) || l.memoryMb < 128 || l.memoryMb > p!.maxMemoryMb) apiFail(400, 'Explicit CPU and memory limits must fit the token policy');
    if (!Array.isArray(input.bindings) || input.bindings.length > 16 || (input.variables !== undefined && (!input.variables || typeof input.variables !== 'object' || Array.isArray(input.variables)))) apiFail(400, 'Invalid bindings or variables');
    return { ...input, name: input.name.trim(), variables: input.variables ?? {} };
}
