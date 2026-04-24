import {
  assertArkhamSpendAllowed,
  makeArkhamGuardrailConfig,
  makeArkhamGuardrailState,
  observeArkhamDatapoints,
} from './arkham-guardrails.js';

let pass = true;

function check(name: string, condition: boolean, detail?: string): void {
  const tag = condition ? 'PASS' : 'FAIL';
  console.log(`  ${tag}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!condition) pass = false;
}

function expectThrow(name: string, fn: () => void, includes: string): void {
  try {
    fn();
    check(name, false, 'did not throw');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    check(name, msg.includes(includes), msg);
  }
}

const cfg = makeArkhamGuardrailConfig({
  ARKHAM_DATAPOINT_RESERVE: '2000',
  ARKHAM_LABEL_LOOKUP_RUN_BUDGET: '2',
  ARKHAM_ROW_LIMIT_MAX: '25',
  ARKHAM_ROW_CREDIT_RUN_BUDGET: '60',
});

const goodTransferParams = {
  chains: 'solana',
  base: 'Wallet111111111111111111111111111111111111',
  limit: '25',
  timeGte: '2026-04-24T00:00:00Z',
};

console.log('Arkham guardrails:');

expectThrow(
  'row-billed transfer requires solana chain',
  () =>
    assertArkhamSpendAllowed(
      'GET',
      '/transfers',
      { params: { ...goodTransferParams, chains: 'ethereum' } },
      makeArkhamGuardrailState(),
      cfg,
    ),
  'chain/chains=solana',
);

expectThrow(
  'row-billed transfer requires subject filter',
  () =>
    assertArkhamSpendAllowed(
      'GET',
      '/transfers',
      {
        params: {
          chains: 'solana',
          limit: '25',
          timeGte: '2026-04-24T00:00:00Z',
        },
      },
      makeArkhamGuardrailState(),
      cfg,
    ),
  'base/from/to',
);

expectThrow(
  'row-billed transfer requires limit',
  () =>
    assertArkhamSpendAllowed(
      'GET',
      '/transfers',
      {
        params: {
          chains: 'solana',
          base: goodTransferParams.base,
          timeGte: '2026-04-24T00:00:00Z',
        },
      },
      makeArkhamGuardrailState(),
      cfg,
    ),
  'positive integer limit',
);

expectThrow(
  'row-billed transfer rejects large limit',
  () =>
    assertArkhamSpendAllowed(
      'GET',
      '/transfers',
      { params: { ...goodTransferParams, limit: '100' } },
      makeArkhamGuardrailState(),
      cfg,
    ),
  'exceeds ARKHAM_ROW_LIMIT_MAX',
);

expectThrow(
  'row-billed transfer requires time lower bound',
  () =>
    assertArkhamSpendAllowed(
      'GET',
      '/transfers',
      {
        params: {
          chains: 'solana',
          base: goodTransferParams.base,
          limit: '25',
        },
      },
      makeArkhamGuardrailState(),
      cfg,
    ),
  'timeLast or a lower-bound time filter',
);

expectThrow(
  'row-billed transfer rejects pagination by default',
  () =>
    assertArkhamSpendAllowed(
      'GET',
      '/transfers',
      { params: { ...goodTransferParams, before: 'abc' } },
      makeArkhamGuardrailState(),
      cfg,
    ),
  'pagination key "before"',
);

{
  const state = makeArkhamGuardrailState();
  assertArkhamSpendAllowed('GET', '/transfers', { params: goodTransferParams }, state, cfg);
  check('bounded transfer call reserves estimated row credits', state.rowCreditsPlanned === 50, String(state.rowCreditsPlanned));
  expectThrow(
    'row credit run budget blocks cumulative overspend',
    () =>
      assertArkhamSpendAllowed(
        'GET',
        '/transfers',
        { params: { ...goodTransferParams, limit: '10' } },
        state,
        cfg,
      ),
    'planned row credits 70 exceed run budget 60',
  );
}

{
  const state = makeArkhamGuardrailState();
  assertArkhamSpendAllowed(
    'GET',
    '/intelligence/address/Wallet111111111111111111111111111111111111',
    {},
    state,
    cfg,
  );
  assertArkhamSpendAllowed(
    'GET',
    '/intelligence/address_enriched/Wallet222222222222222222222222222222222',
    {},
    state,
    cfg,
  );
  expectThrow(
    'label lookup run budget blocks third single-address lookup',
    () =>
      assertArkhamSpendAllowed(
        'GET',
        '/intelligence/address/Wallet333333333333333333333333333333333333',
        {},
        state,
        cfg,
      ),
    'planned label lookups 3 exceed run budget 2',
  );
}

expectThrow(
  'default config blocks single-address label lookup until explicitly budgeted',
  () =>
    assertArkhamSpendAllowed(
      'GET',
      '/intelligence/address/Wallet111111111111111111111111111111111111',
      {},
      makeArkhamGuardrailState(),
      makeArkhamGuardrailConfig({}),
    ),
  'planned label lookups 1 exceed run budget 0',
);

expectThrow(
  'batch intelligence is opt-in',
  () =>
    assertArkhamSpendAllowed(
      'POST',
      '/intelligence/address_enriched/batch/all',
      { body: { addresses: ['A', 'B'] } },
      makeArkhamGuardrailState(),
      cfg,
    ),
  'batch intelligence is disabled',
);

{
  const state = makeArkhamGuardrailState();
  const batchCfg = makeArkhamGuardrailConfig({
    ARKHAM_ALLOW_BATCH_INTEL: '1',
    ARKHAM_LABEL_LOOKUP_RUN_BUDGET: '1000',
  });
  assertArkhamSpendAllowed(
    'POST',
    '/intelligence/address_enriched/batch/all',
    { body: { addresses: ['A', 'B'] } },
    state,
    batchCfg,
  );
  check(
    'allowed enriched batch/all reserves fixed 1000 lookup cost',
    state.labelLookupsPlanned === 1000,
    String(state.labelLookupsPlanned),
  );
}

expectThrow(
  'enabled batch intelligence still respects fixed endpoint cost',
  () =>
    assertArkhamSpendAllowed(
      'POST',
      '/intelligence/address_enriched/batch/all',
      { body: { addresses: ['A'] } },
      makeArkhamGuardrailState(),
      makeArkhamGuardrailConfig({
        ARKHAM_ALLOW_BATCH_INTEL: '1',
        ARKHAM_LABEL_LOOKUP_RUN_BUDGET: '999',
      }),
    ),
  'planned label lookups 1000 exceed run budget 999',
);

{
  const state = makeArkhamGuardrailState();
  const warnings: string[] = [];
  observeArkhamDatapoints(
    '/intelligence/address/test',
    { datapoints: { remaining: 1999 } },
    state,
    cfg,
    (msg) => warnings.push(msg),
  );
  check('observed datapoint remaining is stored', state.datapointsRemainingSeen === 1999, String(state.datapointsRemainingSeen));
  check('below-reserve datapoints emits warning', warnings.length === 1, warnings[0]);
}

if (!pass) {
  console.error('ARKHAM GUARDRAILS SELFTEST FAILED');
  process.exit(1);
}
console.log('ARKHAM GUARDRAILS SELFTEST PASSED');
