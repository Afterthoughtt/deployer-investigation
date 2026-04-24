/**
 * parse-selected-signatures.ts — bounded Helius getTransaction parser.
 *
 * Reads candidate wallets from a review summary and signature lists from a raw
 * wallet-review artifact, then parses at most N recent signatures per wallet.
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { heliusRpc } from './utils.js';

interface CliArgs {
  reviewPath: string;
  summaryPath: string;
  outPath: string;
  signaturesPerWallet: number;
  maxWallets: number;
  execute: boolean;
  question: string | null;
}

interface ReviewArtifact {
  wallets: Array<{
    address: string;
    helius_signatures?: Array<{
      signature: string;
      blockTime: number | null;
      slot: number;
      err: unknown;
    }>;
  }>;
}

interface SummaryArtifact {
  manual_follow_up_queue?: Array<{
    address: string;
    follow_up_priority?: number;
  }>;
}

interface ParsedTxOutput {
  timestamp: string;
  question: string;
  executed: boolean;
  source_review_artifact: string;
  source_summary_artifact: string;
  limits: {
    wallets_requested: number;
    wallets_selected: number;
    signatures_per_wallet: number;
    signatures_selected: number;
  };
  results: ParsedWalletResult[];
}

interface ParsedWalletResult {
  address: string;
  selected_signatures: Array<{
    signature: string;
    slot: number;
    blockTime: number | null;
    parsed_transaction: unknown | null;
    summary: TransactionSummary | null;
    error: string | null;
  }>;
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
    signaturesPerWallet: 1,
    maxWallets: 6,
    execute: false,
    question: null,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--review') {
      args.reviewPath = requireValue(argv, ++i, arg);
    } else if (arg === '--summary') {
      args.summaryPath = requireValue(argv, ++i, arg);
    } else if (arg === '--out') {
      args.outPath = requireValue(argv, ++i, arg);
    } else if (arg === '--signatures-per-wallet') {
      args.signaturesPerWallet = parsePositiveInt(arg, requireValue(argv, ++i, arg));
    } else if (arg === '--max-wallets') {
      args.maxWallets = parsePositiveInt(arg, requireValue(argv, ++i, arg));
    } else if (arg === '--question') {
      args.question = requireValue(argv, ++i, arg);
    } else if (arg === '--execute') {
      args.execute = true;
    } else if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    } else {
      throw new Error(`unknown arg: ${arg}`);
    }
  }

  if (!args.reviewPath) throw new Error('--review is required');
  if (!args.summaryPath) throw new Error('--summary is required');
  if (!args.outPath) throw new Error('--out is required');
  if (args.execute && !args.question) throw new Error('--execute requires --question');
  return args;
}

function requireValue(argv: string[], i: number, flag: string): string {
  const v = argv[i];
  if (v === undefined || v.startsWith('--')) {
    throw new Error(`${flag} requires a value`);
  }
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

function loadSelectedWallets(summary: SummaryArtifact, maxWallets: number): string[] {
  const queue = summary.manual_follow_up_queue ?? [];
  return queue
    .slice()
    .sort((a, b) => (a.follow_up_priority ?? 9999) - (b.follow_up_priority ?? 9999))
    .slice(0, maxWallets)
    .map((item) => item.address);
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

  const walletIndex = keys.findIndex((key) => key.pubkey === wallet);
  const preBalances = Array.isArray(meta?.preBalances) ? (meta.preBalances as number[]) : [];
  const postBalances = Array.isArray(meta?.postBalances) ? (meta.postBalances as number[]) : [];
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

function systemTransferFromInstruction(
  ix: Record<string, unknown>,
): TransactionSummary['systemTransfers'] {
  const parsed = ix.parsed as Record<string, unknown> | undefined;
  if (ix.program !== 'system' || parsed?.type !== 'transfer') return [];
  const info = parsed.info as Record<string, unknown> | undefined;
  return [
    {
      source: typeof info?.source === 'string' ? info.source : null,
      destination: typeof info?.destination === 'string' ? info.destination : null,
      lamports: typeof info?.lamports === 'number' ? info.lamports : null,
    },
  ];
}

function printUsage(): void {
  console.log(`Usage:
  tsx src/audit/parse-selected-signatures.ts --review <wallet-review.json> --summary <summary.json> --out <out.json> --question <text> --execute [options]

Options:
  --review <path>                    Raw wallet-review artifact with helius_signatures.
  --summary <path>                   Summary artifact with manual_follow_up_queue.
  --out <path>                       Output JSON path.
  --signatures-per-wallet <n>        Default: 1.
  --max-wallets <n>                  Default: 6.
  --question <text>                  Required with --execute.
  --execute                          Perform live Helius getTransaction calls.
`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const review = readJson<ReviewArtifact>(args.reviewPath);
  const summary = readJson<SummaryArtifact>(args.summaryPath);
  const selectedWallets = loadSelectedWallets(summary, args.maxWallets);
  const reviewByWallet = new Map(review.wallets.map((wallet) => [wallet.address, wallet]));
  const selectedSignatures = selectedWallets.flatMap((address) =>
    (reviewByWallet.get(address)?.helius_signatures ?? [])
      .slice(0, args.signaturesPerWallet)
      .map((signature) => ({ address, signature })),
  );

  console.log('Bounded selected-signature parse');
  console.log(`  Wallets selected: ${selectedWallets.length}`);
  console.log(`  Signatures selected: ${selectedSignatures.length}`);
  console.log(`  Signatures per wallet: ${args.signaturesPerWallet}`);
  console.log(`  Question: ${args.question ?? '(dry-run only; not provided)'}`);
  console.log(`  Execute: ${args.execute ? 'yes' : 'no'}`);
  console.log('  Providers: Helius getTransaction only; no Arkham; no Nansen.');

  if (!args.execute) {
    console.log('\nDry-run only. Add --execute after confirming the plan.');
    return;
  }

  const output: ParsedTxOutput = {
    timestamp: new Date().toISOString(),
    question: args.question ?? '',
    executed: true,
    source_review_artifact: args.reviewPath,
    source_summary_artifact: args.summaryPath,
    limits: {
      wallets_requested: selectedWallets.length,
      wallets_selected: selectedWallets.length,
      signatures_per_wallet: args.signaturesPerWallet,
      signatures_selected: selectedSignatures.length,
    },
    results: [],
  };

  for (const address of selectedWallets) {
    const wallet = reviewByWallet.get(address);
    const sigs = (wallet?.helius_signatures ?? []).slice(0, args.signaturesPerWallet);
    const result: ParsedWalletResult = { address, selected_signatures: [] };
    for (const sig of sigs) {
      try {
        const tx = await heliusRpc('getTransaction', [
          sig.signature,
          { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 },
        ]);
        result.selected_signatures.push({
          signature: sig.signature,
          slot: sig.slot,
          blockTime: sig.blockTime,
          parsed_transaction: tx,
          summary: summarizeTransaction(tx, address),
          error: null,
        });
        console.log(`  parsed ${address} ${sig.signature}`);
      } catch (err) {
        result.selected_signatures.push({
          signature: sig.signature,
          slot: sig.slot,
          blockTime: sig.blockTime,
          parsed_transaction: null,
          summary: null,
          error: err instanceof Error ? err.message : String(err),
        });
        console.log(`  error ${address} ${sig.signature}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    output.results.push(result);
  }

  const out = resolve(args.outPath);
  writeFileSync(out, JSON.stringify(output, null, 2) + '\n');
  console.log(`\nwrote ${out}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
