import 'dotenv/config';
import { readFileSync } from 'fs';
import { join } from 'path';

// ---------------------------------------------------------------------------
// API keys from .env
// ---------------------------------------------------------------------------
const HELIUS_API_KEY = process.env.HELIUS_API_KEY!;
const NANSEN_API_KEY = process.env.NANSEN_API_KEY!;
const ARKHAM_API_KEY = process.env.ARKAN_API_KEY!; // Note: env var is ARKAN, not ARKHAM

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// 1. heliusRpc — Standard Solana JSON-RPC via Helius (50 req/sec, no delay)
// ---------------------------------------------------------------------------
export async function heliusRpc(method: string, params: unknown[] = []): Promise<unknown> {
  const url = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!res.ok) {
    throw new Error(`heliusRpc ${method} failed: ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as { result?: unknown; error?: { message: string; code: number } };
  if (json.error) {
    throw new Error(`heliusRpc ${method} error: ${json.error.code} ${json.error.message}`);
  }
  return json.result;
}

// ---------------------------------------------------------------------------
// 2. heliusWallet — Wallet API (GET/POST, 10 req/sec → 100ms delay)
//    Returns null on 404 (unknown wallet), throws on other errors.
// ---------------------------------------------------------------------------
export async function heliusWallet(
  endpoint: string,
  options?: { method?: string; body?: unknown },
): Promise<unknown> {
  await sleep(100);
  const method = options?.method ?? 'GET';
  const url = `https://api.helius.xyz/v1/wallet/${endpoint}?api-key=${HELIUS_API_KEY}`;
  const fetchOpts: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (options?.body) {
    fetchOpts.body = JSON.stringify(options.body);
  }
  const res = await fetch(url, fetchOpts);
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`heliusWallet ${endpoint} failed: ${res.status} ${text}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// 3. heliusBatchIdentity — Batch lookup up to 100 addresses (100ms delay)
// ---------------------------------------------------------------------------
export async function heliusBatchIdentity(
  addresses: string[],
): Promise<unknown> {
  await sleep(100);
  const url = `https://api.helius.xyz/v1/wallet/batch-identity?api-key=${HELIUS_API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ addresses: addresses.slice(0, 100) }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`heliusBatchIdentity failed: ${res.status} ${text}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// 4. nansen — POST to Nansen API (2s delay, retry on 429, return error on 422)
// ---------------------------------------------------------------------------
export async function nansen(
  endpoint: string,
  body: unknown,
): Promise<unknown> {
  await sleep(2000);
  const url = `https://api.nansen.ai/api/v1${endpoint}`;
  const doFetch = async (): Promise<Response> =>
    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apiKey: NANSEN_API_KEY,
      },
      body: JSON.stringify(body),
    });

  let res = await doFetch();

  // 422 — unprocessable (e.g. high-activity wallet counterparties)
  if (res.status === 422) {
    return { error: 'unprocessable', status: 422 };
  }

  // 429 — rate limited, retry once after 5s
  if (res.status === 429) {
    await sleep(5000);
    res = await doFetch();
    if (res.status === 422) return { error: 'unprocessable', status: 422 };
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`nansen ${endpoint} failed after retry: ${res.status} ${text}`);
    }
  } else if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`nansen ${endpoint} failed: ${res.status} ${text}`);
  }

  return res.json();
}

// ---------------------------------------------------------------------------
// 5. arkham — GET from Arkham API (1s delay for slow endpoints)
//    Internal request helper handles: 429/Retry-After + exponential-backoff w/
//    jitter (max 4 attempts), datapoints-header capture, POST body support.
// ---------------------------------------------------------------------------

export interface ArkhamMeta {
  datapoints: {
    usage: number | null;
    limit: number | null;
    remaining: number | null;
  };
  status: number;
}

function readDatapoints(res: Response): ArkhamMeta {
  const num = (v: string | null): number | null => (v === null ? null : Number(v));
  return {
    datapoints: {
      usage: num(res.headers.get('x-intel-datapoints-usage')),
      limit: num(res.headers.get('x-intel-datapoints-limit')),
      remaining: num(res.headers.get('x-intel-datapoints-remaining')),
    },
    status: res.status,
  };
}

async function arkhamRequest(
  method: 'GET' | 'POST',
  path: string,
  opts: { params?: Record<string, string>; body?: unknown; slowEndpoint?: boolean } = {},
): Promise<{ body: unknown; meta: ArkhamMeta }> {
  if (opts.slowEndpoint) await sleep(1000);

  const url = new URL(`https://api.arkm.com${path}`);
  if (opts.params) {
    for (const [k, v] of Object.entries(opts.params)) url.searchParams.set(k, v);
  }

  const maxAttempts = 4;
  let lastErr: Error | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const headers: Record<string, string> = { 'API-Key': ARKHAM_API_KEY };
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    const fetchOpts: RequestInit = { method, headers };
    if (opts.body !== undefined) fetchOpts.body = JSON.stringify(opts.body);

    const res = await fetch(url.toString(), fetchOpts);

    if (res.status === 429) {
      if (attempt === maxAttempts) {
        const text = await res.text().catch(() => '');
        throw new Error(`arkham ${path} rate-limited after ${maxAttempts} attempts: ${text}`);
      }
      const retryAfterHeader = res.headers.get('retry-after');
      const retryAfterSec = retryAfterHeader ? Number(retryAfterHeader) : NaN;
      const base = Number.isFinite(retryAfterSec) && retryAfterSec > 0
        ? retryAfterSec * 1000
        : Math.pow(2, attempt - 1) * 1000;
      const jitter = Math.random() * 500;
      await sleep(base + jitter);
      lastErr = new Error(`arkham ${path} 429 attempt ${attempt}`);
      continue;
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`arkham ${path} failed: ${res.status} ${text}`);
    }

    const body = await res.json();
    const meta = readDatapoints(res);
    return { body, meta };
  }
  throw lastErr ?? new Error(`arkham ${path} exhausted retries`);
}

export async function arkham(
  endpoint: string,
  params?: Record<string, string>,
  slowEndpoint = false,
): Promise<unknown> {
  const { body } = await arkhamRequest('GET', endpoint, { params, slowEndpoint });
  return body;
}

export async function arkhamMeta(
  endpoint: string,
  params?: Record<string, string>,
  slowEndpoint = false,
): Promise<{ body: unknown; meta: ArkhamMeta }> {
  return arkhamRequest('GET', endpoint, { params, slowEndpoint });
}

// ---------------------------------------------------------------------------
// 6. arkhamBatchIntel — Batch address intelligence (up to 1000 addresses)
//    POST /intelligence/address/batch/all (500 credits). Basic variant — no
//    clusters, tags, or entity predictions. Use arkhamEnrichedBatch for those.
// ---------------------------------------------------------------------------
export async function arkhamBatchIntel(addresses: string[]): Promise<unknown> {
  const { body } = await arkhamRequest('POST', '/intelligence/address/batch/all', {
    body: { addresses: addresses.slice(0, 1000) },
  });
  return body;
}

// ---------------------------------------------------------------------------
// 7. arkhamEnrichedBatch — Enriched batch (up to 1000 addresses, 1000 credits)
//    POST /intelligence/address_enriched/batch/all. Includes tags, clusters,
//    entity predictions. Returns meta so callers can observe datapoints burn.
// ---------------------------------------------------------------------------
export async function arkhamEnrichedBatch(
  addresses: string[],
): Promise<{ body: unknown; meta: ArkhamMeta }> {
  return arkhamRequest('POST', '/intelligence/address_enriched/batch/all', {
    body: { addresses: addresses.slice(0, 1000) },
  });
}

// ---------------------------------------------------------------------------
// 8. loadAddressesFromCrossRef — Filter recurring_wallets by tag
// ---------------------------------------------------------------------------
export function loadAddressesFromCrossRef(tag: string): string[] {
  const filePath = join(process.cwd(), 'data/results/cross-reference-report.json');
  const data = JSON.parse(readFileSync(filePath, 'utf8')) as {
    recurring_wallets: Array<{ address: string; tag: string }>;
  };
  return data.recurring_wallets
    .filter((w) => w.tag === tag)
    .map((w) => w.address);
}

// ---------------------------------------------------------------------------
// 9. loadAddressFromNetworkMap — Navigate to data[section][key].address
// ---------------------------------------------------------------------------
export function loadAddressFromNetworkMap(section: string, key: string): string {
  const filePath = join(process.cwd(), 'data/network-map.json');
  const data = JSON.parse(readFileSync(filePath, 'utf8')) as Record<string, Record<string, unknown>>;
  const entry = data[section]?.[key];
  if (entry === undefined || entry === null) {
    throw new Error(`network-map: section "${section}" key "${key}" not found`);
  }
  if (typeof entry === 'string') return entry;
  if (typeof entry === 'object' && 'address' in (entry as Record<string, unknown>)) {
    return (entry as Record<string, unknown>).address as string;
  }
  throw new Error(`network-map: section "${section}" key "${key}" has no address field`);
}
