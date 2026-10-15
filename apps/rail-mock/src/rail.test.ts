import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { createRailServer } from './server.ts';
import type { RailServer } from './server.ts';

let root: string;
before(async () => { root = await mkdtemp(join(tmpdir(), 'rail-mock-')); });
after(async () => { await rm(root, { recursive: true, force: true }); });

let serial = 1;
const uuid = () => `00000000-0000-4000-8000-${String(serial++).padStart(12, '0')}`;
const transfer = (overrides: Record<string, unknown> = {}) => ({ reference: uuid(), from: 'ACC-002', to: 'EXT-001', amount: '100.5', ...overrides });
const reversal = (originalReference: string, overrides: Record<string, unknown> = {}) => ({ reference: uuid(), originalReference, amount: '100.50', ...overrides });

async function withServer<T>(scenarios: string, run: (base: string, app: RailServer) => Promise<T>, dbName = `db-${serial}.sqlite`): Promise<T> {
  const app = createRailServer({ dbPath: join(root, dbName), mode: 'test', scenarios });
  await new Promise<void>((resolve, reject) => {
    app.server.once('error', reject);
    app.server.listen(0, '127.0.0.1', resolve);
  });
  const address = app.server.address();
  assert.ok(address && typeof address !== 'string');
  try { return await run(`http://127.0.0.1:${address.port}`, app); }
  finally { await app.close(); }
}

async function post(base: string, path: string, body: unknown, signal?: AbortSignal) {
  return fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal });
}

test('implements exactly the three bank routes and internal readiness', async () => {
  await withServer('accepted', async (base) => {
    assert.equal((await fetch(`${base}/health/ready`)).status, 200);
    assert.equal((await fetch(`${base}/rail/transfers`)).status, 404);
    const created = await post(base, '/rail/transfers', transfer());
    assert.equal(created.status, 200);
    const result = await created.json() as Record<string, unknown>;
    assert.deepEqual(Object.keys(result).sort(), ['amount', 'from', 'processedAt', 'reason', 'reference', 'reversal', 'status', 'to'].sort());
    assert.equal(result.status, 'ACCEPTED');
    assert.equal(result.amount, '100.50');
    assert.equal((await fetch(`${base}/rail/transfers/${result.reference}`)).status, 200);
    assert.equal((await fetch(`${base}/rail/reversals/${result.reference}`)).status, 404);
  });
});

test('replays normalized payloads, rejects conflicts, and concurrent duplicates create one result', async () => {
  await withServer('rejected,accepted', async (base) => {
    const body = transfer();
    const [first, second] = await Promise.all([
      post(base, '/rail/transfers', body),
      post(base, '/rail/transfers', { ...body, amount: '100.50' }),
    ]);
    assert.equal(first.status, 422);
    assert.equal(second.status, 422);
    assert.deepEqual(await first.json(), await second.json());
    assert.equal((await post(base, '/rail/transfers', { ...body, amount: '101.00' })).status, 409);
    const next = await post(base, '/rail/transfers', transfer());
    assert.equal(next.status, 200);
  });
});

test('persists accepted transfers and reversals when SQLite is reopened', async () => {
  const dbName = `persist-${serial}.sqlite`;
  let reference = '';
  let reverseResult: unknown;
  await withServer('accepted,accepted', async (base) => {
    const original = transfer();
    reference = original.reference;
    assert.equal((await post(base, '/rail/transfers', original)).status, 200);
    const rev = reversal(reference);
    reverseResult = await (await post(base, '/rail/reversals', rev)).json();
  }, dbName);
  await withServer('', async (base) => {
    const stored = await (await fetch(`${base}/rail/transfers/${reference}`)).json() as Record<string, unknown>;
    assert.deepEqual(stored.reversal, reverseResult);
  }, dbName);
});

test('exercises accepted, rejected, unavailable, and both timeout scenarios in sequence', async () => {
  await withServer('accepted,rejected,unavailable,timeout_processed,timeout_not_processed', async (base) => {
    assert.equal((await post(base, '/rail/transfers', transfer())).status, 200);
    assert.equal((await post(base, '/rail/transfers', transfer())).status, 422);
    const unavailable = transfer();
    assert.equal((await post(base, '/rail/transfers', unavailable)).status, 503);
    assert.equal((await fetch(`${base}/rail/transfers/${unavailable.reference}`)).status, 404);
    const processed = transfer();
    const processedResponse = await post(base, '/rail/transfers', processed);
    assert.equal(processedResponse.status, 200);
    assert.equal((await fetch(`${base}/rail/transfers/${processed.reference}`)).status, 200);
    const notProcessed = transfer();
    const start = Date.now();
    assert.equal((await post(base, '/rail/transfers', notProcessed)).status, 503);
    assert.ok(Date.now() - start >= 11_500);
    assert.equal((await fetch(`${base}/rail/transfers/${notProcessed.reference}`)).status, 404);
  });
});

test('a processed timeout keeps its durable result even if the caller disconnects', async () => {
  await withServer('timeout_processed', async (base) => {
    const body = transfer();
    const controller = new AbortController();
    const pending = post(base, '/rail/transfers', body, controller.signal).catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 100));
    controller.abort();
    await pending;
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal((await fetch(`${base}/rail/transfers/${body.reference}`)).status, 200);
  });
});

test('only one concurrent reversal is accepted; rejected reversal can be retried with a new reference', async () => {
  await withServer('accepted,rejected,accepted,accepted', async (base) => {
    const original = transfer();
    assert.equal((await post(base, '/rail/transfers', original)).status, 200);
    const rejected = reversal(original.reference);
    assert.equal((await post(base, '/rail/reversals', rejected)).status, 422);
    const candidates = [reversal(original.reference), reversal(original.reference)];
    const responses = await Promise.all(candidates.map((candidate) => post(base, '/rail/reversals', candidate)));
    assert.deepEqual(responses.map((response) => response.status).sort(), [200, 422]);
    const bodies = await Promise.all(responses.map((response) => response.json() as Promise<Record<string, unknown>>));
    assert.equal(bodies.find((body) => body.status === 'ACCEPTED')?.status, 'ACCEPTED');
    const result = await (await fetch(`${base}/rail/transfers/${original.reference}`)).json() as Record<string, unknown>;
    assert.equal((result.reversal as Record<string, unknown>).status, 'REJECTED');
  });
});

test('malformed requests are 400; invalid source, beneficiary, original, and amount are persisted 422 results', async () => {
  await withServer('accepted', async (base) => {
    assert.equal((await post(base, '/rail/transfers', { ...transfer(), amount: '1.001' })).status, 400);
    assert.equal((await post(base, '/rail/transfers', transfer({ from: 'x' }))).status, 400);
    assert.equal((await post(base, '/rail/transfers', transfer({ to: 'ACC-001' }))).status, 422);
    assert.equal((await post(base, '/rail/transfers', transfer({ from: 'BAD' }))).status, 422);
    const missing = reversal(uuid());
    assert.equal((await post(base, '/rail/reversals', missing)).status, 422);
    const original = transfer();
    assert.equal((await post(base, '/rail/transfers', original)).status, 200);
    assert.equal((await post(base, '/rail/reversals', reversal(original.reference, { amount: '99.00' }))).status, 422);
  });
});

test('a reversal reference cannot be reused for another kind or payload; transfer rejection is queryable', async () => {
  await withServer('rejected', async (base) => {
    const body = transfer();
    assert.equal((await post(base, '/rail/transfers', body)).status, 422);
    const stored = await (await fetch(`${base}/rail/transfers/${body.reference}`)).json() as Record<string, unknown>;
    assert.equal(stored.status, 'REJECTED');
    assert.equal(stored.reversal, null);
    assert.equal((await post(base, '/rail/reversals', { reference: body.reference, originalReference: uuid(), amount: body.amount })).status, 409);
  });
});
