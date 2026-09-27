import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LoginRateLimit } from '../src/services/loginRateLimit.js';

test('login admission bounds memory, expires cold keys and never evicts active bans', () => {
  let now = 0;
  const limiter = new LoginRateLimit(2, 1000, 2000, 3, () => now);
  assert.equal(limiter.take('a'), 0); assert.equal(limiter.take('a'), 0);
  assert.equal(limiter.take('a'), 2);
  assert.equal(limiter.take('b'), 0); assert.equal(limiter.take('c'), 0);
  for (let i=0; i<1000; i++) assert(limiter.take('new-'+i) > 0);
  assert.equal(limiter.size, 3);
  now = 1001; assert.equal(limiter.take('d'), 0); assert.equal(limiter.size, 2);
  assert.equal(limiter.take('a'), 1);
  now = 2001; assert.equal(limiter.take('a'), 0);
  limiter.clear('a'); assert.equal(limiter.take('a'), 0);
});

test('concurrent password checks cannot all pass admission before failure is recorded', async () => {
  const limiter = new LoginRateLimit(3, 60000, 60000);
  const attempts = await Promise.all(Array.from({ length: 50 }, async () => limiter.take('same-user')));
  assert.equal(attempts.filter(retry => retry === 0).length, 3);
});
