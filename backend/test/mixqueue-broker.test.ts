import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {createHmac} from 'node:crypto';
import {startMixqueueBroker} from '../src/services/mixqueueBroker.js';
import {MQ_API} from '../src/services/mixqueueContract.js';

test('Unix broker preserves observer status and applies bounded ACL commands without blocking cleanup', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mq-observer-broker-'));
  const socketPath = path.join(directory, 'broker.sock');
  // The runtime's fixed uid belongs to containers, not the developer's macOS host.
  t.mock.method(fs, 'chown', async () => {});
  const identity = {serverId: 'fixture-server', game: 'cs16', key: 'fixture-key'};
  const now = Math.floor(Date.now() / 1000), match = 'a'.repeat(24);
  const update = {id: 'b'.repeat(24), type: 'observer_update', match_id: match, generation: 1,
    payload: {version: 1, revision: 2, expires_at: now + 300, observers: [
      {steam_id: '76561198000000001', role: 'commentator', xray: true, expires_at: now + 200, locale: 'en'},
    ]}};
  const cleanup = {id: 'c'.repeat(24), type: 'cleanup', match_id: match, generation: 1};
  const commands = [{...update, payload: {...update.payload, command: 'quit'}}, update, cleanup];
  const observation = {controller: 'matchbot', controller_version: '0.6.5', agent_version: '0.6.2',
    observer_acl_version: 1, observer_agent_version: 1, observer_revision: 2, observer_expires_at: now + 300,
    observer_slots: 2, connected_observers: 1, observer_xray: 'markers_v1'};
  const poll = {action: 'poll', healthy: true, observation};
  let forwarded = 0;
  t.mock.method(globalThis, 'fetch', async (url: unknown, options: RequestInit) => {
    assert.equal(url, MQ_API);
    assert.equal(options.redirect, 'error');
    const headers = options.headers as Record<string, string>, raw = String(options.body);
    assert.equal(headers['X-MQ-Signature'], createHmac('sha256', identity.key)
      .update(identity.serverId + '\n' + headers['X-MQ-Time'] + '\n' + raw).digest('hex'));
    assert.deepEqual(JSON.parse(raw), poll);
    forwarded++;
    return new Response(JSON.stringify({commands, load_rejection_contract: 1}));
  });
  const rcon: string[] = [];
  const broker = await startMixqueueBroker(socketPath, {authorize: async () => identity,
    rcon: async command => {rcon.push(command); return 'observer_updated';}});
  const request = (route: string, body: unknown) => new Promise<{status: number, body: any}>((resolve, reject) => {
    const req = http.request({socketPath, path: route, method: 'POST', headers: {'Content-Type': 'application/json'}}, res => {
      let result = '';
      res.on('data', data => result += data);
      res.on('end', () => resolve({status: res.statusCode!, body: JSON.parse(result)}));
    });
    req.on('error', reject);
    req.end(JSON.stringify(body));
  });
  try {
    assert.deepEqual(await request('/matchmaking', poll), {status: 200, body: {commands: [update, cleanup], load_rejection_contract: 1}});
    assert.equal(forwarded, 1);
    const valid = `mq2_observers ${match} 2147483647 2147483647`;
    assert.deepEqual(await request('/rcon', {command: valid}), {status: 200, body: {result: 'observer_updated'}});
    for (const command of [`mq2_observers ${match} 2147483648 1`, `mq2_observers ${match} 1 1;quit`,
      `mq2_observers ${match} 1 1\n`]) {
      assert.deepEqual(await request('/rcon', {command}), {status: 503, body: {error: 'broker_unavailable'}});
    }
    assert.deepEqual(rcon, [valid]);
  } finally {
    await broker.close();
    await fs.rm(directory, {recursive: true, force: true});
  }
});
