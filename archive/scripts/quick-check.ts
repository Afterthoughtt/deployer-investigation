import 'dotenv/config';

const KEY = process.env.HELIUS_API_KEY!;
const URL = `https://mainnet.helius-rpc.com/?api-key=${KEY}`;

const WATCH = [
  '2mMQX8nPnvoppJeRMtJjnmXA4Z8CgJF7mKBkg5HErwon',
  'FtnvximrdUXhJpFxGM7Ji6Fh2bYm2cfr8s6R5W24E8fN',
  '6iuvAFTxpWSWRuMheGVVfZ7gEHcv1ssCzFSDsZALhiiY',
  '2zYi14tpQPjj2FsDFfnN4Y9B9qcTpHktEnQ8phnGNpCj',
  '6rHWN6qQksCMGxkZCCkSG64fEi8vBknTxt1keGH9izLv',
  '4aMinwtC8QFrTwQFPhPq7txie7WXGaQfpLVm52rzwkgb',
];

const EXPECTED: Record<string, number> = {
  '2mMQX8nPnvoppJeRMtJjnmXA4Z8CgJF7mKBkg5HErwon': 15.721103654,
  'FtnvximrdUXhJpFxGM7Ji6Fh2bYm2cfr8s6R5W24E8fN': 10.577,
  '6iuvAFTxpWSWRuMheGVVfZ7gEHcv1ssCzFSDsZALhiiY': 12.548,
  '2zYi14tpQPjj2FsDFfnN4Y9B9qcTpHktEnQ8phnGNpCj': 9.941,
  '6rHWN6qQksCMGxkZCCkSG64fEi8vBknTxt1keGH9izLv': 10.666,
  '4aMinwtC8QFrTwQFPhPq7txie7WXGaQfpLVm52rzwkgb': 11.580,
};

const FUND_TS: Record<string, number> = {
  '2mMQX8nPnvoppJeRMtJjnmXA4Z8CgJF7mKBkg5HErwon': 1777143582,
  'FtnvximrdUXhJpFxGM7Ji6Fh2bYm2cfr8s6R5W24E8fN': 1777091456,
  '6iuvAFTxpWSWRuMheGVVfZ7gEHcv1ssCzFSDsZALhiiY': 1777049915,
  '2zYi14tpQPjj2FsDFfnN4Y9B9qcTpHktEnQ8phnGNpCj': 1776928287,
  '6rHWN6qQksCMGxkZCCkSG64fEi8vBknTxt1keGH9izLv': 1776812871,
  '4aMinwtC8QFrTwQFPhPq7txie7WXGaQfpLVm52rzwkgb': 1776807005,
};

// Batch: getBalance + getSignaturesForAddress in one round-trip per addr (interleaved)
const calls: any[] = [];
for (let i = 0; i < WATCH.length; i++) {
  calls.push({ jsonrpc: '2.0', id: `bal_${i}`, method: 'getBalance', params: [WATCH[i]] });
  calls.push({ jsonrpc: '2.0', id: `sig_${i}`, method: 'getSignaturesForAddress', params: [WATCH[i], { limit: 20 }] });
}
async function rpc(method: string, params: unknown[]): Promise<any> {
  const r = await fetch(URL, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  return ((await r.json()) as any).result;
}

const now = Math.floor(Date.now() / 1000);
const out: any[] = [];
for (const addr of WATCH) {
  const bal = ((await rpc('getBalance', [addr])).value) / 1e9;
  const sigs = await rpc('getSignaturesForAddress', [addr, { limit: 20 }]) as any[];
  const sigCount = sigs.length;
  const latestTs = sigs.length ? sigs[0].blockTime : null;
  const fundTs = FUND_TS[addr];
  const expected = EXPECTED[addr];
  const ageH = (now - fundTs) / 3600;
  const sinceLastTxMin = latestTs ? (now - latestTs) / 60 : null;
  const moved = Math.abs(bal - expected) > 0.001;
  out.push({ addr, bal, expected, moved, sigCount, ageH, sinceLastTxMin });
}
console.log(JSON.stringify(out, null, 2));
console.error(`now: ${new Date(now * 1000).toISOString()}`);
