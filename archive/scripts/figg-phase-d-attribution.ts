/**
 * figg-phase-d-attribution.ts — Arkham enriched-batch attribution sweep across
 * the full Figg cluster + insider sniper + terminus + novel-operator set.
 *
 * Single Arkham POST /intelligence/address_enriched/batch/all call. Reserves one
 * label slot per submitted address. Dry-run by default; --execute required.
 *
 * Wallet list is assembled from:
 *   - Confirmed Figg cluster + sniper set (handoff §6)
 *   - L10 insider snipers (DmA9, 7DkvxGJ, D4tU7mrf, BqP79)
 *   - SUSYE deployer + DmA9 collection wallet
 *   - Cluster terminus accumulators (registry-tagged)
 *   - 45 unknown_recurse Figg recipients (figg-recipients-classified.json)
 *   - 12 novel operator-list dev wallets not yet in network-map.json
 *
 * Investigation question: Are these wallets labeled by Arkham as exchanges,
 * casinos, OTC desks, smart money, family offices, or known entity clusters
 * that overlap with the deployer-network's known cashout fingerprint
 * (Coinbase J6YUyB4P/BR1HiYtc/CB1-CB10, Fireblocks 9exPdTUV/9cDDJ5g2,
 * Rollbit RB3dQF6T, Token Millionaire 49mvMufi)?
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { arkhamEnrichedBatch } from './utils.js';

interface CliArgs {
  execute: boolean;
  question: string | null;
  out: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    execute: false,
    question: null,
    out: 'data/results/figg-phase-d-attribution-2026-04-25.json',
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--execute') args.execute = true;
    else if (a === '--question') args.question = argv[++i];
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--help') { printHelp(); process.exit(0); }
    else throw new Error(`Unknown arg: ${a}`);
  }
  if (args.execute && !args.question) {
    throw new Error('--question is required with --execute');
  }
  return args;
}

function printHelp(): void {
  console.log(`Usage:
  tsx src/audit/figg-phase-d-attribution.ts --execute --question "<text>" [--out <path>]

Required env (per CLAUDE.md guardrails):
  ARKHAM_ALLOW_BATCH_INTEL=1
  ARKHAM_LABEL_LOOKUP_RUN_BUDGET=<>= addresses submitted>`);
}

const FIGG_CLUSTER_HUB = 'FiggKseFrgdsk4u3TLpbPFLJDKbahqkJQKEchKcwYsNZ';

// Figg cluster member set (handoff §6 + registry sniper entries)
const FIGG_CLUSTER_MEMBERS = [
  '7ciGXut2rzyZeuRQjMZZ33gmyyT6JWaVKvEcTHNS5ny7',
  'C8CKhhsBxnvwwsL2skGvJss2wPvdVrdFRnbAZACJgJpb',
  'ALnatwuTNqEMk5yGqtP6mYeeoqr3WwrxHjSLR6UDqCyg',
  'FP914D1z5dPrZQMK5dGmSLrfokSQQ82tZayWvkztqQFm',
  '5bzSspdASDZ9DRCdjhWVTCgkMuk2Mzfyvq2L9zRvCCbv',
  '4Fr3XAVsabRf51JbwddjWerPuUzccH5iaPjShTLNgf39',
  '8AcMsuX4gifDAMZP3csVDyhyWztueLYrjFeVerodVjvv',
  '8rxR4jbRp9A81TA144C5pSTdvizqtADTBJRpz5CcBbyj',
  'HdTrWmLMhGciMMXETPG8DfL7Mhg6t4qU7sWVxAK2nsEN',
  '6zZAKeF5zftUZHCkoWpno6MbaX2LrLwYBCFaEwLLaFDk',
  '22YY15fRseLSWfwaMDZaBn7XdByJqTYzjn7mYjM1j2wS',
];

// L10 insider snipers (handoff §2.2)
const L10_INSIDER_SNIPERS = [
  'DmA9JabHEHFDzUQge7UFQ41jR7a8MThNn3GW87CvGWBn',
  '7DkvxGJbv9qiNGqqE7VZ5jdg6SLDgBtem7NgaiPmnrzA',
  'D4tU7mrfyuw3yRGeeB643EfFQYXSAMKeiJ7mVeYicBNv',
  'BqP79WmkKFRytsrWCqY2ra4n5XzUxQjTf45rHy7rkgtC',
];

// SUSYE deployer + DmA9 profit collection
const SUSYE_AND_COLLECTION = [
  '2Zizao3xpJGsoUFdvTJjYL8LijtFxR9v36cNBeDJJVSz',
  '9a22FhBeMJq4nuuvBRCsW67vAwPdLUN8eGJwykaUf7TH',
];

// Registry-tagged cluster terminus accumulators / cross-cluster bridges
const CLUSTER_TERMINUSES = [
  '9Qf2E4Ct8vwpxJRrAoMuLLQEvVYTJ3ytSi1Fb3GtUGPm',
  '2eVVdqWN4t7umzXGxJ21uTpB5WrUyyQMYnkq6UHtg3ba',
  '83Nf4kNbeaRSGwjYyStK4F3ctmH3v5Yar2GmWv9fJqf6',
  '43PcTMd37rBVECXqPjqSHBaM2JMPbiFvpF2Eei8u3LyU',
  '2wGZCehkDBMDPLMNXJjFf7kjAm46MJV3t3htmGVa4S16',
  'Dj9WL4NhdQHd9X46KjoFfkDgKho1ZDYqpomJerbqDfe1',
  'fUtfBAojmtP4JPRkZCMWQiP299VbzgoXUQuGbm9wpvM',
  'pNdKKMjGcx5m5AKuB79kYT5SpDSio4GFRj7xE1bosmU',
  '73Y9DZAxXzQWkb3YzQq6wLZH9vwdkCpgaQZbV8yVDuR4',
  '5HQZd9ovzAF1TLnHRAq1zcSnXC9HAp3EwhoxMHvo8rxB', // Rainbet protocol
  '9exPdTUVTCz9EKvZjXkKJSTJ5fZzJuwJHnFptrUFHFNH', // L7 deployer drain
  '9cDDJ5g2wPqVZUZwpPuwqzxN7ouvc6QFauFwrX2TTTAX', // 9exPdTUV next hop, 31k SOL institutional
  'Bra1HUNKj1tcM3iKnL3pHc2m1rXkXZ9JELq4ceivag34', // Deployer-network consolidation hub
];

// Novel operator-list wallets (12, not yet in network-map.json)
const NOVEL_OPERATOR_WALLETS = [
  'FFvb2ZQrjzMAgDpvHs8jVA5nJjTs1NnXD6wqTC3FKVed',
  'HV1KXxWFaSeriyFvXyx48FqG9BoFbfinB8njCJonqP7K',
  '9v2WwzusEng5Sjff7yxAHi1NWTkmnkVMd4S81EvHYbay',
  'Fvfn4cFh6DnpBKqZDqaXZidWnuR4vDi7orYxUTtd7Wjz',
  '6UqoiKuUCfyocGTPgpQ9fHkMeSKBsX6fz9cCMo9obkNF',
  '3EkbqEwyBPqQRmNKKkn3DsnS1tfaCNxHkAEGxWpx4EhT',
  'Gzy6Goc7hqe8D2wCQvfkMYo5k2BSKbL9L8sFRZpZdm9m',
  'DQ398vfKfjivZCPj5Vkxhy3dsb5BoeXXqvwKrLv2B88g',
  '6r2i7tdbxQsHUwygmRZ5bZmSYjNovc2MdN5kCbzUJE7P',
  'HuezqdSqApzevCfh9V7NfRsr41ybZtCJnZbF54RoemCh',
  'CzE9nLiaapgJgNtxi5gWddBfQRHipnqx5S9vuLBaWwap',
  '784bxhz6xUA88Rk6jb1aTU7FjjkoxAmASsrSDEry2Zvw',
];

interface ClassifiedRecipient {
  address: string;
  bucket: string;
  usdOut: number;
  solOut: number;
  rationale: string;
}

function loadUnknownRecurse(): string[] {
  const filePath = 'data/results/figg-recipients-classified.json';
  const data = JSON.parse(readFileSync(filePath, 'utf8')) as {
    classified: ClassifiedRecipient[];
  };
  return data.classified
    .filter((r) => r.bucket === 'unknown_recurse')
    .map((r) => r.address);
}

interface CategorizedTarget {
  address: string;
  category: string;
  source: string;
}

function buildTargetList(): CategorizedTarget[] {
  const buckets: Array<[string[], string, string]> = [
    [[FIGG_CLUSTER_HUB], 'figg_hub', 'handoff §6'],
    [FIGG_CLUSTER_MEMBERS, 'figg_cluster_member', 'handoff §6 + registry'],
    [L10_INSIDER_SNIPERS, 'l10_insider_sniper', 'handoff §2.2'],
    [SUSYE_AND_COLLECTION, 'susye_or_collection', 'registry'],
    [CLUSTER_TERMINUSES, 'cluster_terminus', 'registry / hop-2 trace'],
    [loadUnknownRecurse(), 'figg_unknown_recurse', 'figg-recipients-classified.json'],
    [NOVEL_OPERATOR_WALLETS, 'novel_operator_dev', 'operator session input 2026-04-25'],
  ];

  const seen = new Map<string, CategorizedTarget>();
  for (const [list, category, source] of buckets) {
    for (const address of list) {
      if (!seen.has(address)) {
        seen.set(address, { address, category, source });
      }
    }
  }
  return [...seen.values()];
}

interface ArkhamSolanaEntry {
  address?: string;
  chain?: string;
  arkhamEntity?: { id?: string; name?: string; type?: string } | null;
  arkhamLabel?: { name?: string; chainType?: string; address?: string } | null;
  userEntity?: {
    id?: string;
    name?: string;
    note?: string;
    type?: string | null;
    service?: string | null;
    addresses?: { solana?: string[]; ethereum?: string[] };
  } | null;
  isUserAddress?: boolean | null;
  isContract?: boolean;
  populatedTags?: Array<{ id?: string; label?: string; rank?: number }>;
  predictedEntities?: Array<{ id?: string; name?: string; type?: string; score?: number }>;
}

type ArkhamBatchBody = Record<string, { solana?: ArkhamSolanaEntry; ethereum?: ArkhamSolanaEntry }>;

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  const targets = buildTargetList();

  console.log('Phase D — Arkham enriched-batch attribution');
  console.log(`  unique addresses: ${targets.length}`);
  console.log(`  question: ${args.question || '(dry-run)'}`);
  console.log(`  out: ${args.out}`);
  console.log(`  estimated label-bucket lookups: ${targets.length}`);
  console.log(`  estimated datapoint cost: ~1000`);

  if (!args.execute) {
    console.log('\nDry-run only. Pass --execute --question "<text>" to run live.');
    console.log('Required env: ARKHAM_ALLOW_BATCH_INTEL=1, ARKHAM_LABEL_LOOKUP_RUN_BUDGET >= addresses');
    return;
  }

  const t0 = Date.now();
  const { body: batchBody, meta } = await arkhamEnrichedBatch(targets.map((t) => t.address));
  const dt = Date.now() - t0;
  console.log(`Arkham batch returned in ${dt}ms`);
  console.log(`  datapoints remaining: ${meta.datapoints.remaining ?? 'unknown'}`);

  // Index batch results by address. Response shape varies:
  //   small batches: { <address>: { solana: {...} } }
  //   large batches: { addresses: { <address>: { solana: {...} } } }
  // Verified empirically 2026-04-25 — handle both.
  const rawObj = batchBody as Record<string, unknown> | unknown[];
  const addrMap: ArkhamBatchBody = (() => {
    if (rawObj && typeof rawObj === 'object' && !Array.isArray(rawObj)) {
      const wrapped = (rawObj as { addresses?: unknown }).addresses;
      if (wrapped && typeof wrapped === 'object') return wrapped as ArkhamBatchBody;
      return rawObj as ArkhamBatchBody;
    }
    return {};
  })();
  const byAddress = new Map<string, ArkhamSolanaEntry>();
  for (const [k, v] of Object.entries(addrMap)) {
    const sol = v?.solana;
    if (sol) byAddress.set(k, sol);
  }

  // Extract every Sniper Network userEntity address (across responses) as a side-product.
  const sniperNetworkAddresses = new Set<string>();
  for (const [, sol] of byAddress) {
    const ent = sol.userEntity;
    if (ent && (ent.name === 'Sniper Network' || /sniper/i.test(ent.name || ''))) {
      for (const a of ent.addresses?.solana || []) sniperNetworkAddresses.add(a);
    }
  }

  const enriched = targets.map((t) => {
    const ark = byAddress.get(t.address) || {};
    return {
      address: t.address,
      category: t.category,
      source: t.source,
      arkham_entity: ark.arkhamEntity || null,
      arkham_label: ark.arkhamLabel || null,
      arkham_user_entity: ark.userEntity || null,
      arkham_isUserAddress: ark.isUserAddress ?? null,
      arkham_isContract: ark.isContract ?? null,
      arkham_tags: ark.populatedTags || [],
      arkham_predicted_entities: ark.predictedEntities || [],
    };
  });

  // Print summary table
  console.log('\nResults (userEntity / arkhamLabel / arkhamEntity / isUserAddress / topTags):');
  const labeled: typeof enriched = [];
  const unlabeled: typeof enriched = [];
  for (const e of enriched) {
    const hasLabel = !!(
      e.arkham_entity?.name ||
      e.arkham_label?.name ||
      e.arkham_user_entity?.name ||
      (e.arkham_tags && e.arkham_tags.length > 0)
    );
    if (hasLabel) labeled.push(e); else unlabeled.push(e);
    const userEnt = e.arkham_user_entity?.name || '';
    const lbl = e.arkham_label?.name || '';
    const ent = e.arkham_entity?.name || '';
    const sig = e.arkham_isUserAddress;
    const tagLabels = (e.arkham_tags || [])
      .map((t) => t.label || t.id)
      .filter((s): s is string => !!s)
      .slice(0, 3)
      .join('|');
    console.log(
      `  ${e.address}  [${e.category}]  user=${userEnt}  label=${lbl}  ent=${ent}  signer=${sig}  tags=${tagLabels}`
    );
  }
  console.log(`\nLabeled: ${labeled.length}  Unlabeled: ${unlabeled.length}`);
  if (sniperNetworkAddresses.size > 0) {
    console.log(`\nSniper Network userEntity addresses (${sniperNetworkAddresses.size}):`);
    for (const a of sniperNetworkAddresses) console.log('  ' + a);
  }

  const out = {
    metadata: {
      generatedAt: new Date().toISOString(),
      phase: 'D — attribution',
      question: args.question,
      total_targets: targets.length,
      labeled_count: labeled.length,
      unlabeled_count: unlabeled.length,
      arkham_datapoints_remaining: meta.datapoints.remaining ?? null,
    },
    sniper_network_user_entity_addresses: [...sniperNetworkAddresses],
    targets: enriched,
    raw_arkham_response: batchBody,
  };
  mkdirSync(join(process.cwd(), 'data', 'results'), { recursive: true });
  writeFileSync(args.out, JSON.stringify(out, null, 2));
  console.log(`\nwrote ${args.out}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack || err.message : err);
  process.exit(1);
});
