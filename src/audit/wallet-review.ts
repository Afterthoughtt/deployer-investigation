/**
 * wallet-review.ts — bounded wallet-space review runner.
 *
 * Dry-run is the default. Live calls require --execute and --question so each
 * run has an explicit wallet list, evidence question, and rough budget. Arkham
 * calls still pass through utils.ts guardrails before any network request.
 */

import { writeFileSync } from 'fs';
import { resolve } from 'path';

type Check =
  | 'helius-balance'
  | 'helius-signatures'
  | 'arkham-intel'
  | 'arkham-transfers';

const DEFAULT_CHECKS: Check[] = ['helius-balance', 'helius-signatures'];
const CHECKS = new Set<Check>([
  'helius-balance',
  'helius-signatures',
  'arkham-intel',
  'arkham-transfers',
]);

interface CliArgs {
  wallets: string[];
  question: string | null;
  checks: Check[];
  execute: boolean;
  outPath: string | null;
  signatureLimit: number;
  transferLimit: number;
  transferTimeLast: string | null;
  transferTimeGte: string | null;
  transferTimeLte: string | null;
}

interface ReviewOutput {
  timestamp: string;
  question: string;
  executed: boolean;
  plan: BudgetPlan;
  wallets: WalletReviewResult[];
}

interface BudgetPlan {
  walletCount: number;
  checks: Check[];
  estimated: {
    heliusCredits: number;
    arkhamLabelLookups: number;
    arkhamRowCredits: number;
  };
  notes: string[];
}

interface WalletReviewResult {
  address: string;
  helius_balance?: {
    lamports: number;
    sol: number;
  };
  helius_signatures?: Array<{
    signature: string;
    slot: number;
    blockTime: number | null;
    err: unknown;
    memo: string | null;
    confirmationStatus: string | null;
  }>;
  arkham_intel?: unknown;
  arkham_transfers?: {
    meta: unknown;
    count: number | null;
    returned: number;
    body: unknown;
  };
  errors: string[];
}

type AuditUtils = typeof import('./utils.js');

let auditUtilsPromise: Promise<AuditUtils> | null = null;

function loadAuditUtils(): Promise<AuditUtils> {
  auditUtilsPromise ??= import('./utils.js');
  return auditUtilsPromise;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    wallets: [],
    question: null,
    checks: DEFAULT_CHECKS,
    execute: false,
    outPath: null,
    signatureLimit: 5,
    transferLimit: 10,
    transferTimeLast: null,
    transferTimeGte: null,
    transferTimeLte: null,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--execute') {
      args.execute = true;
    } else if (arg === '--wallet') {
      args.wallets.push(requireValue(argv, ++i, arg));
    } else if (arg === '--wallets') {
      args.wallets.push(
        ...requireValue(argv, ++i, arg)
          .split(',')
          .map((w) => w.trim())
          .filter(Boolean),
      );
    } else if (arg === '--question') {
      args.question = requireValue(argv, ++i, arg);
    } else if (arg === '--checks') {
      args.checks = parseChecks(requireValue(argv, ++i, arg));
    } else if (arg === '--out') {
      args.outPath = requireValue(argv, ++i, arg);
    } else if (arg === '--signature-limit') {
      args.signatureLimit = parsePositiveInt(arg, requireValue(argv, ++i, arg));
    } else if (arg === '--transfer-limit') {
      args.transferLimit = parsePositiveInt(arg, requireValue(argv, ++i, arg));
    } else if (arg === '--transfer-time-last') {
      args.transferTimeLast = requireValue(argv, ++i, arg);
    } else if (arg === '--transfer-time-gte') {
      args.transferTimeGte = requireValue(argv, ++i, arg);
    } else if (arg === '--transfer-time-lte') {
      args.transferTimeLte = requireValue(argv, ++i, arg);
    } else if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    } else {
      throw new Error(`unknown arg: ${arg}`);
    }
  }

  args.wallets = Array.from(new Set(args.wallets));
  validateArgs(args);
  return args;
}

function requireValue(argv: string[], i: number, flag: string): string {
  const v = argv[i];
  if (v === undefined || v.startsWith('--')) {
    throw new Error(`${flag} requires a value`);
  }
  return v;
}

function parseChecks(raw: string): Check[] {
  const checks = raw
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);
  if (checks.length === 0) throw new Error('--checks must include at least one check');
  for (const c of checks) {
    if (!CHECKS.has(c as Check)) {
      throw new Error(`unknown check "${c}"; valid: ${Array.from(CHECKS).join(', ')}`);
    }
  }
  return checks as Check[];
}

function parsePositiveInt(flag: string, raw: string): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`${flag} must be a positive integer`);
  }
  return n;
}

function validateArgs(args: CliArgs): void {
  if (args.wallets.length === 0) {
    throw new Error('provide at least one --wallet or --wallets value');
  }
  for (const wallet of args.wallets) {
    if (!isSolanaAddress(wallet)) {
      throw new Error(`invalid Solana address: ${wallet}`);
    }
  }
  if (args.execute && !args.question) {
    throw new Error('--execute requires --question');
  }
  if (
    args.checks.includes('arkham-transfers') &&
    !args.transferTimeLast &&
    !args.transferTimeGte
  ) {
    throw new Error(
      'arkham-transfers requires --transfer-time-last or --transfer-time-gte',
    );
  }
}

function isSolanaAddress(addr: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr);
}

function makeBudgetPlan(args: CliArgs): BudgetPlan {
  const heliusCredits =
    (args.checks.includes('helius-balance') ? args.wallets.length : 0) +
    (args.checks.includes('helius-signatures') ? args.wallets.length * 10 : 0);
  const arkhamLabelLookups = args.checks.includes('arkham-intel')
    ? args.wallets.length
    : 0;
  const arkhamRowCredits = args.checks.includes('arkham-transfers')
    ? args.wallets.length * args.transferLimit * 2
    : 0;
  const notes = [
    'Helius signature estimates use the project 10-credit class for getSignaturesForAddress.',
    'Arkham transfer row estimate is limit * 2 credits per wallet; guardrails may block tighter.',
    'Dry-run prints only the plan. Use --execute for live calls.',
  ];
  if (args.checks.includes('arkham-intel')) {
    notes.push('Arkham intel consumes scarce label lookups; set ARKHAM_LABEL_LOOKUP_RUN_BUDGET explicitly for live runs.');
  }
  return {
    walletCount: args.wallets.length,
    checks: args.checks,
    estimated: {
      heliusCredits,
      arkhamLabelLookups,
      arkhamRowCredits,
    },
    notes,
  };
}

async function reviewWallet(address: string, args: CliArgs): Promise<WalletReviewResult> {
  const result: WalletReviewResult = { address, errors: [] };

  if (args.checks.includes('helius-balance')) {
    try {
      const { heliusRpc } = await loadAuditUtils();
      const balance = (await heliusRpc('getBalance', [address])) as { value: number };
      result.helius_balance = {
        lamports: balance.value,
        sol: balance.value / 1e9,
      };
    } catch (err) {
      result.errors.push(`helius-balance: ${errMessage(err)}`);
    }
  }

  if (args.checks.includes('helius-signatures')) {
    try {
      const { heliusRpc } = await loadAuditUtils();
      const sigs = (await heliusRpc('getSignaturesForAddress', [
        address,
        { limit: args.signatureLimit },
      ])) as WalletReviewResult['helius_signatures'];
      result.helius_signatures = sigs;
    } catch (err) {
      result.errors.push(`helius-signatures: ${errMessage(err)}`);
    }
  }

  if (args.checks.includes('arkham-intel')) {
    try {
      const { arkhamMeta } = await loadAuditUtils();
      const { body } = await arkhamMeta(`/intelligence/address/${address}`);
      result.arkham_intel = body;
    } catch (err) {
      result.errors.push(`arkham-intel: ${errMessage(err)}`);
    }
  }

  if (args.checks.includes('arkham-transfers')) {
    try {
      const { arkhamMeta } = await loadAuditUtils();
      const { body, meta } = await arkhamMeta(
        '/transfers',
        makeArkhamTransferParams(address, args),
        true,
      );
      const bodyObj = body as { transfers?: unknown[]; data?: unknown[]; count?: number };
      const rows = bodyObj.transfers ?? bodyObj.data ?? [];
      result.arkham_transfers = {
        meta,
        count: typeof bodyObj.count === 'number' ? bodyObj.count : null,
        returned: Array.isArray(rows) ? rows.length : 0,
        body,
      };
    } catch (err) {
      result.errors.push(`arkham-transfers: ${errMessage(err)}`);
    }
  }

  return result;
}

function makeArkhamTransferParams(
  address: string,
  args: CliArgs,
): Record<string, string> {
  const params: Record<string, string> = {
    base: address,
    chains: 'solana',
    limit: String(args.transferLimit),
    sortKey: 'time',
    sortDir: 'desc',
  };
  if (args.transferTimeLast) params.timeLast = args.transferTimeLast;
  if (args.transferTimeGte) params.timeGte = args.transferTimeGte;
  if (args.transferTimeLte) params.timeLte = args.transferTimeLte;
  return params;
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function printPlan(args: CliArgs, plan: BudgetPlan): void {
  console.log('Bounded wallet review');
  console.log(`  Wallets: ${plan.walletCount}`);
  console.log(`  Checks: ${plan.checks.join(', ')}`);
  console.log(`  Question: ${args.question ?? '(dry-run only; not provided)'}`);
  console.log(`  Execute: ${args.execute ? 'yes' : 'no'}`);
  console.log('  Estimated max cost:');
  console.log(`    Helius credits: ${plan.estimated.heliusCredits}`);
  console.log(`    Arkham label lookups: ${plan.estimated.arkhamLabelLookups}`);
  console.log(`    Arkham row credits: ${plan.estimated.arkhamRowCredits}`);
  for (const note of plan.notes) console.log(`  Note: ${note}`);
}

function printSummary(output: ReviewOutput): void {
  console.log('\nReview summary');
  for (const r of output.wallets) {
    const parts = [r.address];
    if (r.helius_balance) parts.push(`${r.helius_balance.sol.toFixed(6)} SOL`);
    if (r.helius_signatures) parts.push(`${r.helius_signatures.length} sigs`);
    if (r.arkham_transfers) {
      parts.push(`${r.arkham_transfers.returned} Arkham transfer rows`);
    }
    if (r.errors.length > 0) parts.push(`${r.errors.length} error(s)`);
    console.log(`  ${parts.join(' | ')}`);
  }
}

function printUsage(): void {
  console.log(`Usage:
  tsx src/audit/wallet-review.ts --wallet <address> --question <text> --execute [options]

Options:
  --wallet <address>                 Add one wallet. May repeat.
  --wallets <a,b,c>                  Add comma-separated wallets.
  --question <text>                  Required with --execute.
  --checks <list>                    Default: ${DEFAULT_CHECKS.join(',')}
                                     Valid: ${Array.from(CHECKS).join(',')}
  --signature-limit <n>              Default: 5.
  --transfer-limit <n>               Default: 10. Arkham guardrail default max: 25.
  --transfer-time-last <duration>    Required for arkham-transfers unless --transfer-time-gte is set.
  --transfer-time-gte <timestamp>    Lower time bound for arkham-transfers.
  --transfer-time-lte <timestamp>    Optional upper time bound for arkham-transfers.
  --out <path>                       Write JSON result artifact.
  --execute                          Perform live API calls. Omit for dry-run budget plan.
`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const plan = makeBudgetPlan(args);
  printPlan(args, plan);

  if (!args.execute) {
    console.log('\nDry-run only. Add --execute after confirming the plan.');
    return;
  }

  const output: ReviewOutput = {
    timestamp: new Date().toISOString(),
    question: args.question ?? '',
    executed: true,
    plan,
    wallets: [],
  };

  for (const wallet of args.wallets) {
    output.wallets.push(await reviewWallet(wallet, args));
  }

  printSummary(output);
  if (args.outPath) {
    const out = resolve(args.outPath);
    writeFileSync(out, JSON.stringify(output, null, 2) + '\n');
    console.log(`\nwrote ${out}`);
  }
}

main().catch((err) => {
  console.error(errMessage(err));
  process.exit(1);
});
