import WebSocket from "ws";

const ENHANCED_WS_URL = "wss://atlas-mainnet.helius-rpc.com";

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
}

export interface HeliusWsHandle {
  close: () => void;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id?: number;
  result?: unknown;
  error?: { code: number; message: string };
}

interface TransactionNotification {
  jsonrpc: "2.0";
  method: "transactionNotification";
  params: {
    subscription: number;
    result: {
      signature?: string;
      slot?: number;
      transaction?: unknown;
    };
  };
}

export function connectHeliusWs(opts: HeliusWsOptions): HeliusWsHandle {
  const url = `${ENHANCED_WS_URL}/?api-key=${opts.apiKey}`;
  const ws = new WebSocket(url);

  ws.on("open", () => {
    opts.onOpen?.();
    const subscribeReq = {
      jsonrpc: "2.0",
      id: 1,
      method: "transactionSubscribe",
      params: [
        {
          accountInclude: opts.accounts,
          vote: false,
          failed: false,
        },
        {
          commitment: "confirmed",
          encoding: "jsonParsed",
          transactionDetails: "full",
          maxSupportedTransactionVersion: 0,
        },
      ],
    };
    ws.send(JSON.stringify(subscribeReq));
  });

  ws.on("message", (raw) => {
    let msg: JsonRpcResponse | TransactionNotification;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if ("id" in msg && msg.id === 1) {
      if (msg.error) {
        opts.onError?.(
          new Error(`transactionSubscribe failed: ${msg.error.code} ${msg.error.message}`),
        );
        return;
      }
      if (typeof msg.result === "number") {
        opts.onSubscribed?.(msg.result);
      }
      return;
    }

    if ("method" in msg && msg.method === "transactionNotification") {
      const result = msg.params?.result;
      if (!result) return;
      const sig = result.signature ?? extractFirstSignature(result.transaction);
      if (sig === undefined || result.slot === undefined) return;
      opts.onEvent({
        signature: sig,
        slot: result.slot,
        raw: result,
      });
    }
  });

  ws.on("error", (err) => {
    opts.onError?.(err instanceof Error ? err : new Error(String(err)));
  });

  ws.on("close", (code, reason) => {
    opts.onClose?.(code, reason.toString());
  });

  return {
    close: () => {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
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
