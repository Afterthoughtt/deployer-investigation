import 'dotenv/config';
import { heliusRpc, arkhamBatchIntel } from './utils';

const DEPLOYER = '2mZzsVKNz1zJKRnLz2X74qGPMcSNGCkRM1U5BShsVMVB';
const MP1 = 'Cc3bpPzUvgAzdW9Nv7dUQ8cpap8Xa7ujJgLdpqGrTCu6';
const MP2 = '5F1seMKUqSNhv45f6FhB2cFmgJbk8U1avJw7M6TexUq1';
const FUNDING_SIG =
  '4hQpmGKE9irpwaEuzRL6kcK1c5uFGzfieaCAwXjvSSbLpUx4qGBKgZRpMvxuyspan7FrHEfNx8usvV9C6QS37UKu';
const FUNDING_BLOCKTIME = 1773550293;
const FUNDING_LAMPORTS = 13_443_000_000;
const SOL_AMOUNT = 13.443;

type Sig = { signature: string; slot: number; blockTime: number | null; err: unknown };
type Ix = { programId: string; accounts?: unknown; data?: string; parsed?: unknown; program?: string };
type Tx = {
  blockTime: number;
  slot: number;
  meta: { fee: number; err: unknown; logMessages: string[] };
  transaction: {
    message: {
      accountKeys: Array<{ pubkey: string; signer: boolean; writable: boolean }>;
      instructions: Ix[];
    };
  };
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
  // leading zeros
  for (const c of s) {
    if (c === '1') bytes.unshift(0);
    else break;
  }
  return new Uint8Array(bytes);
}

function decodeComputeBudget(dataB58: string): string {
  const d = b58decode(dataB58);
  const tag = d[0];
  if (tag === 2 && d.length >= 5) {
    const limit = d[1] | (d[2] << 8) | (d[3] << 16) | (d[4] << 24);
    return `SetComputeUnitLimit=${limit >>> 0}`;
  }
  if (tag === 3 && d.length >= 9) {
    const view = new DataView(d.buffer, d.byteOffset, d.byteLength);
    const price = view.getBigUint64(1, true);
    return `SetComputeUnitPrice=${price.toString()} µlamports/CU`;
  }
  if (tag === 1) return 'RequestHeapFrame';
  return `tag=${tag} hex=${Buffer.from(d).toString('hex')}`;
}

async function solPriceAt(isoDate: string): Promise<number | null> {
  // CoinGecko /coins/solana/history returns open-of-day price. For minute-level we'd need paid endpoints.
  // Free workaround: fetch market_chart/range with tight window.
  const ts = Math.floor(new Date(isoDate).getTime() / 1000);
  const url = `https://api.coingecko.com/api/v3/coins/solana/market_chart/range?vs_currency=usd&from=${ts - 300}&to=${ts + 300}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const j = (await res.json()) as { prices: Array<[number, number]> };
  if (!j.prices?.length) return null;
  // pick closest to target
  let best = j.prices[0];
  let bestDelta = Math.abs(best[0] / 1000 - ts);
  for (const p of j.prices) {
    const delta = Math.abs(p[0] / 1000 - ts);
    if (delta < bestDelta) {
      best = p;
      bestDelta = delta;
    }
  }
  return best[1];
}

async function main() {
  console.log('═══ L10 MoonPay Funding — Forensic Verification ═══\n');

  // 1. Confirm funding tx from chain (not fixture)
  console.log('1) FUNDING TX (re-fetch to verify fixture)\n');
  const fundingTx = (await heliusRpc('getTransaction', [
    FUNDING_SIG,
    { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 },
  ])) as Tx | null;

  if (!fundingTx) throw new Error('funding tx not found');

  const feePayer = fundingTx.transaction.message.accountKeys.find((a) => a.signer)?.pubkey;
  const transferIx = fundingTx.transaction.message.instructions.find(
    (i) => i.program === 'system' && (i.parsed as { type?: string })?.type === 'transfer',
  );
  const transferInfo = (transferIx?.parsed as { info: { lamports: number; source: string; destination: string } }).info;

  console.log('  slot:', fundingTx.slot);
  console.log('  blockTime:', fundingTx.blockTime, '→', new Date(fundingTx.blockTime * 1000).toISOString());
  console.log('  feePayer:', feePayer, feePayer === MP1 ? '(MP1)' : '');
  console.log('  transfer:', transferInfo.source, '→', transferInfo.destination);
  console.log('  lamports:', transferInfo.lamports, '(SOL:', transferInfo.lamports / 1e9, ')');
  console.log('  network fee:', fundingTx.meta.fee, 'lamports');

  // ComputeBudget decode
  console.log('\n  Compute budget instructions (MoonPay-set):');
  for (const ix of fundingTx.transaction.message.instructions) {
    if (ix.programId === 'ComputeBudget111111111111111111111111111111' && ix.data) {
      console.log('    ', decodeComputeBudget(ix.data));
    }
    if (ix.program === 'spl-memo') {
      console.log('    memo:', ix.parsed);
    }
  }

  // 2. SOL/USD price at funding moment + Fiat Shadow
  console.log('\n2) FIAT SHADOW — back-calculate card charge\n');
  const iso = new Date(FUNDING_BLOCKTIME * 1000).toISOString();
  const price = await solPriceAt(iso);
  console.log('  SOL/USD @', iso, ':', price);

  if (price) {
    const grossUSD = SOL_AMOUNT * price;
    console.log('  Gross USD delivered:', grossUSD.toFixed(2));
    // Report #2 claimed 4.5% card fee. Also try 3%, 3.5%, 4%, 5%, 4.99%
    const fees = [0.03, 0.035, 0.04, 0.045, 0.049, 0.05, 0.0499];
    console.log('  Implied card charge at various fee rates:');
    for (const f of fees) {
      console.log(`    @${(f * 100).toFixed(2)}% fee: $${(grossUSD / (1 - f)).toFixed(2)}`);
    }
  }

  // 3. First outgoing tx from 2mZzsVKN — TTFA + Phantom/Jupiter check
  console.log('\n3) TTFA — Time-to-First-Action of deployer wallet\n');
  const sigs = (await heliusRpc('getSignaturesForAddress', [
    DEPLOYER,
    { limit: 1000 },
  ])) as Sig[];
  console.log('  total sigs on wallet:', sigs.length);

  // sigs returned newest-first; earliest is last
  const oldestFirst = [...sigs].reverse();
  const funderIndex = oldestFirst.findIndex((s) => s.signature === FUNDING_SIG);
  console.log('  funding sig index (oldest-first):', funderIndex);
  const firstOutgoingCandidate = oldestFirst[funderIndex + 1];
  if (!firstOutgoingCandidate) {
    console.log('  no post-funding tx found');
    return;
  }
  console.log('  next sig after funding:', firstOutgoingCandidate.signature);
  console.log('  next sig blockTime:', firstOutgoingCandidate.blockTime, '→',
    firstOutgoingCandidate.blockTime ? new Date(firstOutgoingCandidate.blockTime * 1000).toISOString() : null);

  if (firstOutgoingCandidate.blockTime) {
    const ttfaSec = firstOutgoingCandidate.blockTime - FUNDING_BLOCKTIME;
    const hours = ttfaSec / 3600;
    console.log(`  TTFA: ${ttfaSec}s = ${hours.toFixed(2)}h`);
  }

  const firstTx = (await heliusRpc('getTransaction', [
    firstOutgoingCandidate.signature,
    { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 },
  ])) as Tx | null;

  if (firstTx) {
    const firstFeePayer = firstTx.transaction.message.accountKeys.find((a) => a.signer)?.pubkey;
    console.log('  first tx fee payer:', firstFeePayer);
    console.log('  first tx programs:');
    const programsSeen = new Set<string>();
    for (const ix of firstTx.transaction.message.instructions) {
      programsSeen.add(ix.programId);
    }
    for (const p of programsSeen) {
      console.log('    -', p);
    }
    console.log('\n  Compute budget instructions (user-set — fingerprint candidate):');
    for (const ix of firstTx.transaction.message.instructions) {
      if (ix.programId === 'ComputeBudget111111111111111111111111111111' && ix.data) {
        console.log('    ', decodeComputeBudget(ix.data));
      }
    }
  }

  // 4. Arkham labeling check on MP1 + MP2
  console.log('\n4) ARKHAM LABELING — does Arkham now label MP1/MP2 on Solana?\n');
  try {
    const intel = (await arkhamBatchIntel([MP1, MP2])) as Record<string, unknown>;
    for (const addr of [MP1, MP2]) {
      const entry = (intel as Record<string, unknown>)[addr];
      console.log(`  ${addr}:`);
      if (!entry) {
        console.log('    → no data');
        continue;
      }
      const e = entry as Record<string, unknown>;
      const solana = e.solana as Record<string, unknown> | undefined;
      if (solana) {
        const arkhamEntity = solana.arkhamEntity as { name?: string; type?: string } | undefined;
        const arkhamLabel = solana.arkhamLabel as { name?: string } | undefined;
        console.log('    solana.arkhamEntity:', arkhamEntity);
        console.log('    solana.arkhamLabel:', arkhamLabel);
        console.log('    solana.isUserAddress:', solana.isUserAddress);
      } else {
        console.log('    no solana block. Top-level keys:', Object.keys(e));
      }
    }
  } catch (e) {
    console.log('  arkham error:', e instanceof Error ? e.message : e);
  }
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
