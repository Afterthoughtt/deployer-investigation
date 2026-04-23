// One-off: check current Arkham datapoints budget + period start date.
// Endpoint: GET /subscription/intel-usage — non-intel, no datapoint cost.
import 'dotenv/config';
import { arkhamMeta } from './utils.js';

async function main() {
  const { body, meta } = await arkhamMeta('/subscription/intel-usage');
  console.log('meta:', JSON.stringify(meta, null, 2));
  console.log('body:');
  console.log(JSON.stringify(body, null, 2));
}

main().catch((err) => {
  console.error('ERROR:', err instanceof Error ? err.message : err);
  process.exit(1);
});
