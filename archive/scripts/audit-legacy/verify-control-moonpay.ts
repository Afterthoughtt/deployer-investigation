// Control-test: compare user's MoonPay control purchases against L10 baseline.
//
// Goal: verify MoonPay flow mechanics, identify the sending hot wallet(s) (MP1/MP2/new?),
// empirically determine MoonPay's Solana fee rate, and check memo/CU fingerprints.

import 'dotenv/config';
import { heliusRpc } from './utils';

const MP1 = 'Cc3bpPzUvgAzdW9Nv7dUQ8cpap8Xa7ujJgLdpqGrTCu6';
const MP2 = '5F1seMKUqSNhv45f6FhB2cFmgJbk8U1avJw7M6TexUq1';
const KNOWN_MP = new Map<string, string>([
  [MP1, 'MP1'],
  [MP2, 'MP2'],
]);

// Wallet(s) to investigate — pass as CLI args, or fall back to the original control wallet.
const CLI_WALLETS = process.argv.slice(2);
const WALLETS: string[] =
  CLI_WALLETS.length > 0 ? CLI_WALLETS : ['EFqEizHwwDVaFehqFvGwzZhcn7Nk9MUMJSuZivsRm5xn'];

type Sig = { signature: string; slot: number; blockTime: number | null; err: unknown };
type Ix = { programId: string; program?: string; parsed?: unknown; data?: string };
type Tx = {
  blockTime: number;
  slot: number;
  meta: { fee: number; err: unknown; preBalances: number[]; postBalances: number[] };
  transaction: {
    message: {
      accountKeys: Array<{ pubkey: string; signer: boolean; writable: boolean }>;
      instructions: Ix[];
    };
  };
};
type PurchaseSummary = {
  wallet: string;
  sender: string;
  lamports: number;
  blockTime: number;
  memo?: string;
  cuLimit?: number;
  cuPrice?: bigint;
};

function b58decode(s: string): Uint8Array {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let n = 0n;
  for (const c of s) {
    const i = alphabet.indexOf(c);
    if (i < 0) throw new Error(`bad b58 char: ${c}`);
    n = n * 58n + BigInt(i);
  }
  const bytes: number[] = [];
  while (n > 0n) {
    bytes.unshift(Number(n & 0xffn));
    n >>= 8n;
  }
  for (const c of s) {
    if (c === '1') bytes.unshift(0);
    else break;
  }
  return new Uint8Array(bytes);
}

function decodeCB(dataB58: string): string {
  const d = b58decode(dataB58);
  const tag = d[0];
  if (tag === 2 && d.length >= 5) {
    const limit = d[1] | (d[2] << 8) | (d[3] << 16) | (d[4] << 24);
    return `CU_Limit=${limit >>> 0}`;
  }
  if (tag === 3 && d.length >= 9) {
    const v = new DataView(d.buffer, d.byteOffset, d.byteLength);
    return `CU_Price=${v.getBigUint64(1, true).toString()} µlam/CU`;
  }
  return `tag=${tag}`;
}

async function priceAt(ts: number): Promise<number | null> {
  const url = `https://api.coingecko.com/api/v3/coins/solana/market_chart/range?vs_currency=usd&from=${ts - 3600}&to=${ts + 3600}`;
  const r = await fetch(url);
  if (!r.ok) return null;
  const j = (await r.json()) as { prices?: Array<[number, number]> };
  if (!j.prices?.length) return null;
  return j.prices.reduce((a, b) =>
    Math.abs(a[0] / 1000 - ts) <= Math.abs(b[0] / 1000 - ts) ? a : b,
  )[1];
}

async function analyzeWallet(CONTROL_WALLET: string): Promise<Array<{ sender: string; lamports: number; blockTime: number; memo?: string; cuLimit?: number; cuPrice?: bigint }>> {
  console.log(`═══ Control wallet: ${CONTROL_WALLET} ═══\n`);

  const sigs = (await heliusRpc('getSignaturesForAddress', [
    CONTROL_WALLET,
    { limit: 1000 },
  ])) as Sig[];
  console.log(`Total sigs: ${sigs.length}\n`);

  if (sigs.length === 0) {
    console.log('No transactions found on wallet.\n');
    return [];
  }

  // oldest first so we see purchase #1 before purchase #2
  const oldestFirst = [...sigs].reverse();
  console.log('All signatures (oldest → newest):');
  for (const s of oldestFirst) {
    console.log(
      '  ',
      s.signature,
      s.blockTime ? new Date(s.blockTime * 1000).toISOString() : '<no time>',
      'slot',
      s.slot,
    );
  }
  console.log();

  const incoming: Array<{ sig: string; sender: string; lamports: number; blockTime: number; ix: Ix[]; memo?: string; cuLimit?: number; cuPrice?: bigint }> = [];

  for (const s of oldestFirst) {
    const tx = (await heliusRpc('getTransaction', [
      s.signature,
      { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 },
    ])) as Tx | null;
    if (!tx) continue;

    // find system.transfer where destination = CONTROL_WALLET
    const ixs = tx.transaction.message.instructions;
    const transferIx = ixs.find((i) => {
      if (i.program !== 'system') return false;
      const p = i.parsed as { type?: string; info?: { destination?: string; source?: string; lamports?: number } } | undefined;
      if (p?.type !== 'transfer') return false;
      return p.info?.destination === CONTROL_WALLET;
    });
    if (!transferIx) continue;

    const info = (transferIx.parsed as { info: { source: string; destination: string; lamports: number } }).info;
    const memoIx = ixs.find((i) => i.program === 'spl-memo');
    const memo = memoIx ? (memoIx.parsed as string | undefined) : undefined;

    let cuLimit: number | undefined;
    let cuPrice: bigint | undefined;
    for (const ix of ixs) {
      if (ix.programId !== 'ComputeBudget111111111111111111111111111111' || !ix.data) continue;
      const d = b58decode(ix.data);
      if (d[0] === 2 && d.length >= 5) {
        cuLimit = (d[1] | (d[2] << 8) | (d[3] << 16) | (d[4] << 24)) >>> 0;
      } else if (d[0] === 3 && d.length >= 9) {
        const v = new DataView(d.buffer, d.byteOffset, d.byteLength);
        cuPrice = v.getBigUint64(1, true);
      }
    }

    incoming.push({
      sig: s.signature,
      sender: info.source,
      lamports: info.lamports,
      blockTime: tx.blockTime,
      ix: ixs,
      memo,
      cuLimit,
      cuPrice,
    });
  }

  console.log(`═══ Incoming MoonPay-shaped transfers: ${incoming.length} ═══\n`);

  for (let i = 0; i < incoming.length; i++) {
    const t = incoming[i];
    const mpLabel = KNOWN_MP.get(t.sender) ?? '⚠️ UNKNOWN (not MP1 or MP2)';
    const sol = t.lamports / 1e9;
    const iso = new Date(t.blockTime * 1000).toISOString();
    const price = await priceAt(t.blockTime);
    const gross = price ? sol * price : null;

    console.log(`── Purchase #${i + 1} ──`);
    console.log(`  sig:         ${t.sig}`);
    console.log(`  sender:      ${t.sender}  [${mpLabel}]`);
    console.log(`  amount:      ${sol} SOL (${t.lamports} lamports)`);
    console.log(`  blockTime:   ${iso}`);
    console.log(`  SOL/USD:     ${price?.toFixed(4) ?? 'n/a'}`);
    console.log(`  gross USD:   ${gross?.toFixed(2) ?? 'n/a'}`);
    console.log(`  memo:        ${t.memo ?? '<none>'}`);
    console.log(`  memo format: ${t.memo ? `${t.memo.length} chars, hex? ${/^[0-9a-f]+$/.test(t.memo)}` : 'n/a'}`);
    console.log(`  CU Limit:    ${t.cuLimit ?? '<none>'}`);
    console.log(`  CU Price:    ${t.cuPrice?.toString() ?? '<none>'} µlam/CU`);

    // Fee-rate reverse-math: if user truly paid $25, what fee rate was applied?
    // formula: gross_delivered = charge × (1 - fee)  →  fee = 1 - gross/charge
    if (gross) {
      console.log(`\n  Reverse fee math (assuming card charge = N USD):`);
      for (const charge of [25, 26.25, 27, 27.5, 28, 30]) {
        const impliedFee = 1 - gross / charge;
        console.log(`    charge $${charge.toFixed(2).padEnd(7)} → implied fee ${(impliedFee * 100).toFixed(2)}%`);
      }
    }
    console.log();
  }

  // ═══ Cross-comparison ═══
  if (incoming.length >= 2) {
    console.log('═══ Cross-purchase comparison ═══\n');
    const a = incoming[0];
    const b = incoming[1];
    console.log(`  same sender?       ${a.sender === b.sender}`);
    console.log(`  sender A:          ${a.sender}`);
    console.log(`  sender B:          ${b.sender}`);
    console.log(`  same CU limit?     ${a.cuLimit === b.cuLimit} (${a.cuLimit} vs ${b.cuLimit})`);
    console.log(`  same CU price?     ${a.cuPrice === b.cuPrice} (${a.cuPrice} vs ${b.cuPrice})`);
    console.log(`  memo A:            ${a.memo}`);
    console.log(`  memo B:            ${b.memo}`);
    console.log(`  time delta:        ${b.blockTime - a.blockTime}s (${((b.blockTime - a.blockTime) / 60).toFixed(1)}m)`);
    console.log();
  }

  return incoming.map((t) => ({
    sender: t.sender,
    lamports: t.lamports,
    blockTime: t.blockTime,
    memo: t.memo,
    cuLimit: t.cuLimit,
    cuPrice: t.cuPrice,
  }));
}

async function main() {
  const all: Array<{ wallet: string; purchases: Awaited<ReturnType<typeof analyzeWallet>> }> = [];
  for (const w of WALLETS) {
    const purchases = await analyzeWallet(w);
    all.push({ wallet: w, purchases });
    console.log('\n────────────────────────────────────────\n');
  }

  // ═══ Fingerprint consistency across all purchases ═══
  console.log('═══ Fingerprint consistency across ALL purchases (incl. L10) ═══\n');
  const L10: PurchaseSummary = { wallet: 'L10 deployer', sender: 'Cc3bpPzUvgAzdW9Nv7dUQ8cpap8Xa7ujJgLdpqGrTCu6', lamports: 13_443_000_000, blockTime: 1773550293, memo: '7c61e6fde07f70c202784ed4c9884939', cuLimit: 14548, cuPrice: 29386n };
  const rows: PurchaseSummary[] = [L10];
  for (const w of all) {
    for (const p of w.purchases) rows.push({ wallet: w.wallet, ...p });
  }

  console.log(`  rows:                ${rows.length}`);
  const senders = new Set(rows.map((r) => r.sender));
  console.log(`  distinct senders:    ${senders.size} → [${[...senders].join(', ')}]`);
  const cuLimits = new Set(rows.map((r) => r.cuLimit));
  console.log(`  distinct CU Limits:  ${cuLimits.size} → [${[...cuLimits].join(', ')}]`);
  const memoLens = new Set(rows.map((r) => r.memo?.length ?? 0));
  console.log(`  distinct memo lens:  ${memoLens.size} → [${[...memoLens].join(', ')}]`);
  const memoHex = rows.every((r) => r.memo && /^[0-9a-f]+$/.test(r.memo));
  console.log(`  all memos hex?       ${memoHex}`);
  const cuPrices = [...new Set(rows.map((r) => r.cuPrice?.toString()))];
  console.log(`  distinct CU Prices:  ${cuPrices.length} → [${cuPrices.join(', ')}]`);
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
