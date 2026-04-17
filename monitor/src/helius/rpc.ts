const RPC_URL_BASE = "https://mainnet.helius-rpc.com/";

const MAX_ATTEMPTS = 5;
const INITIAL_DELAY_MS = 500;
const MAX_DELAY_MS = 30_000;

export class RpcError extends Error {
  readonly jsonRpcCode?: number;
  readonly httpStatus?: number;
  readonly attempts: number;

  constructor(message: string, opts: { jsonRpcCode?: number; httpStatus?: number; attempts: number }) {
    super(message);
    this.name = "RpcError";
    this.jsonRpcCode = opts.jsonRpcCode;
    this.httpStatus = opts.httpStatus;
    this.attempts = opts.attempts;
  }
}

export interface SignatureInfo {
  signature: string;
  slot: number;
  blockTime: number | null;
  err: unknown;
  memo: string | null;
  confirmationStatus: string | null;
}

export interface ParsedTransaction {
  slot: number;
  blockTime: number | null;
  transaction: unknown;
  meta: unknown;
  version?: unknown;
}

interface JsonRpcResponse<T> {
  jsonrpc: "2.0";
  id: number;
  result?: T;
  error?: { code: number; message: string };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function rpcCall<T>(
  apiKey: string,
  method: string,
  params: unknown[],
): Promise<T> {
  const url = `${RPC_URL_BASE}?api-key=${apiKey}`;
  const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });

  let delayMs = INITIAL_DELAY_MS;
  let lastErr: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_ATTEMPTS) {
        await sleep(delayMs);
        delayMs = Math.min(delayMs * 2, MAX_DELAY_MS);
        continue;
      }
      throw new RpcError(
        `RPC ${method} network error: ${err instanceof Error ? err.message : String(err)}`,
        { attempts: attempt },
      );
    }

    if (res.status === 429 || res.status >= 500) {
      lastErr = new RpcError(`RPC ${method} HTTP ${res.status}`, {
        httpStatus: res.status,
        attempts: attempt,
      });
      if (attempt >= MAX_ATTEMPTS) throw lastErr;
      const retryAfterHdr = res.headers.get("retry-after");
      const retryAfterSec = retryAfterHdr ? Number(retryAfterHdr) : Number.NaN;
      const waitMs =
        Number.isFinite(retryAfterSec) && retryAfterSec > 0
          ? Math.min(retryAfterSec * 1000, MAX_DELAY_MS)
          : delayMs;
      await sleep(waitMs);
      delayMs = Math.min(delayMs * 2, MAX_DELAY_MS);
      continue;
    }

    if (!res.ok) {
      throw new RpcError(`RPC ${method} HTTP ${res.status}`, {
        httpStatus: res.status,
        attempts: attempt,
      });
    }

    const parsed = (await res.json()) as JsonRpcResponse<T>;
    if (parsed.error) {
      throw new RpcError(`RPC ${method} error ${parsed.error.code}: ${parsed.error.message}`, {
        jsonRpcCode: parsed.error.code,
        attempts: attempt,
      });
    }
    if (parsed.result === undefined) {
      throw new RpcError(`RPC ${method} returned no result`, { attempts: attempt });
    }
    return parsed.result;
  }

  throw new RpcError(
    `RPC ${method} failed after ${MAX_ATTEMPTS} attempts: ${
      lastErr instanceof Error ? lastErr.message : String(lastErr)
    }`,
    { attempts: MAX_ATTEMPTS },
  );
}

export async function getSignaturesForAddress(
  apiKey: string,
  address: string,
  opts: { until?: string; before?: string; limit?: number } = {},
): Promise<SignatureInfo[]> {
  const cfg: Record<string, unknown> = { limit: opts.limit ?? 1000 };
  if (opts.until !== undefined) cfg.until = opts.until;
  if (opts.before !== undefined) cfg.before = opts.before;
  return rpcCall<SignatureInfo[]>(apiKey, "getSignaturesForAddress", [address, cfg]);
}

export async function getTransaction(
  apiKey: string,
  signature: string,
): Promise<ParsedTransaction | null> {
  return rpcCall<ParsedTransaction | null>(apiKey, "getTransaction", [
    signature,
    { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 },
  ]);
}
