import 'dotenv/config';
import fs from 'node:fs';

const HELIUS_API_KEY = process.env.HELIUS_API_KEY!;
const RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;
const PARSE_URL = `https://api.helius.xyz/v0/transactions/?api-key=${HELIUS_API_KEY}`;

const PRIOR_LAUNCH_CAS = new Set([
  '2rQcoMECcsU3UBNfpsUxegnHc9js7usb2XagwUK3pump',
  '8mETm8mxyn7gP1igZLv4DryquuYLjcekkrQBVpZpFHvC',
  'FnzYzrkRL1JLHmxS8QctidKDGJgJRa6BN4QH3hkVpump',
  '5K7ufVK7cGwU8vd66bFAzHgijVK8RoWZBxtMmvW1pump',
  'CDjuuYYY9dGA85iojEhpRwjYhGRv6VAPyoKan5ytpump',
  '3VQU1DgaLE6E49HhqvH73Azsin8gAZRc14cvyV4hpump',
  'AvMdYR4dVLatpMa3YecWhDrerXp5Wx7sNLNTyiA3pump',
  '5f2KbZjnJEnPpW5JqY53mv2cDH7MLixUUgxCFnLBpump',
  'GytQthjDhj3pE9seoZ6ir35VBBH86U22ntkGJndQpump',
  'KfByHk48ecitUq8gXji2vr9smmRJKtqJwGAh2E9pump',
]);

const MP1 = 'Cc3bpPzUvgAzdW9Nv7dUQ8cpap8Xa7ujJgLdpqGrTCu6';
const MP2 = '5F1seMKUqSNhv45f6FhB2cFmgJbk8U1avJw7M6TexUq1';

const TARGETS = [
  { addr: 'FtnvximrdUXhJpFxGM7Ji6Fh2bYm2cfr8s6R5W24E8fN', tier: 1, src: 'MP1', funded: 10.577 },
  { addr: '6iuvAFTxpWSWRuMheGVVfZ7gEHcv1ssCzFSDsZALhiiY', tier: 1, src: 'MP2', funded: 12.548 },
  { addr: '2zYi14tpQPjj2FsDFfnN4Y9B9qcTpHktEnQ8phnGNpCj', tier: 1, src: 'MP2', funded: 9.941 },
  { addr: '6rHWN6qQksCMGxkZCCkSG64fEi8vBknTxt1keGH9izLv', tier: 1, src: 'MP1', funded: 10.666 },
  { addr: '4aMinwtC8QFrTwQFPhPq7txie7WXGaQfpLVm52rzwkgb', tier: 1, src: 'MP1', funded: 11.580 },
  { addr: 'AmVkM1Z63rsoU3tCHPEZjst1viHPuAu4mTGzKCyX9KL2', tier: 2, src: 'MP2', funded: 11.171 },
  { addr: '6uYzo6ZRYehusYyaaM8XbZE11da98hyaryBtDKVyB8Bb', tier: 2, src: 'MP1', funded: 8.004 },
  { addr: 'BpnWT4Vp9ycqQP1rWZJhq9fTFCnRodEjs9UAdRnKVAg2', tier: 2, src: 'MP1', funded: 11.508 },
];

async function rpc(method: string, params: unknown[]): Promise<any> {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const json = await res.json() as any;
  if (json.error) throw new Error(`${method}: ${JSON.stringify(json.error)}`);
  return json.result;
}

async function parseTxs(sigs: string[]): Promise<any[]> {
  if (sigs.length === 0) return [];
  const res = await fetch(PARSE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transactions: sigs }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`parse: ${res.status} ${txt.slice(0,200)}`);
  }
  return (await res.json()) as any[];
}

async function deepdive(t: typeof TARGETS[0]) {
  // 1. Signatures (all of them since these wallets are fresh)
  const sigs = await rpc('getSignaturesForAddress', [t.addr, { limit: 100 }]) as any[];
  // 2. Token accounts (SPL)
  const tokenAccts = await rpc('getTokenAccountsByOwner', [
    t.addr, { programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' }, { encoding: 'jsonParsed' }
  ]) as any;
  const tokens = (tokenAccts.value ?? []).map((a: any) => ({
    mint: a.account.data.parsed.info.mint,
    amount: a.account.data.parsed.info.tokenAmount.uiAmountString,
  }));
  // 3. Token-2022 accounts too
  const t22 = await rpc('getTokenAccountsByOwner', [
    t.addr, { programId: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb' }, { encoding: 'jsonParsed' }
  ]) as any;
  for (const a of (t22.value ?? [])) {
    tokens.push({
      mint: a.account.data.parsed.info.mint,
      amount: a.account.data.parsed.info.tokenAmount.uiAmountString,
      program: 'token-2022',
    });
  }
  // 4. Parse all sigs for what they did
  const sigList = sigs.map((s: any) => s.signature);
  const parsed = await parseTxs(sigList);
  // 5. Check for prior-launch CAs in any token holdings or in any tx
  const priorLaunchHits: string[] = [];
  for (const tk of tokens) {
    if (PRIOR_LAUNCH_CAS.has(tk.mint)) priorLaunchHits.push(tk.mint);
  }
  for (const p of parsed) {
    for (const tt of (p.tokenTransfers ?? [])) {
      if (PRIOR_LAUNCH_CAS.has(tt.mint)) priorLaunchHits.push(tt.mint);
    }
  }
  // 6. Identify funding tx and check MoonPay fingerprint
  let fundingTx: any = null;
  let fundingSrc: string | null = null;
  let fingerprintCu: number | null = null;
  let memoData: string | null = null;
  let feePayerIsSender = false;
  // Heuristic: oldest sig is the funding tx (wallet was empty before)
  const oldest = parsed.sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0))[0];
  if (oldest) {
    fundingTx = oldest.signature;
    // Find native SOL transfer into this wallet
    const inflow = (oldest.nativeTransfers ?? []).find((n: any) => n.toUserAccount === t.addr && n.amount > 0);
    if (inflow) {
      fundingSrc = inflow.fromUserAccount;
    }
    // ComputeBudget compute-unit-limit instruction
    for (const ins of (oldest.instructions ?? [])) {
      if (ins.programId === 'ComputeBudget111111111111111111111111111111') {
        // Manually parse: data starts with 0x02 = SetComputeUnitLimit, then u32 LE units
        // Helius parsed format may include the parsed fields. Fall back to raw data.
        if (ins.parsed?.info?.computeUnitLimit !== undefined) {
          fingerprintCu = ins.parsed.info.computeUnitLimit;
        } else if (typeof ins.data === 'string' && ins.data.length > 0) {
          // base58 — leave raw
        }
      }
      if (ins.programId === 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr' || ins.programId === 'Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo') {
        memoData = ins.parsed ?? null;
      }
    }
    if (oldest.feePayer && fundingSrc && oldest.feePayer === fundingSrc) feePayerIsSender = true;
  }
  // 7. Look for outbound nativeTransfers from this wallet (post-funding activity)
  const outbound = parsed
    .filter((p: any) => p.signature !== fundingTx)
    .map((p: any) => ({
      sig: p.signature,
      type: p.type,
      source: p.source,
      desc: p.description,
      out: (p.nativeTransfers ?? []).filter((n: any) => n.fromUserAccount === t.addr),
      tokensOut: (p.tokenTransfers ?? []).filter((n: any) => n.fromUserAccount === t.addr),
    }))
    .filter((p: any) => p.out.length > 0 || p.tokensOut.length > 0 || (p.type && p.type !== 'TRANSFER'));
  return {
    addr: t.addr,
    tier: t.tier,
    expectedSrc: t.src,
    funded: t.funded,
    sigCount: sigs.length,
    fundingTx,
    fundingSrc,
    fundingSrcMatchesMoonPay: fundingSrc === MP1 ? 'MP1' : fundingSrc === MP2 ? 'MP2' : 'OTHER',
    fingerprintCu,
    memoData,
    feePayerIsSender,
    tokensHeld: tokens,
    priorLaunchHits,
    outboundActivity: outbound,
    rawParsed: parsed.map((p: any) => ({
      sig: p.signature, type: p.type, source: p.source, desc: p.description,
      cu: p.computeUnitsConsumed, fee: p.fee, ts: p.timestamp,
    })),
  };
}

const results = [];
for (const t of TARGETS) {
  console.error(`Checking ${t.addr}...`);
  try {
    results.push(await deepdive(t));
  } catch (e: any) {
    results.push({ addr: t.addr, error: e.message });
  }
}
fs.writeFileSync('/tmp/deepdive_results.json', JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
