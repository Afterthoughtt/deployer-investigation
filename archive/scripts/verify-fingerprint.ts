import 'dotenv/config';
import fs from 'node:fs';

const HELIUS_API_KEY = process.env.HELIUS_API_KEY!;
const RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;

const COMPUTE_BUDGET_PROGRAM = 'ComputeBudget111111111111111111111111111111';
const SPL_MEMO_V1 = 'Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo';
const SPL_MEMO_V2 = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';

// Funding sigs from each candidate
const FUNDING_SIGS = [
  { addr: 'FtnvximrdUXhJpFxGM7Ji6Fh2bYm2cfr8s6R5W24E8fN', label: 'Ftnv (MP1, 14.1h)' },
  { addr: '6iuvAFTxpWSWRuMheGVVfZ7gEHcv1ssCzFSDsZALhiiY', label: '6iuv (MP2, 25.6h)' },
  { addr: '2zYi14tpQPjj2FsDFfnN4Y9B9qcTpHktEnQ8phnGNpCj', label: '2zYi (MP2, 59h)' },
  { addr: '6rHWN6qQksCMGxkZCCkSG64fEi8vBknTxt1keGH9izLv', label: '6rHW (MP1, 91h)' },
  { addr: '4aMinwtC8QFrTwQFPhPq7txie7WXGaQfpLVm52rzwkgb', label: '4aMi (MP1, 93h)' },
  { addr: '6uYzo6ZRYehusYyaaM8XbZE11da98hyaryBtDKVyB8Bb', label: '6uYz (DB says MP1 but parse said OTHER)' },
];

async function rpc(method: string, params: unknown[]): Promise<any> {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  return (await res.json() as any).result;
}

// Decode base58 to bytes (no external deps)
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function b58decode(s: string): Uint8Array {
  let x = 0n;
  for (const c of s) {
    const v = B58.indexOf(c);
    if (v < 0) throw new Error('bad b58');
    x = x * 58n + BigInt(v);
  }
  const bytes: number[] = [];
  while (x > 0n) { bytes.push(Number(x & 0xffn)); x >>= 8n; }
  // leading zeros
  for (const c of s) { if (c === '1') bytes.push(0); else break; }
  return new Uint8Array(bytes.reverse());
}

async function check(addr: string, label: string) {
  const sigs = await rpc('getSignaturesForAddress', [addr, { limit: 5 }]);
  if (!sigs || sigs.length === 0) return { addr, label, error: 'no sigs' };
  // Funding tx is the oldest
  const oldest = sigs[sigs.length - 1];
  const tx = await rpc('getTransaction', [oldest.signature, { encoding: 'json', maxSupportedTransactionVersion: 0 }]);
  if (!tx) return { addr, label, error: 'no tx' };
  const accountKeys: string[] = tx.transaction.message.accountKeys ?? [];
  const instructions = tx.transaction.message.instructions ?? [];
  const programIdIdx = (i: any) => i.programIdIndex ?? 0;
  let cuLimit: number | null = null;
  let memoText: string | null = null;
  let solInflow: { from: string; to: string; lamports: number } | null = null;
  for (const ins of instructions) {
    const prog = accountKeys[programIdIdx(ins)];
    if (prog === COMPUTE_BUDGET_PROGRAM) {
      const data = b58decode(ins.data);
      // Layout: byte 0 = discriminator (2 = SetComputeUnitLimit), bytes 1-4 = u32 LE
      if (data[0] === 2 && data.length >= 5) {
        cuLimit = data[1] | (data[2] << 8) | (data[3] << 16) | (data[4] << 24);
      }
    }
    if (prog === SPL_MEMO_V1 || prog === SPL_MEMO_V2) {
      const data = b58decode(ins.data);
      memoText = new TextDecoder().decode(data);
    }
  }
  // SOL inflow from pre/post balances
  const preBalances: number[] = tx.meta?.preBalances ?? [];
  const postBalances: number[] = tx.meta?.postBalances ?? [];
  const targetIdx = accountKeys.indexOf(addr);
  if (targetIdx >= 0) {
    const delta = postBalances[targetIdx] - preBalances[targetIdx];
    // Find a wallet with negative delta of similar magnitude as the source
    let bestSrc: string | null = null;
    let bestDeltaSrc = 0;
    for (let i = 0; i < accountKeys.length; i++) {
      if (i === targetIdx) continue;
      const d = postBalances[i] - preBalances[i];
      if (d < 0 && Math.abs(d) > Math.abs(bestDeltaSrc)) {
        bestDeltaSrc = d;
        bestSrc = accountKeys[i];
      }
    }
    solInflow = { from: bestSrc!, to: addr, lamports: delta };
  }
  const feePayer = accountKeys[0];
  return {
    addr, label,
    fundingSig: oldest.signature,
    feePayer,
    inflow: solInflow ? { from: solInflow.from, sol: solInflow.lamports / 1e9 } : null,
    feePayerIsSender: feePayer === solInflow?.from,
    cuLimit,
    memoText,
    cuMatchesMoonPay: cuLimit === 14548,
    memoLooksHex32: memoText?.length === 32 && /^[0-9a-fA-F]+$/.test(memoText) ? true : memoText ? false : null,
  };
}

const out = [];
for (const t of FUNDING_SIGS) {
  console.error(`Checking ${t.label}...`);
  try { out.push(await check(t.addr, t.label)); }
  catch (e: any) { out.push({ addr: t.addr, label: t.label, error: e.message }); }
}
fs.writeFileSync('/tmp/fingerprint_results.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
