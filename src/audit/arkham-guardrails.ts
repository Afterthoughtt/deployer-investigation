export interface ArkhamGuardrailConfig {
  datapointReserve: number;
  labelLookupRunBudget: number;
  allowBatchIntel: boolean;
  rowLimitMax: number;
  rowCreditRunBudget: number;
  requireRowTimeWindow: boolean;
  allowRowPagination: boolean;
}

export interface ArkhamGuardrailState {
  labelLookupsPlanned: number;
  rowCreditsPlanned: number;
  datapointsRemainingSeen: number | null;
}

export interface ArkhamDatapointMeta {
  datapoints: {
    remaining: number | null;
  };
}

const ROW_BILLED_ENDPOINTS: Record<string, number> = {
  '/transfers': 2,
  '/swaps': 2,
};

// Intel label lookups vs credits are independent buckets. Credits are weighted
// per-call or per-row; label lookups count UNIQUE labeled addresses surfaced in
// the response (deduplicated per billing period). Empirically verified
// 2026-04-24: /transfers responses also emit X-Intel-Datapoints-* headers and
// advance the label bucket — the docs' "intelligence endpoints only" framing
// is incomplete. We estimate label-bucket burn defensively (worst case) per
// endpoint shape.

const ROW_PAGINATION_KEYS = new Set([
  'before',
  'after',
  'cursor',
  'next',
  'offset',
  'page',
  'pageToken',
  'paginationToken',
]);

const TIME_BOUND_KEYS = new Set([
  'timeLast',
  'timeGte',
  'timestampGte',
  'blockTimestampGte',
]);

const SUBJECT_KEYS = new Set(['base', 'from', 'to']);

export function readNonNegativeIntEnv(
  name: string,
  defaultValue: number,
  env: Record<string, string | undefined> = process.env,
): number {
  const raw = env[name]?.trim();
  if (raw === undefined || raw === '') return defaultValue;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`${name} must be a non-negative integer, got: ${raw}`);
  }
  return n;
}

export function readPositiveIntEnv(
  name: string,
  defaultValue: number,
  env: Record<string, string | undefined> = process.env,
): number {
  const raw = env[name]?.trim();
  if (raw === undefined || raw === '') return defaultValue;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`${name} must be a positive integer, got: ${raw}`);
  }
  return n;
}

export function makeArkhamGuardrailConfig(
  env: Record<string, string | undefined> = process.env,
): ArkhamGuardrailConfig {
  return {
    datapointReserve: readNonNegativeIntEnv('ARKHAM_DATAPOINT_RESERVE', 2000, env),
    labelLookupRunBudget: readNonNegativeIntEnv(
      'ARKHAM_LABEL_LOOKUP_RUN_BUDGET',
      0,
      env,
    ),
    allowBatchIntel: env.ARKHAM_ALLOW_BATCH_INTEL === '1',
    rowLimitMax: readPositiveIntEnv('ARKHAM_ROW_LIMIT_MAX', 25, env),
    rowCreditRunBudget: readNonNegativeIntEnv(
      'ARKHAM_ROW_CREDIT_RUN_BUDGET',
      200,
      env,
    ),
    requireRowTimeWindow: env.ARKHAM_ALLOW_UNBOUNDED_TIME !== '1',
    allowRowPagination: env.ARKHAM_ALLOW_ROW_PAGINATION === '1',
  };
}

export function makeArkhamGuardrailState(): ArkhamGuardrailState {
  return {
    labelLookupsPlanned: 0,
    rowCreditsPlanned: 0,
    datapointsRemainingSeen: null,
  };
}

export function estimateArkhamLabelBucketBurn(
  path: string,
  params: Record<string, string>,
  body: unknown,
): number {
  if (path.startsWith('/intelligence/') && path.includes('/batch')) {
    const addresses = (body as { addresses?: unknown[] } | null | undefined)?.addresses;
    return Array.isArray(addresses) ? addresses.length : 0;
  }
  if (/^\/intelligence\/address(?:_enriched)?\/[^/]+(?:\/all)?$/.test(path)) {
    return 1;
  }
  if (ROW_BILLED_ENDPOINTS[path] !== undefined) {
    const n = Number(params.limit);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }
  return 0;
}

export function assertArkhamSpendAllowed(
  method: 'GET' | 'POST',
  path: string,
  opts: { params?: Record<string, string>; body?: unknown },
  state: ArkhamGuardrailState,
  config: ArkhamGuardrailConfig,
): void {
  assertForbiddenArkhamEndpoint(path);
  // Row-budget validates parameter shape (chain, subject, limit, time,
  // pagination) before bumping state, so its shape failures fire early and
  // clearly. Label-bucket runs after so its estimate uses already-validated
  // limits.
  assertArkhamRowBudget(method, path, opts.params ?? {}, state, config);
  assertArkhamLabelBucketBudget(path, opts.params ?? {}, opts.body, state, config);
}

export function observeArkhamDatapoints(
  path: string,
  meta: ArkhamDatapointMeta,
  state: ArkhamGuardrailState,
  config: ArkhamGuardrailConfig,
  warn: (msg: string) => void = console.warn,
): void {
  const remaining = meta.datapoints.remaining;
  if (remaining === null) return;
  state.datapointsRemainingSeen = remaining;
  if (remaining < config.datapointReserve) {
    warn(
      `arkham ${path}: datapoints remaining ${remaining} below reserve ${config.datapointReserve}; future intelligence lookups will be blocked`,
    );
  }
}

function assertForbiddenArkhamEndpoint(path: string): void {
  if (path === '/ws/sessions' || path === '/ws/transfers') {
    throw new Error(`arkham ${path} blocked: streaming row-billed endpoints are disabled by default`);
  }
}

function assertArkhamLabelBucketBudget(
  path: string,
  params: Record<string, string>,
  body: unknown,
  state: ArkhamGuardrailState,
  config: ArkhamGuardrailConfig,
): void {
  const estimate = estimateArkhamLabelBucketBurn(path, params, body);
  if (estimate === 0) return;

  if (path.includes('/batch') && !config.allowBatchIntel) {
    throw new Error(
      `arkham ${path} blocked: batch intelligence is disabled by default; set ARKHAM_ALLOW_BATCH_INTEL=1 only for an approved bounded run`,
    );
  }

  if (state.labelLookupsPlanned + estimate > config.labelLookupRunBudget) {
    throw new Error(
      `arkham ${path} blocked: planned label lookups ${state.labelLookupsPlanned + estimate} exceed run budget ${config.labelLookupRunBudget}`,
    );
  }

  if (
    state.datapointsRemainingSeen !== null &&
    state.datapointsRemainingSeen - estimate < config.datapointReserve
  ) {
    throw new Error(
      `arkham ${path} blocked: last seen datapoints remaining ${state.datapointsRemainingSeen}, reserve ${config.datapointReserve}, estimated label burn ${estimate}`,
    );
  }

  state.labelLookupsPlanned += estimate;
}

function assertArkhamRowBudget(
  method: 'GET' | 'POST',
  path: string,
  params: Record<string, string>,
  state: ArkhamGuardrailState,
  config: ArkhamGuardrailConfig,
): void {
  const costPerRow = ROW_BILLED_ENDPOINTS[path];
  if (costPerRow === undefined) return;
  if (method !== 'GET') {
    throw new Error(`arkham ${path} blocked: unexpected method ${method} for row-billed endpoint`);
  }

  assertSolanaOnly(path, params);
  assertSubjectFilter(path, params);
  assertLimit(path, params, config);
  assertTimeWindow(path, params, config);
  assertNoPagination(path, params, config);

  const limit = Number(params.limit);
  const estimatedCost = limit * costPerRow;
  if (state.rowCreditsPlanned + estimatedCost > config.rowCreditRunBudget) {
    throw new Error(
      `arkham ${path} blocked: planned row credits ${state.rowCreditsPlanned + estimatedCost} exceed run budget ${config.rowCreditRunBudget}`,
    );
  }
  state.rowCreditsPlanned += estimatedCost;
}

function assertSolanaOnly(path: string, params: Record<string, string>): void {
  const chain = params.chain ?? params.chains;
  if (chain !== 'solana') {
    throw new Error(`arkham ${path} blocked: row-billed calls must set chain/chains=solana`);
  }
}

function assertSubjectFilter(path: string, params: Record<string, string>): void {
  for (const key of SUBJECT_KEYS) {
    if (params[key]?.trim()) return;
  }
  throw new Error(`arkham ${path} blocked: row-billed calls must include one of base/from/to`);
}

function assertLimit(
  path: string,
  params: Record<string, string>,
  config: ArkhamGuardrailConfig,
): void {
  const raw = params.limit;
  const limit = raw === undefined ? NaN : Number(raw);
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error(`arkham ${path} blocked: row-billed calls must include a positive integer limit`);
  }
  if (limit > config.rowLimitMax) {
    throw new Error(
      `arkham ${path} blocked: limit ${limit} exceeds ARKHAM_ROW_LIMIT_MAX ${config.rowLimitMax}`,
    );
  }
}

function assertTimeWindow(
  path: string,
  params: Record<string, string>,
  config: ArkhamGuardrailConfig,
): void {
  if (!config.requireRowTimeWindow) return;
  for (const key of TIME_BOUND_KEYS) {
    if (params[key]?.trim()) return;
  }
  throw new Error(
    `arkham ${path} blocked: row-billed calls must include timeLast or a lower-bound time filter`,
  );
}

function assertNoPagination(
  path: string,
  params: Record<string, string>,
  config: ArkhamGuardrailConfig,
): void {
  if (config.allowRowPagination) return;
  for (const key of ROW_PAGINATION_KEYS) {
    if (params[key] !== undefined) {
      throw new Error(
        `arkham ${path} blocked: pagination key "${key}" is disabled by default`,
      );
    }
  }
}
