import 'dotenv/config';
import fs from 'node:fs';

const HELIUS_API_KEY = process.env.HELIUS_API_KEY!;
const RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;
const PARSE_URL = `https://api.helius.xyz/v0/transactions/?api-key=${HELIUS_API_KEY}`;

const TARGET = process.argv[2];
if (!TARGET) { console.error('usage: tsx trace-wallet.ts <address>'); process.exit(2); }

async function rpc(method: string, params: unknown[]): Promise<any> {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const j = await res.json() as any;
  if (j.error) throw new Error(`${method}: ${JSON.stringify(j.error)}`);
  return j.result;
}

async function parseTxs(sigs: string[]): Promise<any[]> {
  if (!sigs.length) return [];
  const res = await fetch(PARSE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transactions: sigs }),
  });
  if (!res.ok) throw new Error(`parse: ${res.status}`);
  return await res.json() as any[];
}

const balance = await rpc('getBalance', [TARGET]);
const sigs = await rpc('getSignaturesForAddress', [TARGET, { limit: 100 }]) as any[];
const tokenAccts = await rpc('getTokenAccountsByOwner', [
  TARGET, { programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' }, { encoding: 'jsonParsed' }
]) as any;

const sigList = sigs.map((s: any) => s.signature).reverse(); // chronological
const parsed = await parseTxs(sigList);

const summary = {
  address: TARGET,
  current_balance_sol: balance.value / 1e9,
  sig_count: sigs.length,
  earliest_ts: sigs.length ? sigs[sigs.length-1].blockTime : null,
  latest_ts: sigs.length ? sigs[0].blockTime : null,
  tokens: (tokenAccts.value ?? []).map((a: any) => ({
    mint: a.account.data.parsed.info.mint,
    amount: a.account.data.parsed.info.tokenAmount.uiAmountString,
  })),
  events: parsed.map((p: any) => ({
    sig: p.signature,
    ts: p.timestamp,
    type: p.type,
    source: p.source,
    fee_payer: p.feePayer,
    desc: p.description,
    fee: p.fee,
    inflows: (p.nativeTransfers ?? []).filter((n: any) => n.toUserAccount === TARGET),
    outflows: (p.nativeTransfers ?? []).filter((n: any) => n.fromUserAccount === TARGET),
    token_inflows: (p.tokenTransfers ?? []).filter((n: any) => n.toUserAccount === TARGET),
    token_outflows: (p.tokenTransfers ?? []).filter((n: any) => n.fromUserAccount === TARGET),
  })),
};

fs.writeFileSync(`/tmp/trace_${TARGET}.json`, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
