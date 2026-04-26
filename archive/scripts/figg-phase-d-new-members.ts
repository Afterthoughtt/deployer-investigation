/**
 * figg-phase-d-new-members.ts — Probe the 19 newly-surfaced Sniper Network
 * userEntity members with Arkham enriched batch + Helius wallet identity +
 * signatures + balance.
 *
 * These wallets appear in the Arkham userEntity baf37731-8a94-4ba3-85db-0aa9bdc35532
 * (name="Sniper Network") which clusters Figg + SUSYE + DmA9 + Figg-bridge + 22YY15.
 * Goal: determine which of these 19 are active signers, ATAs, dust-poisoners, or
 * dormant; surface any with deployer-network or Figg-cluster ties.
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { arkhamEnrichedBatch, heliusBatchIdentity, heliusRpc } from './utils.js';

interface CliArgs {
  execute: boolean;
  question: string | null;
  out: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    execute: false,
    question: null,
    out: 'data/results/figg-phase-d-new-members-2026-04-25.json',
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
  console.log(`Usage: tsx src/audit/figg-phase-d-new-members.ts --execute --question "<text>" [--out <path>]

Required env: ARKHAM_ALLOW_BATCH_INTEL=1, ARKHAM_LABEL_LOOKUP_RUN_BUDGET >= 19`);
}

const NEW_SNIPER_NETWORK_MEMBERS = [
  'EKVVGr4ViDbLaLSTVvNgeNkhoXUDaK6vTeNd77YJCCaP',
  'F8apn98Fsy6ZX9ns3KLZHS4nNPxXf3nrxGkKrFXLfyx2',
  'APfiMHCjpXX6nZADMU4r5FkTkSAqwrPZREtdKQpjmUXf',
  '6gnyg2XSfYcY77shX2gB3jY7A6UMcyQfRB6KwNZC31E8',
  'AJkPbLugpNPQLcY2p3toAPoeJt1MoPkKzn231So2sAtq',
  'HGBDXXp4J92r3w8Dc4kcwz5ZSebmwXg7uVwtc1y2B8yr',
  '87Y63pqmCEu21TNrJGAj4mgrZFrRdJ2s5uT9SbrP9sLm',
  'EP42Hi81m5ArXpXt8ei9GX6aT37TMJrAZNmc1cMCX34g',
  '7QJM8rXXUz4vTgKyQJNJyCtNLe9YuSpQoSsQUMZSRWHj',
  '6ryCG9unTP3wgSeh5yDJk34oHXPpeF5m7Cr8Y6Y7nrWY',
  'Ay2RqYZe7sSemKNuvTr6LcSSMUV6LebYgJLBrpZhvHA',
  '98KvdqZJcwXSx2mxV1itXxWnWM5Ziuu5bsw4KKqvZhX7', // registry: SUSYE trading wallet
  'GoS4PT6q1kxKAbxymAh3pEix8MD8zVV55amdgECJatTp',
  'Ge2kdwU74jbHAUSEbTSosfrCJiNiAxH4LdH8jDxcc2KJ',
  'DYJUQgcGLJNH3E4qhNFX2ZLnDFuz5kRgHamncsrNLzJb',
  'GWoyRCBngoWXd7SDb9qs9m5BeFyjM3W4g3nLgwpppeiR',
  '7KdYZx73XYEKu7QSDq4Vh9zVjjKvDeGkBrFz1Z8cykWP',
  'HNtUfwrF2UnNBJBQ6VCCbTTRYHi8SuHDBzxf9i1CwEUU',
  'HyeRfQsb7iuCNdX2H2G9q6LyBmCaB3gF98tgHeEgycfw',
];

interface ArkhamSolanaEntry {
  address?: string;
  arkhamLabel?: { name?: string } | null;
  arkhamEntity?: { id?: string; name?: string } | null;
  userEntity?: { id?: string; name?: string; addresses?: { solana?: string[] } } | null;
  isUserAddress?: boolean | null;
  populatedTags?: Array<{ id?: string; label?: string; rank?: number }>;
}

async function getBalanceLamports(address: string): Promise<number | null> {
  try {
    const res = (await heliusRpc('getBalance', [address])) as { value?: number };
    return res?.value ?? null;
  } catch {
    return null;
  }
}

async function getSignatureCount(address: string): Promise<number | null> {
  try {
    const res = (await heliusRpc('getSignaturesForAddress', [address, { limit: 1000 }])) as Array<unknown>;
    return Array.isArray(res) ? res.length : null;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  const targets = NEW_SNIPER_NETWORK_MEMBERS;
  console.log('Phase D follow-up — Arkham + Helius probes on new Sniper Network members');
  console.log('  unique addresses:', targets.length);
  if (!args.execute) {
    console.log('Dry-run only. Pass --execute --question "<text>" to run live.');
    return;
  }

  // Arkham
  const { body: arkBody, meta: arkMeta } = await arkhamEnrichedBatch(targets);
  const rawArk = arkBody as Record<string, unknown>;
  const addrMapRaw = (rawArk?.addresses as Record<string, { solana?: ArkhamSolanaEntry }>) || (rawArk as Record<string, { solana?: ArkhamSolanaEntry }>);
  console.log('  arkham datapoints remaining:', arkMeta.datapoints.remaining ?? 'unknown');

  // Helius batchWalletIdentity
  let heliusIdentity: unknown[] = [];
  try {
    heliusIdentity = await heliusBatchIdentity(targets);
  } catch (err) {
    console.error('heliusBatchIdentity failed:', err instanceof Error ? err.message : err);
  }
  const identityByIndex = heliusIdentity;

  // getBalance + getSignaturesForAddress per wallet (cheap, sequential to respect Helius rate limit)
  const heliusInfo: Array<{ address: string; balance_sol: number | null; sig_count_capped_1000: number | null }> = [];
  for (const a of targets) {
    const lam = await getBalanceLamports(a);
    const sigs = await getSignatureCount(a);
    heliusInfo.push({
      address: a,
      balance_sol: lam !== null ? lam / 1e9 : null,
      sig_count_capped_1000: sigs,
    });
    await new Promise((r) => setTimeout(r, 110));
  }

  // Stitch results
  const enriched = targets.map((address, idx) => {
    const sol = addrMapRaw[address]?.solana || {};
    const id = (identityByIndex[idx] as { entity?: { name?: string }; address?: string }) || {};
    const info = heliusInfo[idx];
    return {
      address,
      arkham: {
        user_entity: sol.userEntity ? { id: sol.userEntity.id, name: sol.userEntity.name } : null,
        arkham_label: sol.arkhamLabel?.name || null,
        arkham_entity: sol.arkhamEntity?.name || null,
        is_user_address: sol.isUserAddress ?? null,
        tags: (sol.populatedTags || []).map((t) => t.label || t.id || '').filter(Boolean),
      },
      helius_identity: id?.entity?.name ?? null,
      balance_sol: info.balance_sol,
      sig_count_capped_1000: info.sig_count_capped_1000,
    };
  });

  console.log();
  console.log('Per-address results:');
  for (const e of enriched) {
    console.log(
      `  ${e.address}  bal=${e.balance_sol === null ? '?' : e.balance_sol.toFixed(3)}  sigs<=1000=${e.sig_count_capped_1000 ?? '?'}  user=${e.arkham.user_entity?.name || ''}  label=${e.arkham.arkham_label || ''}  ent=${e.arkham.arkham_entity || ''}  signer=${e.arkham.is_user_address}  helius=${e.helius_identity || ''}`
    );
  }

  const out = {
    metadata: {
      generatedAt: new Date().toISOString(),
      phase: 'D-followup — new Sniper Network members',
      question: args.question,
      arkham_datapoints_remaining: arkMeta.datapoints.remaining ?? null,
    },
    enriched,
    raw_arkham: rawArk,
    raw_helius_identity: heliusIdentity,
    raw_helius_balance_sigs: heliusInfo,
  };
  mkdirSync(join(process.cwd(), 'data', 'results'), { recursive: true });
  writeFileSync(args.out, JSON.stringify(out, null, 2));
  console.log(`\nwrote ${args.out}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack || err.message : err);
  process.exit(1);
});
