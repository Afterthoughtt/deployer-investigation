// Apply the MoonPay fingerprint (CU Limit=14548 + 32-hex memo + sender pays) to the 5 live
// candidates in l11.db. These are third-party, real-world traffic — if they match, we have
// strong validation of the fingerprint across MP1+MP2 and across $20→$2800 amount scale.

import 'dotenv/config';
import Database from 'better-sqlite3';
import { join } from 'path';
import { heliusRpc } from './utils';

const MP1 = 'Cc3bpPzUvgAzdW9Nv7dUQ8cpap8Xa7ujJgLdpqGrTCu6';
const MP2 = '5F1seMKUqSNhv45f6FhB2cFmgJbk8U1avJw7M6TexUq1';
const MP_LABEL: Record<string, string> = { [MP1]: 'MP1', [MP2]: 'MP2' };

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

type Fingerprint = {
  cuLimit: number | null;
  cuPrice: bigint | null;
  memo: string | null;
  memoIsHex32: boolean;
  feePayer: string | null;
  transferSource: string | null;
  transferDestination: string | null;
  transferLamports: number | null;
};

function extract(tx: Tx): Fingerprint {
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

  const transferIx = ixs.find((i) => {
    if (i.program !== 'system') return false;
    const p = i.parsed as { type?: string } | undefined;
    return p?.type === 'transfer';
  });
  const t = transferIx
    ? (transferIx.parsed as { info: { source: string; destination: string; lamports: number } }).info
    : null;

  const feePayer = tx.transaction.message.accountKeys.find((a) => a.signer)?.pubkey ?? null;

  return {
    cuLimit,
    cuPrice,
    memo,
    memoIsHex32,
    feePayer,
    transferSource: t?.source ?? null,
    transferDestination: t?.destination ?? null,
    transferLamports: t?.lamports ?? null,
  };
}

async function main() {
  const db = new Database(join(process.cwd(), 'monitor/data/l11.db'), { readonly: true });
  const rows = db
    .prepare(
      `SELECT id, address, funded_amount_sol, funding_source, funding_signature, confidence
       FROM candidates ORDER BY id`,
    )
    .all() as Array<{
    id: number;
    address: string;
    funded_amount_sol: number;
    funding_source: string;
    funding_signature: string;
    confidence: string;
  }>;
  db.close();

  console.log(`═══ Fingerprint check on ${rows.length} live candidates ═══\n`);

  const fingerprints: Array<{ row: typeof rows[number]; fp: Fingerprint }> = [];

  for (const r of rows) {
    const mp = MP_LABEL[r.funding_source] ?? '?';
    console.log(`── C${r.id} (${mp}, ${r.confidence}, ${r.funded_amount_sol} SOL) ──`);
    console.log(`   recipient: ${r.address}`);
    console.log(`   sig:       ${r.funding_signature}`);

    const tx = (await heliusRpc('getTransaction', [
      r.funding_signature,
      { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 },
    ])) as Tx | null;

    if (!tx) {
      console.log('   ✗ tx not found\n');
      continue;
    }

    const fp = extract(tx);
    fingerprints.push({ row: r, fp });

    const senderMatchesMP = r.funding_source === fp.transferSource;
    const feePaidBySender = fp.feePayer === fp.transferSource;
    const cuMatch = fp.cuLimit === 14548;
    const memoMatch = fp.memoIsHex32;

    console.log(`   sender:     ${fp.transferSource}  ${senderMatchesMP ? '✓' : '✗'} matches ${mp}`);
    console.log(`   fee payer:  ${fp.feePayer}  ${feePaidBySender ? '✓' : '✗'} is sender`);
    console.log(`   CU Limit:   ${fp.cuLimit}  ${cuMatch ? '✓ matches 14548' : '✗ mismatch'}`);
    console.log(`   CU Price:   ${fp.cuPrice?.toString()} µlam/CU`);
    console.log(`   memo:       ${fp.memo}  ${memoMatch ? '✓ 32-hex' : '✗ not 32-hex'}`);
    console.log(
      `   VERDICT:    ${cuMatch && memoMatch && senderMatchesMP && feePaidBySender ? 'FULL MATCH ✓' : 'BREAKS FINGERPRINT ✗'}\n`,
    );
  }

  // Aggregate
  console.log('═══ Summary ═══\n');
  const allRows = [
    { label: 'L10 deployer ($1186)', sender: MP1, cuLimit: 14548, memoHex32: true, amount: 13.443 },
    { label: 'Your control #1 ($25)', sender: MP1, cuLimit: 14548, memoHex32: true, amount: 0.231 },
    { label: 'Your control #2 ($25)', sender: MP1, cuLimit: 14548, memoHex32: true, amount: 0.234 },
    { label: 'Friend 53UG ($25)', sender: MP1, cuLimit: 14548, memoHex32: true, amount: 0.239 },
    { label: 'Friend HLLs ($25)', sender: MP1, cuLimit: 14548, memoHex32: true, amount: 0.240 },
    ...fingerprints.map(({ row, fp }) => ({
      label: `C${row.id} (${MP_LABEL[row.funding_source] ?? '?'}, ${row.confidence}, ${row.funded_amount_sol} SOL)`,
      sender: fp.transferSource ?? '?',
      cuLimit: fp.cuLimit ?? 0,
      memoHex32: fp.memoIsHex32,
      amount: row.funded_amount_sol,
    })),
  ];

  console.log('label'.padEnd(36), 'sender'.padEnd(12), 'CU-Limit', 'memo-32-hex');
  for (const r of allRows) {
    const mpLabel = MP_LABEL[r.sender] ?? r.sender.slice(0, 6);
    console.log(r.label.padEnd(36), mpLabel.padEnd(12), String(r.cuLimit).padEnd(8), r.memoHex32);
  }
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
