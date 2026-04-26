import 'dotenv/config';

const key = process.env.ARKAN_API_KEY;
if (!key) {
  console.error('Missing ARKAN_API_KEY');
  process.exit(1);
}

const res = await fetch('https://api.arkm.com/subscription/intel-usage', {
  headers: { 'API-Key': key },
});
console.log('HTTP', res.status, res.statusText);
const text = await res.text();
console.log(text);
