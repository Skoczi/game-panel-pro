import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { ApiProvisionStore, validateProvisionInput } from '../src/services/apiProvisioning.js';
import { validProvisionPolicy } from '../src/services/apiTokens.js';
const policy = { nodeIds: ['local'], templateIds: ['native-cs16'], maxServers: 2, maxCpu: 2, maxMemoryMb: 2048 };
const token: any = { id: 'token', ownerId: 1, provisioning: policy };
const input = { nodeId: 'local', templateId: 'native-cs16', templateVersion: 1, name: 'DD2', bindings: [], resourceLimits: { cpu: 1, memoryMb: 1024 } };
test('provisioning rejects raw commands, unbounded resources and selections outside policy', () => {
    assert(validProvisionPolicy(policy));
    assert(!validProvisionPolicy({ ...policy, nodeIds: ['https://evil.example'] }));
    assert.equal(validateProvisionInput(token, input).name, 'DD2');
    for (const body of [{ ...input, startup: 'id' }, { ...input, nodeId: 'other' }, { ...input, templateId: 'other' }, { ...input, resourceLimits: {} }, { ...input, resourceLimits: { cpu: 4, memoryMb: 1024 } }, { ...input, resourceLimits: { cpu: 1, memoryMb: 1024, cpuSet: [0] } }, { ...input, startAfterInstall: true }]) assert.throws(() => validateProvisionInput(token, body));
});
test('concurrent admissions enforce budget, canonical replay, conflict and restart safety', async () => {
    const db = new DatabaseSync(':memory:');
    const adapter = { exec: async (s: string) => db.exec(s), run: async (s: string, ...v: any[]) => db.prepare(s).run(...v), get: async (s: string, ...v: any[]) => db.prepare(s).get(...v), all: async (s: string, ...v: any[]) => db.prepare(s).all(...v) };
    const store = new ApiProvisionStore(adapter as any); await store.initialize();
    try {
        const [a,b] = await Promise.all([store.admit(token, 'first_install_key_001', input), store.admit(token, 'first_install_key_001', { resourceLimits: { memoryMb: 1024, cpu: 1 }, ...input })]);
        assert.equal(a.row.id, b.row.id); assert.equal(Number(a.fresh) + Number(b.fresh), 1);
        await assert.rejects(store.admit(token, 'first_install_key_001', { ...input, name: 'different' }));
        const admissions = await Promise.allSettled([store.admit(token, 'second_install_key_02', input), store.admit(token, 'third_install_key_003', input)]);
        assert.equal(admissions.filter(a => a.status === 'fulfilled').length, 1);
        await store.initialize();
        assert.equal((await store.get(a.row.id))!.state, 'uncertain');
        assert.equal((await store.admit(token, 'first_install_key_001', input)).fresh, false);
        await store.attach(a.row.id, 101, 'a'.repeat(32), 'fleet-id');
        assert.equal((await store.get(a.row.id))!.server_id, 'fleet-id');
        assert.equal((await store.list(token.id)).length, 2);
    } finally { db.close(); }
});
