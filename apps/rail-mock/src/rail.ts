import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export type RailMode = 'random' | 'test';
export type Scenario = 'accepted' | 'rejected' | 'unavailable' | 'timeout_processed' | 'timeout_not_processed';
export type RailStatus = 'ACCEPTED' | 'REJECTED';
export type Transfer = {
  reference: string;
  from: string;
  to: string;
  amount: string;
  status: RailStatus;
  processedAt: string;
  reason: string | null;
  reversal: Reversal | null;
};
export type Reversal = {
  reference: string;
  originalReference: string;
  amount: string;
  status: RailStatus;
  processedAt: string;
  reason: string | null;
};
export type RailResult = Transfer | Reversal;
export type HttpResult = { status: number; body: Record<string, unknown>; delayMs?: number };
type TransferInput = { reference: string; from: string; to: string; amount: string };
type ReversalInput = { reference: string; originalReference: string; amount: string };
type StoredOperation = {
  reference: string;
  kind: 'transfer' | 'reversal';
  payload_hash: string;
  payload: string;
  result: string;
  original_reference: string | null;
};

const MAX_CENTS = 99_999_999_999_999n;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MONEY_PATTERN = /^(0|[1-9][0-9]{0,11})(?:\.([0-9]{1,2}))?$/;
const SCENARIOS: readonly Scenario[] = ['accepted', 'rejected', 'unavailable', 'timeout_processed', 'timeout_not_processed'];
const TIMEOUT_MS = 12_000;

export function parseAmount(input: unknown): { amount: string; cents: bigint } | null {
  if (typeof input !== 'string') return null;
  const match = MONEY_PATTERN.exec(input);
  if (!match) return null;
  const cents = BigInt(match[1]) * 100n + BigInt((match[2] ?? '').padEnd(2, '0') || '0');
  if (cents <= 0n || cents > MAX_CENTS) return null;
  return { amount: `${match[1]}.${(match[2] ?? '').padEnd(2, '0') || '00'}`, cents };
}

function error(status: number, code: string, message: string): HttpResult {
  return { status, body: { code, message } };
}

function normalizedReference(input: unknown): string | null {
  return typeof input === 'string' && UUID_PATTERN.test(input) ? input.toLowerCase() : null;
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return input !== null && typeof input === 'object' && !Array.isArray(input);
}

function hasExactKeys(input: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(input).length === keys.length && keys.every((key) => Object.hasOwn(input, key));
}

function parseTransfer(input: unknown): TransferInput | null {
  if (!isRecord(input) || !hasExactKeys(input, ['reference', 'from', 'to', 'amount'])) return null;
  const reference = normalizedReference(input.reference);
  const amount = parseAmount(input.amount);
  if (!reference || !amount || typeof input.from !== 'string' || typeof input.to !== 'string') return null;
  if (input.from.length < 3 || input.from.length > 64 || input.to.length < 3 || input.to.length > 64) return null;
  return { reference, from: input.from, to: input.to, amount: amount.amount };
}

function parseReversal(input: unknown): ReversalInput | null {
  if (!isRecord(input) || !hasExactKeys(input, ['reference', 'originalReference', 'amount'])) return null;
  const reference = normalizedReference(input.reference);
  const originalReference = normalizedReference(input.originalReference);
  const amount = parseAmount(input.amount);
  if (!reference || !originalReference || !amount) return null;
  return { reference, originalReference, amount: amount.amount };
}

function payloadHash(kind: 'transfer' | 'reversal', payload: TransferInput | ReversalInput): string {
  return createHash('sha256').update(JSON.stringify({ kind, ...payload })).digest('hex');
}

export type RailOptions = {
  dbPath: string;
  mode?: RailMode;
  scenarios?: string;
  now?: () => Date;
  wait?: (milliseconds: number) => Promise<void>;
};

export class RailService {
  private readonly database: DatabaseSync;
  private readonly mode: RailMode;
  private readonly scenarioSequence: Scenario[];
  private readonly now: () => Date;
  private readonly wait: (milliseconds: number) => Promise<void>;
  private sequenceIndex = 0;

  constructor(options: RailOptions) {
    this.mode = options.mode ?? 'random';
    if (this.mode !== 'random' && this.mode !== 'test') throw new Error('RAIL_MODE must be random or test');
    this.scenarioSequence = (options.scenarios ?? '').split(',').map((item) => item.trim()).filter(Boolean).map((item) => {
      if (!SCENARIOS.includes(item as Scenario)) throw new Error(`Unknown RAIL_SCENARIOS entry: ${item}`);
      return item as Scenario;
    });
    this.now = options.now ?? (() => new Date());
    this.wait = options.wait ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    if (options.dbPath !== ':memory:') mkdirSync(dirname(options.dbPath), { recursive: true });
    this.database = new DatabaseSync(options.dbPath);
    this.database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS operations (
        reference TEXT PRIMARY KEY,
        kind TEXT NOT NULL CHECK (kind IN ('transfer', 'reversal')),
        payload_hash TEXT NOT NULL,
        payload TEXT NOT NULL,
        result TEXT NOT NULL,
        original_reference TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS operations_original_reference_idx
        ON operations(original_reference, created_at DESC);
      CREATE UNIQUE INDEX IF NOT EXISTS accepted_reversal_per_transfer_idx
        ON operations(original_reference) WHERE kind = 'reversal' AND json_extract(result, '$.status') = 'ACCEPTED';
    `);
  }

  close(): void {
    this.database.close();
  }

  ready(): boolean {
    try {
      this.database.prepare('SELECT 1').get();
      return true;
    } catch {
      return false;
    }
  }

  async createTransfer(body: unknown): Promise<HttpResult> {
    const input = parseTransfer(body);
    if (!input) return error(400, 'INVALID_REQUEST', 'El cuerpo de transferencia no cumple el contrato.');
    return this.databaseSyncOperation('transfer', input, () => {
      if (!/^ACC-[A-Za-z0-9][A-Za-z0-9-]*$/.test(input.from)) {
        return this.persistRejection('transfer', input, 'INVALID_ORIGIN');
      }
      if (input.to !== 'EXT-001' && input.to !== 'EXT-002') {
        return this.persistRejection('transfer', input, 'BENEFICIARY_NOT_FOUND');
      }
      const scenario = this.nextScenario();
      if (scenario === 'unavailable' || scenario === 'timeout_not_processed') {
        return { status: 503, body: { code: 'RAIL_UNAVAILABLE', message: 'El banco simulado no pudo procesar la operación.' }, delayMs: scenario === 'timeout_not_processed' ? TIMEOUT_MS : 0 };
      }
      const accepted = scenario !== 'rejected';
      const result: Transfer = {
        ...input,
        status: accepted ? 'ACCEPTED' : 'REJECTED',
        processedAt: this.now().toISOString(),
        reason: accepted ? null : 'BANK_DECLINED',
        reversal: null,
      };
      return { status: accepted ? 200 : 422, body: result, delayMs: scenario === 'timeout_processed' ? TIMEOUT_MS : 0 };
    });
  }

  async createReversal(body: unknown): Promise<HttpResult> {
    const input = parseReversal(body);
    if (!input) return error(400, 'INVALID_REQUEST', 'El cuerpo de reverso no cumple el contrato.');
    return this.databaseSyncOperation('reversal', input, () => {
      const original = this.readOperation(input.originalReference);
      if (!original || original.kind !== 'transfer') return this.persistRejection('reversal', input, 'ORIGINAL_NOT_FOUND');
      const originalResult = JSON.parse(original.result) as Transfer;
      const originalPayload = JSON.parse(original.payload) as TransferInput;
      if (originalResult.status !== 'ACCEPTED') return this.persistRejection('reversal', input, 'ORIGINAL_NOT_ACCEPTED');
      if (input.amount !== originalPayload.amount) return this.persistRejection('reversal', input, 'AMOUNT_MISMATCH');
      const acceptedReversal = this.database.prepare(`
        SELECT reference FROM operations WHERE kind = 'reversal' AND original_reference = ?
          AND json_extract(result, '$.status') = 'ACCEPTED' LIMIT 1
      `).get(input.originalReference);
      if (acceptedReversal) return this.persistRejection('reversal', input, 'ALREADY_REVERSED');

      const scenario = this.nextScenario();
      if (scenario === 'unavailable' || scenario === 'timeout_not_processed') {
        return { status: 503, body: { code: 'RAIL_UNAVAILABLE', message: 'El banco simulado no pudo procesar el reverso.' }, delayMs: scenario === 'timeout_not_processed' ? TIMEOUT_MS : 0 };
      }
      const accepted = scenario !== 'rejected';
      const result: Reversal = {
        ...input,
        status: accepted ? 'ACCEPTED' : 'REJECTED',
        processedAt: this.now().toISOString(),
        reason: accepted ? null : 'BANK_DECLINED',
      };
      return { status: accepted ? 200 : 422, body: result, delayMs: scenario === 'timeout_processed' ? TIMEOUT_MS : 0 };
    });
  }

  getTransfer(referenceInput: string): HttpResult {
    const reference = normalizedReference(referenceInput);
    if (!reference) return error(400, 'INVALID_REFERENCE', 'La referencia debe ser un UUID.');
    const operation = this.readOperation(reference);
    if (!operation || operation.kind !== 'transfer') return error(404, 'REFERENCE_NOT_FOUND', 'No se encontró la transferencia.');
    const result = JSON.parse(operation.result) as Transfer;
    const reversal = this.database.prepare(`
      SELECT result FROM operations WHERE kind = 'reversal' AND original_reference = ?
      ORDER BY created_at DESC, rowid DESC LIMIT 1
    `).get(reference) as { result: string } | undefined;
    result.reversal = reversal ? JSON.parse(reversal.result) as Reversal : null;
    return { status: 200, body: result };
  }

  private databaseSyncOperation(
    kind: 'transfer' | 'reversal',
    payload: TransferInput | ReversalInput,
    calculate: () => HttpResult,
  ): HttpResult {
    const reference = payload.reference;
    const hash = payloadHash(kind, payload);
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const existing = this.readOperation(reference);
      if (existing) {
        this.database.exec('COMMIT');
        if (existing.kind !== kind || existing.payload_hash !== hash) return error(409, 'REFERENCE_CONFLICT', 'La referencia ya está asociada a otra operación.');
        return { status: this.statusFor(JSON.parse(existing.result) as RailResult), body: this.withLatestReversal(existing) };
      }
      const result = calculate();
      if (result.status === 503) {
        this.database.exec('COMMIT');
        return result;
      }
      this.database.prepare(`
        INSERT INTO operations(reference, kind, payload_hash, payload, result, original_reference, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(reference, kind, hash, JSON.stringify(payload), JSON.stringify(result.body), kind === 'reversal' ? (payload as ReversalInput).originalReference : null, this.now().toISOString());
      this.database.exec('COMMIT');
      return result;
    } catch (cause) {
      try { this.database.exec('ROLLBACK'); } catch { /* transaction already closed */ }
      throw cause;
    }
  }

  private persistRejection(kind: 'transfer' | 'reversal', payload: TransferInput | ReversalInput, reason: string): HttpResult {
    const common = { ...payload, status: 'REJECTED' as const, processedAt: this.now().toISOString(), reason };
    const body = kind === 'transfer' ? { ...common, reversal: null } : common;
    return { status: 422, body };
  }

  private readOperation(reference: string): StoredOperation | undefined {
    return this.database.prepare('SELECT reference, kind, payload_hash, payload, result, original_reference FROM operations WHERE reference = ?').get(reference) as StoredOperation | undefined;
  }

  private withLatestReversal(operation: StoredOperation): Record<string, unknown> {
    const result = JSON.parse(operation.result) as Transfer | Reversal;
    if (operation.kind !== 'transfer') return result as unknown as Record<string, unknown>;
    const latest = this.database.prepare(`
      SELECT result FROM operations WHERE kind = 'reversal' AND original_reference = ?
      ORDER BY created_at DESC, rowid DESC LIMIT 1
    `).get(operation.reference) as { result: string } | undefined;
    (result as Transfer).reversal = latest ? JSON.parse(latest.result) as Reversal : null;
    return result as unknown as Record<string, unknown>;
  }

  private statusFor(result: RailResult): number {
    return result.status === 'ACCEPTED' ? 200 : 422;
  }

  private nextScenario(): Scenario {
    if (this.mode === 'test') return this.scenarioSequence[this.sequenceIndex++] ?? 'accepted';
    const selection = Math.floor(Math.random() * 5);
    return SCENARIOS[selection];
  }
}

export function newReference(): string {
  return randomUUID();
}
