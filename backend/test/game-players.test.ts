import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSocket } from 'node:dgram';
import express from 'express';
import { parseGamePlayers, queryGamePlayers } from '../src/services/gameQuery.js';
import { PERMISSIONS, ASSIGNABLE_SERVER_PERMISSIONS } from '../src/permissions.js';
import { parsePositiveIntId } from '../src/utils/ids.js';
import { loadWithMocks } from './loadWithMocks.js';

function packet(name = 'Player', seconds = 65) {
    const stats = Buffer.alloc(8); stats.writeInt32LE(-2); stats.writeFloatLE(seconds, 4);
    return Buffer.concat([Buffer.from([255,255,255,255,0x44,1,0]), Buffer.from(name + '\0'), stats]);
}
test('A2S players preserves score/time, bounds names and rejects incomplete/non-finite data', () => {
    assert.deepEqual(parseGamePlayers(packet('Te\nst')), [{ name: 'Test', score: -2, connectedSeconds: 65 }]);
    assert.equal(parseGamePlayers(packet('a'.repeat(500)))[0].name.length, 256);
    assert.throws(() => parseGamePlayers(packet().subarray(0, -1)), /Truncated/);
    assert.throws(() => parseGamePlayers(packet('Player', NaN)), /duration/);
    assert.throws(() => parseGamePlayers(Buffer.alloc(4)), /Invalid/);
    assert.deepEqual(parseGamePlayers(Buffer.from([255,255,255,255,0x44,0])), []);
});
test('player query replaces the challenge and reassembles Source/GoldSrc packets', async t => {
    for (const source of [true, false]) {
        const socket = createSocket('udp4'); t.after(() => socket.close());
        let requests = 0;
        socket.on('message', (request, remote) => {
            requests++;
            const send = (data: Buffer) => socket.send(data, remote.port, remote.address);
            assert.equal(request.length, 9); assert.equal(request[4], 0x55);
            if (requests === 1) { send(Buffer.from([255,255,255,255,0x41,1,2,3,4])); return; }
            assert.deepEqual(request.subarray(5), Buffer.from([1,2,3,4]));
            const body = packet();
            for (const index of [1,0]) {
                const header = Buffer.alloc(source ? 12 : 9);
                header.writeInt32LE(-2); header.writeUInt32LE(42,4);
                if (source) { header[8] = 2; header[9] = index; header.writeUInt16LE(1248,10); }
                else header[8] = (index << 4) | 2;
                send(Buffer.concat([header, index === 0 ? body.subarray(0,10) : body.subarray(10)]));
            }
        });
        await new Promise<void>(resolve => socket.bind(0,'127.0.0.1',resolve));
        assert.equal((await queryGamePlayers('127.0.0.1',socket.address().port,500))[0].name,'Player');
        assert.equal(requests,2);
    }
});
test('player query refuses arbitrary hostnames and times out without inventing an empty list', async t => {
    await assert.rejects(queryGamePlayers('example.com',27015), /Invalid/);
    const socket = createSocket('udp4'); t.after(() => socket.close());
    await new Promise<void>(resolve => socket.bind(0,'127.0.0.1',resolve));
    await assert.rejects(queryGamePlayers('127.0.0.1',socket.address().port,20), /timed out/);
});

test('runtime players route checks permission, scoped delegation and revoked access before querying', async t => {
    let permissions: string[] = [], calls = 0;
    let user: any = { userId: 2, isRoot: false };
    const auth = loadWithMocks('../src/middleware/auth.ts', {
        '../utils/auth.js': {}, '../database/index.js': { userRepository: {}, serverMemberRepository: { getUserServerPermissions: async () => permissions } },
        '../utils/ids.js': { parsePositiveIntId }, '../utils/logger.js': {}, '../permissions.js': { PERMISSIONS },
        '../agent/identity.js': {}, '../services/loginSessions.js': {},
    });
    const { gamePlayersRoutes } = loadWithMocks('../src/routes/gamePlayers.ts', {
        express, '../middleware/auth.js': auth, '../permissions.js': { PERMISSIONS },
        '../services/gamePlayers.js': { getGamePlayers: async () => { calls++; return { state:'online',players:[{name:'Private name'}] }; } },
        '../utils/routeErrors.js': { sendRouteError: (res: any) => res.sendStatus(500) },
    });
    const app = express(); app.use((req: any,_res,next) => { req.user = user; next(); });
    app.use('/api/servers/:id/players',gamePlayersRoutes);
    const server = app.listen(0,'127.0.0.1'); t.after(() => { server.closeAllConnections(); server.close(); });
    await new Promise<void>(resolve => server.once('listening',resolve));
    const url = `http://127.0.0.1:${(server.address() as any).port}/api/servers/100/players`;
    assert.equal((await fetch(url)).status,403); assert.equal(calls,0);
    permissions = ['server.players.read'];
    const ok = await fetch(url); assert.equal(ok.status,200); assert.equal(ok.headers.get('cache-control'),'no-store');
    permissions = []; assert.equal((await fetch(url)).status,403); assert.equal(calls,1);
    user = { userId:2, isRoot:false, delegation:{ serverId:101,permissions:['server.players.read'] } };
    assert.equal((await fetch(url)).status,403); assert.equal(calls,1);
    user.delegation.serverId = 100; assert.equal((await fetch(url)).status,200);
    assert(ASSIGNABLE_SERVER_PERMISSIONS.has('server.players.read'));
});

test('player service coalesces queries and invalidates results after stop or container replacement', async () => {
    let server: any = { id:100,docker_container_id:'one',updated_at:'one',status:'running',desired_state:'running',ports_json:'ports' };
    let enabled = true, owned = true, calls = 0, queried: unknown[] = [];
    const service = loadWithMocks('../src/services/gamePlayers.ts', {
        dockerode: class { getContainer() { return { inspect: async () => ({ Config:{ Labels:{} }, State:{ Running:true }, NetworkSettings:{ Networks:{ games:{IPAddress:'172.18.0.10'} } } }) }; } },
        '../config.js': { getConfig: () => ({ gamesNetwork:'games' }) },
        '../database/index.js': { serverRepository:{ findById:async () => server && ({...server}) } },
        './gameMonitoring.js':{ getMonitoringSettings:async () => ({config:{ enabled,protocol:'a2s',queryPort:27015 }}) },
        '../providers/runtimeConfig.js':{ parseStoredPorts:() => ({udp:[{container:27015,host:27051,hostIp:'192.0.2.1'}]}) },
        '../utils/docker/ownership.js':{ ownsContainer:() => owned },
        './gameQuery.js':{ queryGamePlayers:async (...args:unknown[]) => { calls++; queried=args; return [{name:'One'}]; } },
    });
    const [a,b] = await Promise.all([service.getGamePlayers(100),service.getGamePlayers(100)]);
    assert.equal(calls,1); assert.equal(a.players[0].name,b.players[0].name); assert.deepEqual(queried,['172.18.0.10',27015]);
    server.desired_state = 'stopped'; assert.equal((await service.getGamePlayers(100)).players,null); assert.equal(calls,1);
    server.desired_state = 'running'; server.docker_container_id = 'two'; owned = false;
    assert.equal((await service.getGamePlayers(100)).state,'unavailable'); assert.equal(calls,1);
    enabled = false; assert.equal((await service.getGamePlayers(100)).state,'unsupported');
});
