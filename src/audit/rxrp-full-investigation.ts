/**
 * rxrp-full-investigation.ts — bounded follow-up for RXRP high-balance wallets.
 *
 * Uses Helius getTransaction, Nansen counterparties, and Arkham Solana transfers.
 * Dry-run is default; live calls require --execute and --question.
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { arkhamMeta, heliusRpc, nansen } from './utils.js';

interface CliArgs {
  reviewPath: string;
  summaryPath: string;
  outPath: string;
  maxWallets: number;
  parseLimit: number;
  nansenLimit: number;
  arkhamTransferLimit: number;
  timeGte: string;
  timeLte: string | null;
  execute: boolean;
  question: string | null;
}

interface WalletReviewArtifact {
  wallets: Array<{
    address: string;
    helius_balance?: { sol: number };
    helius_signatures?: Array<{
      signature: string;
      slot: number;
      blockTime: number | null;
      err: unknown;
    }>;
  }>;
}

interface SummaryArtifact {
  manual_follow_up_queue?: Array<{
    address: string;
    balance_sol?: number;
    follow_up_priority?: number;
    prior_status?: string;
    prior_label?: string | null;
  }>;
}

interface InvestigationOutput {
  timestamp: string;
  question: string;
  executed: boolean;
  source_review_artifact: string;
  source_summary_artifact: string;
  budget_plan: BudgetPlan;
  wallets: WalletInvestigationResult[];
}

interface BudgetPlan {
  walletCount: number;
  heliusGetTransactionCalls: number;
  nansenCounterpartyCalls: number;
  nansenEstimatedCredits: number;
  arkhamTransferCalls: number;
  arkhamTransferLimit: number;
  arkhamEstimatedRowCredits: number;
  arkhamLabelLookups: number;
  notes: string[];
}

interface WalletInvestigationResult {
  address: string;
  balance_sol: number | null;
  prior_status: string | null;
  prior_label: string | null;
  parsed_transactions: Array<{
    signature: string;
    slot: number;
    blockTime: number | null;
    parsed_transaction: unknown | null;
    summary: TransactionSummary | null;
    error: string | null;
  }>;
  nansen_counterparties: unknown;
  arkham_transfers: {
    meta: unknown;
    returned: number;
    count: number | null;
    body: unknown;
  } | null;
  errors: string[];
}

interface TransactionSummary {
  slot: number | null;
  blockTime: number | null;
  feeLamports: number | null;
  walletLamportDelta: number | null;
  feePayer: string | null;
  signers: string[];
  topLevelPrograms: string[];
  systemTransfers: Array<{
    source: string | null;
    destination: string | null;
    lamports: number | null;
  }>;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    reviewPath: '',
    summaryPath: '',
    outPath: '',
    maxWallets: 6,
    parseLimit: 5,
    nansenLimit: 10,
    arkhamTransferLimit: 10,
    timeGte: '2026-03-22T00:00:00Z',
    timeLte: null,
    execute: false,
    question: null,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--review') args.reviewPath = requireValue(argv, ++i, arg);
    else if (arg === '--summary') args.summaryPath = requireValue(argv, ++i, arg);
    else if (arg === '--out') args.outPath = requireValue(argv, ++i, arg);
    else if (arg === '--max-wallets') args.maxWallets = parsePositiveInt(arg, requireValue(argv, ++i, arg));
    else if (arg === '--parse-limit') args.parseLimit = parsePositiveInt(arg, requireValue(argv, ++i, arg));
    else if (arg === '--nansen-limit') args.nansenLimit = parsePositiveInt(arg, requireValue(argv, ++i, arg));
    else if (arg === '--arkham-transfer-limit') args.arkhamTransferLimit = parsePositiveInt(arg, requireValue(argv, ++i, arg));
    else if (arg === '--time-gte') args.timeGte = requireValue(argv, ++i, arg);
    else if (arg === '--time-lte') args.timeLte = requireValue(argv, ++i, arg);
    else if (arg === '--question') args.question = requireValue(argv, ++i, arg);
    else if (arg === '--execute') args.execute = true;
    else if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    } else {
      throw new Error(`unknown arg: ${arg}`);
    }
  }

  if (!args.reviewPath) throw new Error('--review is required');
  if (!args.summaryPath) throw new Error('--summary is required');
  if (!args.outPath) throw new Error('--out is required');
  if (args.arkhamTransferLimit > 25) throw new Error('--arkham-transfer-limit must be <= 25');
  if (args.execute && !args.question) throw new Error('--execute requires --question');
  return args;
}

function requireValue(argv: string[], i: number, flag: string): string {
  const v = argv[i];
  if (v === undefined || v.startsWith('--')) throw new Error(`${flag} requires a value`);
  return v;
}

function parsePositiveInt(flag: string, raw: string): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`${flag} must be a positive integer`);
  return n;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(path), 'utf8')) as T;
}

type FollowUpWallet = NonNullable<SummaryArtifact['manual_follow_up_queue']>[number];

function selectWallets(summary: SummaryArtifact, maxWallets: number): FollowUpWallet[] {
  return (summary.manual_follow_up_queue ?? [])
    .slice()
    .sort((a, b) => (a.follow_up_priority ?? 9999) - (b.follow_up_priority ?? 9999))
    .slice(0, maxWallets);
}

function makeBudgetPlan(walletCount: number, args: CliArgs): BudgetPlan {
  return {
    walletCount,
    heliusGetTransactionCalls: walletCount * args.parseLimit,
    nansenCounterpartyCalls: walletCount,
    nansenEstimatedCredits: walletCount * 5,
    arkhamTransferCalls: walletCount,
    arkhamTransferLimit: args.arkhamTransferLimit,
    arkhamEstimatedRowCredits: walletCount * args.arkhamTransferLimit * 2,
    arkhamLabelLookups: 0,
    notes: [
      'No Arkham intelligence/label endpoints are used in this run.',
      'Arkham transfer calls are Solana-only, subject-filtered, time-bounded, limit-capped, and non-paginated.',
      'Nansen counterparties are aggregate triage only until transaction-level evidence confirms any link.',
      'Helius parses only signatures already selected by the prior wallet-review artifact.',
    ],
  };
}

function summarizeTransaction(tx: unknown, wallet: string): TransactionSummary | null {
  if (!tx || typeof tx !== 'object') return null;
  const record = tx as Record<string, unknown>;
  const meta = record.meta as Record<string, unknown> | undefined;
  const transaction = record.transaction as Record<string, unknown> | undefined;
  const message = transaction?.message as Record<string, unknown> | undefined;
  const keys = Array.isArray(message?.accountKeys)
    ? (message.accountKeys as Array<Record<string, unknown>>)
    : [];
  const instructions = Array.isArray(message?.instructions)
    ? (message.instructions as Array<Record<string, unknown>>)
    : [];
  const preBalances = Array.isArray(meta?.preBalances) ? (meta.preBalances as number[]) : [];
  const postBalances = Array.isArray(meta?.postBalances) ? (meta.postBalances as number[]) : [];
  const walletIndex = keys.findIndex((key) => key.pubkey === wallet);
  const walletLamportDelta =
    walletIndex >= 0 &&
    Number.isFinite(preBalances[walletIndex]) &&
    Number.isFinite(postBalances[walletIndex])
      ? postBalances[walletIndex] - preBalances[walletIndex]
      : null;

  return {
    slot: typeof record.slot === 'number' ? record.slot : null,
    blockTime: typeof record.blockTime === 'number' ? record.blockTime : null,
    feeLamports: typeof meta?.fee === 'number' ? meta.fee : null,
    walletLamportDelta,
    feePayer: typeof keys[0]?.pubkey === 'string' ? keys[0].pubkey : null,
    signers: keys
      .filter((key) => key.signer === true && typeof key.pubkey === 'string')
      .map((key) => key.pubkey as string),
    topLevelPrograms: instructions
      .map((ix) => ix.programId ?? ix.program)
      .filter((program): program is string => typeof program === 'string'),
    systemTransfers: instructions.flatMap((ix) => systemTransferFromInstruction(ix)),
  };
}

function systemTransferFromInstruction(ix: Record<string, unknown>): TransactionSummary['systemTransfers'] {
  const parsed = ix.parsed as Record<string, unknown> | undefined;
  if (ix.program !== 'system' || parsed?.type !== 'transfer') return [];
  const info = parsed.info as Record<string, unknown> | undefined;
  return [{
    source: typeof info?.source === 'string' ? info.source : null,
    destination: typeof info?.destination === 'string' ? info.destination : null,
    lamports: typeof info?.lamports === 'number' ? info.lamports : null,
  }];
}

async function investigateWallet(
  wallet: NonNullable<SummaryArtifact['manual_follow_up_queue']>[number],
  review: WalletReviewArtifact,
  args: CliArgs,
): Promise<WalletInvestigationResult> {
  const reviewWallet = review.wallets.find((entry) => entry.address === wallet.address);
  const result: WalletInvestigationResult = {
    address: wallet.address,
    balance_sol: wallet.balance_sol ?? reviewWallet?.helius_balance?.sol ?? null,
    prior_status: wallet.prior_status ?? null,
    prior_label: wallet.prior_label ?? null,
    parsed_transactions: [],
    nansen_counterparties: null,
    arkham_transfers: null,
    errors: [],
  };

  for (const sig of (reviewWallet?.helius_signatures ?? []).slice(0, args.parseLimit)) {
    try {
      const tx = await heliusRpc('getTransaction', [
        sig.signature,
        { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 },
      ]);
      result.parsed_transactions.push({
        signature: sig.signature,
        slot: sig.slot,
        blockTime: sig.blockTime,
        parsed_transaction: tx,
        summary: summarizeTransaction(tx, wallet.address),
        error: null,
      });
    } catch (err) {
      result.parsed_transactions.push({
        signature: sig.signature,
        slot: sig.slot,
        blockTime: sig.blockTime,
        parsed_transaction: null,
        summary: null,
        error: errMessage(err),
      });
      result.errors.push(`helius-getTransaction ${sig.signature}: ${errMessage(err)}`);
    }
  }

  try {
    result.nansen_counterparties = await nansen('/profiler/address/counterparties', {
      address: wallet.address,
      chain: 'solana',
      date: { from: args.timeGte, to: args.timeLte ?? new Date().toISOString() },
      group_by: 'wallet',
      source_input: 'Combined',
      pagination: { page: 1, per_page: args.nansenLimit },
      order_by: [{ field: 'total_volume_usd', direction: 'DESC' }],
    });
  } catch (err) {
    result.nansen_counterparties = { error: errMessage(err) };
    result.errors.push(`nansen-counterparties: ${errMessage(err)}`);
  }

  try {
    const params: Record<string, string> = {
      base: wallet.address,
      chains: 'solana',
      limit: String(args.arkhamTransferLimit),
      sortKey: 'time',
      sortDir: 'desc',
      timeGte: args.timeGte,
    };
    if (args.timeLte) params.timeLte = args.timeLte;
    const { body, meta } = await arkhamMeta('/transfers', params, true);
    const bodyObj = body as { transfers?: unknown[]; data?: unknown[]; count?: number };
    const rows = bodyObj.transfers ?? bodyObj.data ?? [];
    result.arkham_transfers = {
      meta,
      returned: Array.isArray(rows) ? rows.length : 0,
      count: typeof bodyObj.count === 'number' ? bodyObj.count : null,
      body,
    };
  } catch (err) {
    result.errors.push(`arkham-transfers: ${errMessage(err)}`);
  }

  return result;
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function printUsage(): void {
  console.log(`Usage:
  tsx src/audit/rxrp-full-investigation.ts --review <wallet-review.json> --summary <summary.json> --out <out.json> --question <text> --execute [options]

Options:
  --review <path>                    Raw wallet-review artifact.
  --summary <path>                   Summary artifact with manual_follow_up_queue.
  --out <path>                       Output JSON path.
  --max-wallets <n>                  Default: 6.
  --parse-limit <n>                  Helius signatures per wallet. Default: 5.
  --nansen-limit <n>                 Counterparties per wallet. Default: 10.
  --arkham-transfer-limit <n>        Transfers per wallet, max 25. Default: 10.
  --time-gte <timestamp>             Lower time bound. Default: 2026-03-22T00:00:00Z.
  --time-lte <timestamp>             Optional upper time bound.
  --question <text>                  Required with --execute.
  --execute                          Perform live provider calls.
`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const review = readJson<WalletReviewArtifact>(args.reviewPath);
  const summary = readJson<SummaryArtifact>(args.summaryPath);
  const wallets = selectWallets(summary, args.maxWallets);
  const plan = makeBudgetPlan(wallets.length, args);

  console.log('Bounded RXRP full investigation');
  console.log(`  Wallets: ${plan.walletCount}`);
  console.log(`  Helius getTransaction calls: ${plan.heliusGetTransactionCalls}`);
  console.log(`  Nansen counterparty calls: ${plan.nansenCounterpartyCalls} (~${plan.nansenEstimatedCredits} credits)`);
  console.log(`  Arkham transfer calls: ${plan.arkhamTransferCalls}`);
  console.log(`  Arkham transfer row limit: ${plan.arkhamTransferLimit}`);
  console.log(`  Arkham estimated row credits: ${plan.arkhamEstimatedRowCredits}`);
  console.log(`  Arkham label lookups: ${plan.arkhamLabelLookups}`);
  console.log(`  Time lower bound: ${args.timeGte}`);
  if (args.timeLte) console.log(`  Time upper bound: ${args.timeLte}`);
  console.log(`  Question: ${args.question ?? '(dry-run only; not provided)'}`);
  console.log(`  Execute: ${args.execute ? 'yes' : 'no'}`);
  for (const note of plan.notes) console.log(`  Note: ${note}`);

  if (!args.execute) {
    console.log('\nDry-run only. Add --execute after confirming the plan.');
    return;
  }

  const output: InvestigationOutput = {
    timestamp: new Date().toISOString(),
    question: args.question ?? '',
    executed: true,
    source_review_artifact: args.reviewPath,
    source_summary_artifact: args.summaryPath,
    budget_plan: plan,
    wallets: [],
  };

  for (const [i, wallet] of wallets.entries()) {
    console.log(`\n[${i + 1}/${wallets.length}] ${wallet.address}`);
    output.wallets.push(await investigateWallet(wallet, review, args));
  }

  const out = resolve(args.outPath);
  writeFileSync(out, JSON.stringify(output, null, 2) + '\n');
  console.log(`\nwrote ${out}`);
}

main().catch((err) => {
  console.error(errMessage(err));
  process.exit(1);
});
