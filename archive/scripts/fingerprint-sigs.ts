import 'dotenv/config';

const HELIUS_API_KEY = process.env.HELIUS_API_KEY!;
const RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;

const SIGS = process.argv.slice(2);
if (!SIGS.length) { console.error('usage: tsx fingerprint-sigs.ts <sig> [<sig>...]'); process.exit(2); }

const COMPUTE_BUDGET = 'ComputeBudget111111111111111111111111111111';
const MEMO_V1 = 'Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo';
const MEMO_V2 = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function b58decode(s: string): Uint8Array {
  let x = 0n;
  for (const c of s) { const v = B58.indexOf(c); if (v<0) throw 0; x = x*58n + BigInt(v); }
  const bs: number[] = [];
  while (x > 0n) { bs.push(Number(x & 0xffn)); x >>= 8n; }
  for (const c of s) { if (c==='1') bs.push(0); else break; }
  return new Uint8Array(bs.reverse());
}

async function rpc(method: string, params: unknown[]) {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  return ((await res.json()) as any).result;
}

for (const sig of SIGS) {
  const tx = await rpc('getTransaction', [sig, { encoding: 'json', maxSupportedTransactionVersion: 0 }]);
  if (!tx) { console.log(sig, 'NO TX'); continue; }
  const keys: string[] = tx.transaction.message.accountKeys;
  const ins = tx.transaction.message.instructions;
  let cu: number | null = null;
  let memo: string | null = null;
  for (const i of ins) {
    const prog = keys[i.programIdIndex];
    if (prog === COMPUTE_BUDGET) {
      const d = b58decode(i.data);
      if (d[0] === 2 && d.length >= 5) cu = d[1] | (d[2]<<8) | (d[3]<<16) | (d[4]<<24);
    }
    if (prog === MEMO_V1 || prog === MEMO_V2) {
      memo = new TextDecoder().decode(b58decode(i.data));
    }
  }
  const feePayer = keys[0];
  const pre = tx.meta.preBalances; const post = tx.meta.postBalances;
  const movements = keys.map((k,idx) => ({ k, delta: (post[idx]-pre[idx])/1e9 }));
  console.log(`SIG ${sig}`);
  console.log(`  feePayer=${feePayer}`);
  console.log(`  cu=${cu} ${cu===14548?'(MoonPay match)':''}`);
  console.log(`  memo=${memo} ${memo && memo.length===32 && /^[0-9a-f]+$/i.test(memo)?'(32-hex match)':''}`);
  console.log(`  balance deltas:`);
  for (const m of movements) if (Math.abs(m.delta) > 1e-9) console.log(`    ${m.k}  ${m.delta>0?'+':''}${m.delta} SOL`);
}
