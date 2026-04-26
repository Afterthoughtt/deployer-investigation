import 'dotenv/config';
import fs from 'node:fs';

const KEY = process.env.HELIUS_API_KEY!;
const RPC = `https://mainnet.helius-rpc.com/?api-key=${KEY}`;
const PARSE = `https://api.helius.xyz/v0/transactions/?api-key=${KEY}`;

const MP1 = 'Cc3bpPzUvgAzdW9Nv7dUQ8cpap8Xa7ujJgLdpqGrTCu6';
const MP2 = '5F1seMKUqSNhv45f6FhB2cFmgJbk8U1avJw7M6TexUq1';
const COINSPOT = 'CSEncqtqbmNRjve42sNnbs5cCSmrjUNsAEwc17XY2RCs';
const ONRAMPS = new Set([MP1, MP2, COINSPOT]);

async function rpc(method: string, params: unknown[]): Promise<any> {
  const r = await fetch(RPC, { method: 'POST', headers: { 'Content-Type':'application/json' },
    body: JSON.stringify({ jsonrpc:'2.0', id:1, method, params }) });
  const j = await r.json() as any;
  if (j.error) throw new Error(`${method}: ${JSON.stringify(j.error)}`);
  return j.result;
}

async function parseTxs(sigs: string[]): Promise<any[]> {
  if (!sigs.length) return [];
  const r = await fetch(PARSE, { method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ transactions: sigs }) });
  if (!r.ok) throw new Error(`parse: ${r.status}`);
  return await r.json() as any[];
}

const relays = JSON.parse(fs.readFileSync('/tmp/relays.json','utf8')) as any[];
// Add CrCugm explicitly (the canonical relay we already analyzed)
if (!relays.find((r:any) => r.address === 'CrCugmcJ5akRoAkCfDvj13qoveBx9yT94mQZt634Jbvc')) {
  relays.unshift({ address: 'CrCugmcJ5akRoAkCfDvj13qoveBx9yT94mQZt634Jbvc', funded: 10.496, src_label: 'MoonPay Hot Wallet 1', status: 'detected', prior_sig: 1 });
}

const out: any[] = [];
for (const r of relays) {
  try {
    const bal = (await rpc('getBalance', [r.address])).value / 1e9;
    const sigs = await rpc('getSignaturesForAddress', [r.address, { limit: 50 }]) as any[];
    const sigList = sigs.map((s:any)=>s.signature);
    const parsed = await parseTxs(sigList.slice(0, 30));
    // All inflows from any onramp to this wallet
    const onrampInflows: { from:string, sol:number, sig:string, ts:number }[] = [];
    // All outflows from this wallet (the forward candidates)
    const outflows: { to:string, sol:number, sig:string, ts:number }[] = [];
    for (const p of parsed) {
      for (const n of (p.nativeTransfers ?? [])) {
        if (n.toUserAccount === r.address && n.amount > 0 && ONRAMPS.has(n.fromUserAccount)) {
          onrampInflows.push({ from: n.fromUserAccount, sol: n.amount/1e9, sig: p.signature, ts: p.timestamp });
        }
        if (n.fromUserAccount === r.address && n.amount > 0) {
          outflows.push({ to: n.toUserAccount, sol: n.amount/1e9, sig: p.signature, ts: p.timestamp });
        }
      }
    }
    // Identify the largest single-recipient outflow (the "combine + forward")
    let largestForward: { to:string, sol:number, sig:string, ts:number } | null = null;
    for (const o of outflows) {
      if (!largestForward || o.sol > largestForward.sol) largestForward = o;
    }
    // Determine if this looks like a forward: (a) drained or near-drained balance, (b) >= 8 SOL forwarded
    const totalOnrampIn = onrampInflows.reduce((s,o)=>s+o.sol,0);
    const isPotentialRelay = onrampInflows.length >= 2 && largestForward && largestForward.sol >= 8;
    const drained = bal < 0.01;
    out.push({
      relay: r.address,
      balance: bal,
      sig_count: sigs.length,
      onrampInflows,
      totalOnrampIn,
      outflows: outflows.slice(0, 10),
      largestForward,
      isPotentialRelay,
      drained,
      detected_funded: r.funded,
    });
    process.stderr.write('.');
  } catch (e:any) {
    out.push({ relay: r.address, error: e.message });
  }
}
process.stderr.write('\n');
fs.writeFileSync('/tmp/relay_hunt.json', JSON.stringify(out, null, 2));

// Now for each potential-relay where we identified a largestForward, check current state of the destination
const downstream: any[] = [];
for (const r of out) {
  if (!r.isPotentialRelay) continue;
  const dest = r.largestForward!.to;
  try {
    const bal = (await rpc('getBalance', [dest])).value / 1e9;
    const sigs = await rpc('getSignaturesForAddress', [dest, { limit: 20 }]) as any[];
    downstream.push({
      relay: r.relay,
      forwarded: r.largestForward!.sol,
      destination: dest,
      dest_balance: bal,
      dest_sig_count: sigs.length,
      dest_latest_ts: sigs.length ? sigs[0].blockTime : null,
      dest_drained_or_active: bal < 0.5 || sigs.length > 5,
      onramp_inflows: r.onrampInflows.length,
      total_onramp_in: r.totalOnrampIn,
    });
  } catch (e:any) {
    downstream.push({ relay: r.relay, dest, error: e.message });
  }
}
fs.writeFileSync('/tmp/relay_downstream.json', JSON.stringify(downstream, null, 2));

console.log('=== Relay summary ===');
for (const r of out) {
  if (r.error) { console.log(`${r.relay} ERR ${r.error}`); continue; }
  const flag = r.isPotentialRelay ? 'RELAY⚠' : '·';
  console.log(`${flag} ${r.relay}  bal=${r.balance.toFixed(3)}  sigs=${r.sig_count}  in[onramp]=${r.onrampInflows.length} (sum=${r.totalOnrampIn.toFixed(3)})  fwdMax=${r.largestForward?.sol?.toFixed(3) ?? '-'} → ${r.largestForward?.to ?? '-'}`);
}

console.log('\n=== Downstream of confirmed-relay wallets ===');
for (const d of downstream) {
  if (d.error) { console.log(`${d.relay} → ${d.dest} ERR ${d.error}`); continue; }
  const status = d.dest_balance >= 1 && d.dest_sig_count <= 5 ? 'PARKED ⚠' : 'active/drained';
  console.log(`${d.relay} → ${d.destination}  ${d.forwarded.toFixed(3)} SOL  bal=${d.dest_balance.toFixed(3)}  sigs=${d.dest_sig_count}  ${status}`);
}
