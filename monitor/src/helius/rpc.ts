import { errMessage, sleep } from "../util.js";

const RPC_URL_BASE = "https://mainnet.helius-rpc.com/";

const MAX_ATTEMPTS = 5;
const INITIAL_DELAY_MS = 500;
const MAX_DELAY_MS = 30_000;

export class RpcError extends Error {
  readonly jsonRpcCode?: number;
  readonly httpStatus?: number;
  readonly attempts: number;

  constructor(
    message: string,
    opts: { jsonRpcCode?: number; httpStatus?: number; attempts: number },
  ) {
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

export async function rpcCall<T>(
  apiKey: string,
  method: string,
  params: unknown[],
  signal?: AbortSignal,
): Promise<T> {
  const url = `${RPC_URL_BASE}?api-key=${apiKey}`;
  const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });

  let delayMs = INITIAL_DELAY_MS;

  for (let attempt = 1; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal,
      });
    } catch (err) {
      if (attempt >= MAX_ATTEMPTS || signal?.aborted) {
        throw new RpcError(
          `RPC ${method} network error: ${errMessage(err)}`,
          { attempts: attempt },
        );
      }
      await sleep(delayMs, signal);
      delayMs = Math.min(delayMs * 2, MAX_DELAY_MS);
      continue;
    }

    if (res.status === 429 || res.status >= 500) {
      if (attempt >= MAX_ATTEMPTS) {
        throw new RpcError(`RPC ${method} HTTP ${res.status} after ${attempt} attempts`, {
          httpStatus: res.status,
          attempts: attempt,
        });
      }
      const retryAfterSec = Number(res.headers.get("retry-after"));
      const waitMs =
        Number.isFinite(retryAfterSec) && retryAfterSec > 0
          ? Math.min(retryAfterSec * 1000, MAX_DELAY_MS)
          : delayMs;
      await sleep(waitMs, signal);
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
      throw new RpcError(
        `RPC ${method} error ${parsed.error.code}: ${parsed.error.message}`,
        { jsonRpcCode: parsed.error.code, attempts: attempt },
      );
    }
    if (parsed.result === undefined) {
      throw new RpcError(`RPC ${method} returned no result`, { attempts: attempt });
    }
    return parsed.result;
  }
}

export async function getSignaturesForAddress(
  apiKey: string,
  address: string,
  opts: {
    until?: string;
    before?: string;
    limit?: number;
    signal?: AbortSignal;
  } = {},
): Promise<SignatureInfo[]> {
  const cfg: Record<string, unknown> = { limit: opts.limit ?? 1000 };
  if (opts.until !== undefined) cfg.until = opts.until;
  if (opts.before !== undefined) cfg.before = opts.before;
  return rpcCall<SignatureInfo[]>(
    apiKey,
    "getSignaturesForAddress",
    [address, cfg],
    opts.signal,
  );
}

export async function getTransaction(
  apiKey: string,
  signature: string,
  signal?: AbortSignal,
): Promise<ParsedTransaction | null> {
  return rpcCall<ParsedTransaction | null>(
    apiKey,
    "getTransaction",
    [signature, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }],
    signal,
  );
}
