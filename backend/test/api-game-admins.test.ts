import { test } from 'node:test';
import assert from 'node:assert/strict';
import { editGameAdmin, gameAdminEntries } from '../src/services/gameAdminEntries.js';
import { runtimeSummary, freshSummary } from '../src/services/apiServerDto.js';
test('game admin editing preserves custom/password entries without exposing their secrets', () => {
    const content = '; Keep this comment\n"Nick" "private-password" "a" "a"\n"STEAM_0:1:123" "" "bc" "ce"\n';
    const value = gameAdminEntries(content);
    assert.deepEqual(value, { entries: [{ steamId: 'STEAM_0:1:123', flags: 'bc' }], unmanaged: 1 });
    const next = editGameAdmin(content, 'STEAM_0:1:456', 'abc');
    assert(next.includes('"Nick" "private-password" "a" "a"'));
    assert(next.includes('; Keep this comment'));
    assert.equal(gameAdminEntries(next).entries.length, 2);
    assert(!editGameAdmin(next, 'STEAM_0:1:123', null).includes('STEAM_0:1:123'));
    assert.throws(() => editGameAdmin('"STEAM_0:1:123" "password" "a" "a"', 'STEAM_0:1:123', 'a'));
    assert.throws(() => editGameAdmin(content, 'STEAM_0:1:123', 'z\ncommand'));
});
test('server summary whitelists data and suppresses stale game observations', () => {
    const s = runtimeSummary({ env: { PASSWORD: 'secret' }, runtimeKey: 'secret', mounts: ['/root'], providerMetadata: { template: { id: 'x', version: 1, document: { name: 'CS', lifecycle: { startup: 'secret' } } } },
        ports: { udp: [{ hostIp: '51.83.150.145', host: 27051, container: 27015 }] }, status: 'stopped', uptimeSeconds: 123,
        monitoring: { enabled: true, state: 'online', checkedAt: '2000-01-01T00:00:00Z', staleAfterSeconds: 75, info: { players: 6, maxPlayers: 16, map: 'de_dust2' }, error: 'secret' } });
    assert(!JSON.stringify(s).includes('secret')); assert.equal(s.ports[0].port, 27051); assert.equal(s.uptimeSeconds, null);
    assert.equal(freshSummary(s, true)!.game!.players, null); assert.equal(freshSummary(s, true)!.game!.state, 'stale');
});
