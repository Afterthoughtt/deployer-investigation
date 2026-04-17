import WebSocket from "ws";

const ENHANCED_WS_URL = "wss://atlas-mainnet.helius-rpc.com";
const INITIAL_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 60_000;

export interface TransactionEvent {
  signature: string;
  slot: number;
  raw: unknown;
}

export interface HeliusWsOptions {
  apiKey: string;
  accounts: string[];
  onEvent: (event: TransactionEvent) => void;
  onOpen?: () => void;
  onSubscribed?: (subscriptionId: number) => void;
  onClose?: (code: number, reason: string) => void;
  onError?: (err: Error) => void;
  onReconnecting?: (attempt: number, delayMs: number) => void;
}

export interface HeliusWsHandle {
  close: () => void;
  /** Forcibly terminate the current socket; reconnect will kick in. Test-only. */
  forceDisconnect: () => void;
}

export function connectHeliusWs(opts: HeliusWsOptions): HeliusWsHandle {
  const url = `${ENHANCED_WS_URL}/?api-key=${opts.apiKey}`;
  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;
  let consecutiveFailures = 0;

  const scheduleReconnect = () => {
    if (closed) return;
    const delayMs = Math.min(
      INITIAL_BACKOFF_MS * 2 ** consecutiveFailures,
      MAX_BACKOFF_MS,
    );
    consecutiveFailures++;
    opts.onReconnecting?.(consecutiveFailures, delayMs);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delayMs);
  };

  const connect = () => {
    if (closed) return;
    const sock = new WebSocket(url);
    ws = sock;

    sock.on("open", () => {
      opts.onOpen?.();
      const subscribeReq = {
        jsonrpc: "2.0",
        id: 1,
        method: "transactionSubscribe",
        params: [
          { accountInclude: opts.accounts, vote: false, failed: false },
          {
            commitment: "confirmed",
            encoding: "jsonParsed",
            transactionDetails: "full",
            maxSupportedTransactionVersion: 0,
          },
        ],
      };
      sock.send(JSON.stringify(subscribeReq));
    });

    sock.on("message", (raw) => {
      let msg: unknown;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (typeof msg !== "object" || msg === null) return;
      const m = msg as Record<string, unknown>;

      if ("id" in m && m.id === 1) {
        if (m.error && typeof m.error === "object") {
          const e = m.error as { code?: number; message?: string };
          opts.onError?.(
            new Error(
              `transactionSubscribe failed: ${e.code ?? "?"} ${e.message ?? ""}`,
            ),
          );
          return;
        }
        if (typeof m.result === "number") {
          consecutiveFailures = 0;
          opts.onSubscribed?.(m.result);
        }
        return;
      }

      if (m.method === "transactionNotification") {
        const params = m.params as { result?: Record<string, unknown> } | undefined;
        const result = params?.result;
        if (!result) return;
        const sig =
          typeof result.signature === "string"
            ? result.signature
            : extractFirstSignature(result.transaction);
        const slot = typeof result.slot === "number" ? result.slot : undefined;
        if (!sig || slot === undefined) return;
        opts.onEvent({ signature: sig, slot, raw: result });
      }
    });

    sock.on("error", (err) => {
      opts.onError?.(err instanceof Error ? err : new Error(String(err)));
    });

    sock.on("close", (code, reason) => {
      if (ws === sock) ws = null;
      opts.onClose?.(code, reason.toString());
      if (!closed) scheduleReconnect();
    });
  };

  connect();

  return {
    close: () => {
      closed = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (ws) {
        const s = ws;
        if (s.readyState === WebSocket.OPEN || s.readyState === WebSocket.CONNECTING) {
          s.close();
        }
      }
    },
    forceDisconnect: () => {
      if (ws) ws.terminate();
    },
  };
}

function extractFirstSignature(tx: unknown): string | undefined {
  if (!tx || typeof tx !== "object") return undefined;
  const t = tx as { transaction?: { signatures?: unknown[] } };
  const sigs = t.transaction?.signatures;
  if (!Array.isArray(sigs) || sigs.length === 0) return undefined;
  const first = sigs[0];
  return typeof first === "string" ? first : undefined;
}
