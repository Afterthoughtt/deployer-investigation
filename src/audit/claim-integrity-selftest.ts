import {
  collectClaimFindings,
  collectRegistryRecords,
  collectTextClaimFindings,
  readJsonIfPossible,
} from './claim-integrity.js';

interface TestCase {
  name: string;
  run: () => void;
}

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

const registry = collectRegistryRecords({
  rxrp_repump_network: {
    buyer_wallets: {
      sample: {
        address: '7iVCXQn4u6tiTEfNVqbWSEsRdEi69E9oYsSMiepuECwi',
        verdict: 'network',
        role: 'network_connected',
        label: 'RXRP Buyer',
      },
    },
  },
});

const tests: TestCase[] = [
  {
    name: 'broad none-related claim is blocked',
    run: () => {
      const findings = collectTextClaimFindings(
        'bad.md',
        'None of the reviewed wallets are related to the deployer.',
      );
      assert(findings.length === 1, `expected one finding, got ${findings.length}`);
    },
  },
  {
    name: 'scoped not-revalidated claim is allowed',
    run: () => {
      const findings = collectTextClaimFindings(
        'good.md',
        'Direct deployer control was not revalidated in the latest five-transaction window.',
      );
      assert(findings.length === 0, `expected zero findings, got ${findings.length}`);
    },
  },
  {
    name: 'classified known wallet must carry registry verdict',
    run: () => {
      const text = JSON.stringify({
        metadata: { artifact_type: 'rxrp_full_investigation_summary' },
        wallets: [
          {
            address: '7iVCXQn4u6tiTEfNVqbWSEsRdEi69E9oYsSMiepuECwi',
            control_confidence: 'medium',
            operational_usefulness: 'copy_trade_candidate',
          },
        ],
      });
      const findings = collectClaimFindings('bad.json', text, registry);
      assert(
        findings.some((finding) => finding.kind === 'known-registry-wallet-missing-verdict'),
        'expected missing registry verdict finding',
      );
    },
  },
  {
    name: 'registry verdict conflict requires proposed change marker',
    run: () => {
      const text = JSON.stringify({
        metadata: { artifact_type: 'rxrp_full_investigation_summary' },
        wallets: [
          {
            address: '7iVCXQn4u6tiTEfNVqbWSEsRdEi69E9oYsSMiepuECwi',
            registry_verdict: 'not_network',
            control_confidence: 'low',
          },
        ],
      });
      const findings = collectClaimFindings('bad.json', text, registry);
      assert(
        findings.some((finding) => finding.kind === 'known-registry-wallet-verdict-conflict'),
        'expected registry verdict conflict finding',
      );
    },
  },
  {
    name: 'registry verdict conflict is allowed for explicit proposed change',
    run: () => {
      const text = JSON.stringify({
        metadata: { artifact_type: 'rxrp_full_investigation_summary' },
        wallets: [
          {
            address: '7iVCXQn4u6tiTEfNVqbWSEsRdEi69E9oYsSMiepuECwi',
            registry_verdict: 'not_network',
            control_confidence: 'low',
            proposed_registry_change: true,
          },
        ],
      });
      const findings = collectClaimFindings('proposed.json', text, registry);
      assert(findings.length === 0, `expected zero findings, got ${findings.length}`);
    },
  },
  {
    name: 'json parser helper returns null for non-json',
    run: () => {
      assert(readJsonIfPossible('not json') === null, 'expected null for non-json');
    },
  },
];

let failures = 0;
for (const test of tests) {
  try {
    test.run();
    console.log(`PASS ${test.name}`);
  } catch (err) {
    failures++;
    console.error(`FAIL ${test.name}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

if (failures > 0) {
  console.error(`CLAIM INTEGRITY SELFTEST FAILED (${failures} failure${failures === 1 ? '' : 's'})`);
  process.exit(1);
}

console.log('CLAIM INTEGRITY SELFTEST PASSED');
