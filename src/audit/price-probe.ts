// Probe several free price sources for SOL at 2026-03-15T04:51:33Z (epoch 1773550293).

const TARGET_TS = 1773550293;
const TARGET_ISO = new Date(TARGET_TS * 1000).toISOString();

async function cgRange() {
  const from = TARGET_TS - 3600;
  const to = TARGET_TS + 3600;
  const url = `https://api.coingecko.com/api/v3/coins/solana/market_chart/range?vs_currency=usd&from=${from}&to=${to}`;
  const r = await fetch(url);
  const body = await r.text();
  console.log(`[cg range] status=${r.status} bodyLen=${body.length}`);
  console.log('  body head:', body.slice(0, 300));
  try {
    const j = JSON.parse(body) as { prices?: Array<[number, number]>; status?: unknown };
    if (j.prices && j.prices.length) {
      const best = j.prices.reduce((a, b) =>
        Math.abs(a[0] / 1000 - TARGET_TS) <= Math.abs(b[0] / 1000 - TARGET_TS) ? a : b,
      );
      console.log('  closest pt:', new Date(best[0]).toISOString(), 'price=', best[1]);
    }
  } catch {}
}

async function cgHistory() {
  const d = new Date(TARGET_TS * 1000);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  const url = `https://api.coingecko.com/api/v3/coins/solana/history?date=${dd}-${mm}-${yyyy}&localization=false`;
  const r = await fetch(url);
  const body = await r.text();
  console.log(`[cg history] status=${r.status}`);
  try {
    const j = JSON.parse(body);
    const price = j?.market_data?.current_price?.usd;
    console.log('  daily-snapshot SOL/USD on', dd + '-' + mm + '-' + yyyy, ':', price);
  } catch {
    console.log('  non-json:', body.slice(0, 200));
  }
}

async function birdeyeOhlcv() {
  // No API key — just see if public endpoint responds
  const mint = 'So11111111111111111111111111111111111111112';
  const url = `https://public-api.birdeye.so/defi/ohlcv?address=${mint}&type=1H&time_from=${TARGET_TS - 3600}&time_to=${TARGET_TS + 3600}`;
  const r = await fetch(url, { headers: { 'x-chain': 'solana' } });
  const body = await r.text();
  console.log(`[birdeye ohlcv] status=${r.status}`);
  console.log('  body head:', body.slice(0, 300));
}

async function main() {
  console.log('target:', TARGET_ISO, 'ts=', TARGET_TS);
  await cgHistory();
  await cgRange();
  await birdeyeOhlcv();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
