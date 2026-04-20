// Stress-test: does the MoonPay fingerprint (CU Limit=14548 + 32-hex memo + sender pays)
// appear in outbound txs from OTHER on-ramps / CEXes? If yes → fingerprint is not MoonPay-unique.
// If no → fingerprint is MoonPay-specific.

import 'dotenv/config';
import { heliusRpc } from './utils';

const WALLETS: Array<{ label: string; address: string }> = [
  { label: 'Coinbase CB1', address: '5g7yNHyGLJ7fiQ9SN9mf47opDnMjc585kqXWt6d7aBWs' },
  { label: 'Coinbase CB2', address: '2AQdpHJ2JpcEgPiATUXjQxA8QmafFegfQwSLWSprPicm' },
  { label: 'Coinbase CB3', address: '9obNtb5GyUegcs3a1CbBkLuc5hEWynWfJC6gjz5uWQkE' },
  { label: 'Coinbase CB4', address: 'DPqsobysNf5iA9w7zrQM8HLzCKZEDMkZsWbiidsAt1xo' },
  { label: 'Coinbase CB5', address: '4NyK1AdJBNbgaJ9EsKz3J4rfeHsuYdjkTPg3JaNdLeFw' },
  { label: 'Coinbase CB6', address: 'H8sMJSCQxfKiFTCfDR3DUMLPwcRbM61LGFJ8N4dK3WjS' },
  { label: 'Coinbase CB7', address: 'D89hHJT5Aqyx1trP6EnGY9jJUB3whgnq3aUvvCqedvzf' },
  { label: 'Coinbase CB8', address: 'FpwQQhQQoEaVu3WU2qZMfF1hx48YyfwsLoRgXG83E99Q' },
  { label: 'Coinbase CB9', address: 'GJRs4FwHtemZ5ZE9x3FNvJ8TMwitKTh21yxdRPqn7npE' },
  { label: 'Coinbase CB10', address: 'AafGzY9eiC5Ud3YFZQwkaKApp48cVBAT2kksGvEjhUvH' },
  { label: 'Binance 5tzFkiKs', address: '5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9' },
];

const SIGS_PER_WALLET = 3;

type Sig = { signature: string; slot: number; blockTime: number | null; err: unknown };
type Ix = { programId: string; program?: string; parsed?: unknown; data?: string };
type Tx = {
  blockTime: number;
  slot: number;
  meta: { fee: number; err: unknown };
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
  for (const c of s) {
    if (c === '1') bytes.unshift(0);
    else break;
  }
  return new Uint8Array(bytes);
}

type FP = {
  sig: string;
  isOutbound: boolean;
  transferAmount: number | null;
  cuLimit: number | null;
  cuPrice: bigint | null;
  memo: string | null;
  memoLen: number | null;
  memoIsHex32: boolean;
  destination: string | null;
};

function extractFP(tx: Tx, walletAddr: string): FP {
  const ixs = tx.transaction.message.instructions;
  let cuLimit: number | null = null;
  let cuPrice: bigint | null = null;

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

  const memoIx = ixs.find((i) => i.program === 'spl-memo');
  const memo = memoIx ? ((memoIx.parsed as string | undefined) ?? null) : null;
  const memoIsHex32 = memo ? /^[0-9a-f]{32}$/.test(memo) : false;

  // Find a system.transfer where our wallet is the SOURCE (i.e., outbound from this wallet)
  const transferIx = ixs.find((i) => {
    if (i.program !== 'system') return false;
    const p = i.parsed as { type?: string; info?: { source?: string } } | undefined;
    return p?.type === 'transfer' && p.info?.source === walletAddr;
  });
  const transferInfo = transferIx
    ? (transferIx.parsed as { info: { source: string; destination: string; lamports: number } }).info
    : null;

  return {
    sig: '',
    isOutbound: transferInfo !== null,
    transferAmount: transferInfo ? transferInfo.lamports / 1e9 : null,
    cuLimit,
    cuPrice,
    memo,
    memoLen: memo?.length ?? null,
    memoIsHex32,
    destination: transferInfo?.destination ?? null,
  };
}

async function main() {
  console.log(`═══ Stress test: fingerprint of ${WALLETS.length} non-MoonPay on-ramps ═══\n`);

  type Row = { source: string; fp: FP };
  const all: Row[] = [];

  for (const w of WALLETS) {
    console.log(`── ${w.label}  ${w.address}`);

    const sigs = (await heliusRpc('getSignaturesForAddress', [
      w.address,
      { limit: 30 },
    ])) as Sig[];

    if (sigs.length === 0) {
      console.log('   no sigs\n');
      continue;
    }

    let outboundSeen = 0;

    for (const s of sigs) {
      if (outboundSeen >= SIGS_PER_WALLET) break;
      const tx = (await heliusRpc('getTransaction', [
        s.signature,
        { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 },
      ])) as Tx | null;
      if (!tx) continue;

      const fp = extractFP(tx, w.address);
      fp.sig = s.signature;
      if (!fp.isOutbound) continue;

      outboundSeen++;
      all.push({ source: w.label, fp });

      const moonpayMatch =
        fp.cuLimit === 14548 && fp.memoIsHex32;
      const flag = moonpayMatch ? '⚠️ MATCHES MoonPay fingerprint' : '— differs from MoonPay';

      console.log(`   sig=${fp.sig.slice(0, 44)}… SOL=${fp.transferAmount}`);
      console.log(
        `      CU Limit=${fp.cuLimit ?? 'none'}  CU Price=${fp.cuPrice?.toString() ?? 'none'}  memo=${fp.memo ?? 'none'}  (len=${fp.memoLen ?? 0})  ${flag}`,
      );
    }

    if (outboundSeen === 0) {
      console.log('   no outbound transfers in sampled 30 sigs\n');
    } else {
      console.log();
    }
  }

  // ═══ Aggregate summary ═══
  console.log('═══ Summary ═══\n');

  const cuLimits = new Map<number | 'none', number>();
  const memoLens = new Map<number, number>();
  const moonpayMatches: Row[] = [];

  for (const r of all) {
    const key = r.fp.cuLimit ?? 'none';
    cuLimits.set(key, (cuLimits.get(key) ?? 0) + 1);
    const ml = r.fp.memoLen ?? 0;
    memoLens.set(ml, (memoLens.get(ml) ?? 0) + 1);
    if (r.fp.cuLimit === 14548 && r.fp.memoIsHex32) {
      moonpayMatches.push(r);
    }
  }

  console.log(`  Total outbound txs sampled: ${all.length}`);
  console.log(`  CU Limit distribution:`);
  for (const [k, v] of [...cuLimits.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${k}: ${v}`);
  }
  console.log(`  memo length distribution:`);
  for (const [k, v] of [...memoLens.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${k === 0 ? 'no memo' : `${k} chars`}: ${v}`);
  }
  console.log(
    `\n  Non-MoonPay txs matching MoonPay fingerprint (CU=14548 + 32-hex memo): ${moonpayMatches.length}`,
  );
  for (const r of moonpayMatches) {
    console.log(`    ${r.source}: sig=${r.fp.sig.slice(0, 24)}…`);
  }
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
