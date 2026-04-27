/**
 * figg-l11-armed-check.ts — Pull recent inbound activity (Helius wallet
 * transfers page 1) for the 19 newly-surfaced Sniper Network userEntity members
 * + known Tier-1 candidates (22YY15, 6zZ, DmA9). Goal: identify which were
 * funded inside the L11 window and by whom — those are pre-armed snipers.
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { heliusWallet } from './utils.js';

interface CliArgs {
  execute: boolean;
  question: string | null;
  out: string;
  perPage: number;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    execute: false,
    question: null,
    out: 'data/results/figg-l11-armed-check-2026-04-25.json',
    perPage: 50,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--execute') args.execute = true;
    else if (a === '--question') args.question = argv[++i];
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--per-page') args.perPage = Number(argv[++i]);
    else if (a === '--help') { printHelp(); process.exit(0); }
    else throw new Error(`Unknown arg: ${a}`);
  }
  if (args.execute && !args.question) {
    throw new Error('--question is required with --execute');
  }
  return args;
}

function printHelp(): void {
  console.log('Usage: tsx src/audit/figg-l11-armed-check.ts --execute --question "<text>" [--out <path>] [--per-page <n>]');
}

const TARGETS = [
  // 19 new Sniper Network members
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
  '98KvdqZJcwXSx2mxV1itXxWnWM5Ziuu5bsw4KKqvZhX7', // SUSYE trading wallet (registry)
  'GoS4PT6q1kxKAbxymAh3pEix8MD8zVV55amdgECJatTp',
  'Ge2kdwU74jbHAUSEbTSosfrCJiNiAxH4LdH8jDxcc2KJ',
  'DYJUQgcGLJNH3E4qhNFX2ZLnDFuz5kRgHamncsrNLzJb',
  'GWoyRCBngoWXd7SDb9qs9m5BeFyjM3W4g3nLgwpppeiR',
  '7KdYZx73XYEKu7QSDq4Vh9zVjjKvDeGkBrFz1Z8cykWP',
  'HNtUfwrF2UnNBJBQ6VCCbTTRYHi8SuHDBzxf9i1CwEUU',
  'HyeRfQsb7iuCNdX2H2G9q6LyBmCaB3gF98tgHeEgycfw',
  // Known Tier-1 / Tier-2 candidates for cross-check
  '22YY15fRseLSWfwaMDZaBn7XdByJqTYzjn7mYjM1j2wS',
  '6zZAKeF5zftUZHCkoWpno6MbaX2LrLwYBCFaEwLLaFDk',
  'DmA9JabHEHFDzUQge7UFQ41jR7a8MThNn3GW87CvGWBn',
];

interface Transfer {
  signature?: string;
  blockTime?: number | null;
  fromAddress?: string;
  toAddress?: string;
  amount?: number; // SOL
  asset?: { tokenAddress?: string; symbol?: string; amount?: number };
  type?: string;
}

interface TransfersPage {
  result?: { transfers?: Transfer[]; nextCursor?: string | null };
}

async function getRecentTransfers(address: string, perPage: number): Promise<Transfer[]> {
  // Helius Wallet API: GET /v1/wallet/transfers?address=...&perPage=...
  const endpoint = `transfers?address=${address}&perPage=${perPage}`;
  const res = (await heliusWallet(endpoint, {})) as TransfersPage;
  return res?.result?.transfers || [];
}

function fmtTime(t: number | null | undefined): string {
  if (!t) return '?';
  return new Date(t * 1000).toISOString().slice(0, 19).replace('T', ' ');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  console.log('L11 armed check — recent inbound activity on 19 new Sniper Network members + 3 Tier-1 candidates');
  console.log('  targets:', TARGETS.length);
  console.log('  per-page:', args.perPage);
  console.log('  estimated Helius cost:', TARGETS.length, 'wallet API calls × 100cr ≈', TARGETS.length * 100, 'credits');
  if (!args.execute) {
    console.log('Dry-run only. Pass --execute --question "<text>" to run live.');
    return;
  }

  const out: Array<{
    address: string;
    transfer_count: number;
    most_recent: Transfer | null;
    last_inbound: Transfer | null;
    last_outbound: Transfer | null;
    distinct_senders: string[];
    distinct_recipients: string[];
    summary: string;
    transfers: Transfer[];
  }> = [];

  for (const address of TARGETS) {
    let transfers: Transfer[] = [];
    let err: string | null = null;
    try {
      transfers = await getRecentTransfers(address, args.perPage);
    } catch (e) {
      err = e instanceof Error ? e.message : String(e);
    }
    transfers.sort((a, b) => (b.blockTime || 0) - (a.blockTime || 0));
    const inbound = transfers.find((t) => t.toAddress === address);
    const outbound = transfers.find((t) => t.fromAddress === address);
    const sendersSet = new Set<string>();
    const recipientsSet = new Set<string>();
    for (const t of transfers) {
      if (t.toAddress === address && t.fromAddress) sendersSet.add(t.fromAddress);
      else if (t.fromAddress === address && t.toAddress) recipientsSet.add(t.toAddress);
    }

    const summary = err
      ? `ERR: ${err}`
      : `tx=${transfers.length} mostRecent=${fmtTime(transfers[0]?.blockTime)} lastIn=${fmtTime(inbound?.blockTime)}(${inbound?.amount ?? 0}SOL from ${inbound?.fromAddress?.slice(0, 8) || '?'}) lastOut=${fmtTime(outbound?.blockTime)}(${outbound?.amount ?? 0}SOL to ${outbound?.toAddress?.slice(0, 8) || '?'})`;
    console.log(`  ${address}  ${summary}`);
    out.push({
      address,
      transfer_count: transfers.length,
      most_recent: transfers[0] || null,
      last_inbound: inbound || null,
      last_outbound: outbound || null,
      distinct_senders: [...sendersSet],
      distinct_recipients: [...recipientsSet],
      summary,
      transfers,
    });
    await new Promise((r) => setTimeout(r, 110));
  }

  const artifact = {
    metadata: {
      generatedAt: new Date().toISOString(),
      phase: 'L11 armed check',
      question: args.question,
      target_count: TARGETS.length,
    },
    targets: out,
  };
  mkdirSync(join(process.cwd(), 'data', 'results'), { recursive: true });
  writeFileSync(args.out, JSON.stringify(artifact, null, 2));
  console.log(`\nwrote ${args.out}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack || err.message : err);
  process.exit(1);
});
