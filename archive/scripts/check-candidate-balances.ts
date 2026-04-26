import 'dotenv/config';
import fs from 'node:fs';

const HELIUS_API_KEY = process.env.HELIUS_API_KEY!;
const RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;

type Candidate = {
  address: string;
  funded_amount_sol: number;
  funding_source_label: string | null;
  funding_source: string;
  status: string;
  detected_at: number;
  confidence: string;
  prior_sig_count: number | null;
};

const inputPath = process.argv[2];
if (!inputPath) {
  console.error('usage: tsx check-candidate-balances.ts <candidates.json>');
  process.exit(2);
}

const candidates = JSON.parse(fs.readFileSync(inputPath, 'utf8')) as Candidate[];

async function getBalanceLamports(address: string): Promise<number | null> {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getBalance',
      params: [address],
    }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { result?: { value: number }; error?: unknown };
  if (json.error || !json.result) return null;
  return json.result.value;
}

async function runBatch<T, R>(items: T[], worker: (item: T) => Promise<R>, concurrency = 25): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (true) {
        const idx = i++;
        if (idx >= items.length) return;
        out[idx] = await worker(items[idx]);
      }
    }),
  );
  return out;
}

const start = Date.now();
const balances = await runBatch(candidates, async (c) => {
  const lamports = await getBalanceLamports(c.address);
  return { address: c.address, lamports };
});
const elapsed = Date.now() - start;

const enriched = candidates.map((c, i) => {
  const lamports = balances[i].lamports;
  const balance_sol = lamports == null ? null : lamports / 1e9;
  const delta = balance_sol == null ? null : balance_sol - c.funded_amount_sol;
  const ratio = balance_sol == null ? null : balance_sol / c.funded_amount_sol;
  return { ...c, current_balance_sol: balance_sol, delta_sol: delta, ratio };
});

const stillHolding = enriched.filter(
  (c) => c.current_balance_sol != null && c.ratio != null && c.ratio >= 0.99,
);

stillHolding.sort((a, b) => {
  const order: Record<string, number> = { detected: 0, whitelisted: 1, rejected: 2 };
  const so = (order[a.status] ?? 3) - (order[b.status] ?? 3);
  if (so !== 0) return so;
  return b.detected_at - a.detected_at;
});

console.error(`Checked ${candidates.length} candidates in ${elapsed}ms`);
console.error(`Still holding >=99% of funded amount: ${stillHolding.length}`);

fs.writeFileSync('/tmp/candidates_with_balances.json', JSON.stringify(enriched, null, 2));
fs.writeFileSync('/tmp/candidates_still_holding.json', JSON.stringify(stillHolding, null, 2));

console.log(JSON.stringify(stillHolding, null, 2));
