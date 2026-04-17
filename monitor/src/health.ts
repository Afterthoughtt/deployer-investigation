import { createServer, type Server } from "node:http";
import { errMessage, type Logger } from "./util.js";

// --- Staleness monitor ----------------------------------------------------

export interface StalenessMonitor {
  stop: () => void;
  /** Run one evaluation cycle. Exposed for deterministic tests. */
  tick: () => void;
  isStale: () => boolean;
}

export interface CreateStalenessMonitorArgs {
  thresholdMs: number;
  checkIntervalMs: number;
  /** Used as the implicit floor before any on-ramp event has arrived, so a
   *  fresh daemon doesn't alarm in the first `thresholdMs` after boot. */
  startedAt: number;
  getOnrampLastEventAt: () => number | null;
  onStaleEnter: (info: { ageMs: number }) => void;
  onStaleExit: (info: { stalenessDurationMs: number }) => void;
  log: Logger;
  now?: () => number;
}

/**
 * Fires `onStaleEnter` once when the on-ramp event age crosses `thresholdMs`,
 * and `onStaleExit` once when it drops back below. Only edge transitions
 * produce callbacks, so consumers don't need their own dedup. Intentionally
 * does NOT consider WebSocket connection state — a brief WS blip recovers
 * faster than a single check interval, and the auto-reconnect logic handles
 * reconnection with logs. Real subscription breakage will present as age
 * growing past the threshold.
 */
export function createStalenessMonitor(
  args: CreateStalenessMonitorArgs,
): StalenessMonitor {
  const now = args.now ?? (() => Date.now());
  let stale = false;
  let staleSince: number | null = null;

  const tick = (): void => {
    const last = args.getOnrampLastEventAt() ?? args.startedAt;
    const t = now();
    const ageMs = t - last;
    const nowStale = ageMs > args.thresholdMs;
    if (nowStale && !stale) {
      stale = true;
      staleSince = t;
      try {
        args.onStaleEnter({ ageMs });
      } catch (err) {
        args.log.error(`staleness: onStaleEnter threw ${errMessage(err)}`);
      }
    } else if (!nowStale && stale) {
      const durMs = staleSince !== null ? t - staleSince : 0;
      stale = false;
      staleSince = null;
      try {
        args.onStaleExit({ stalenessDurationMs: durMs });
      } catch (err) {
        args.log.error(`staleness: onStaleExit threw ${errMessage(err)}`);
      }
    }
  };

  const handle = setInterval(tick, args.checkIntervalMs);
  return {
    stop: () => clearInterval(handle),
    tick,
    isStale: () => stale,
  };
}

// --- Health HTTP server ---------------------------------------------------

export interface HealthServerHandle {
  port: number;
  close: () => Promise<void>;
}

export interface StartHealthServerArgs {
  port: number;
  /** Defaults to 127.0.0.1 so the endpoint stays on the loopback interface. */
  host?: string;
  thresholdMs: number;
  startedAt: number;
  getOnrampLastEventAt: () => number | null;
  getWsConnected: () => boolean;
  log: Logger;
  now?: () => number;
}

export async function startHealthServer(
  args: StartHealthServerArgs,
): Promise<HealthServerHandle> {
  const host = args.host ?? "127.0.0.1";
  const now = args.now ?? (() => Date.now());
  const server: Server = createServer((req, res) => {
    if (req.method !== "GET" || req.url !== "/health") {
      res.statusCode = 404;
      res.end();
      return;
    }
    const wsConnected = args.getWsConnected();
    const last = args.getOnrampLastEventAt() ?? args.startedAt;
    const ageMs = now() - last;
    const healthy = wsConnected && ageMs <= args.thresholdMs;
    res.statusCode = healthy ? 200 : 503;
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        healthy,
        wsConnected,
        lastOnrampEventAgoMs: ageMs,
        thresholdMs: args.thresholdMs,
      }),
    );
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(args.port, host, () => resolve());
  });

  const addr = server.address();
  const boundPort =
    typeof addr === "object" && addr !== null ? addr.port : args.port;
  args.log.info(`health: listening on http://${host}:${boundPort}/health`);

  return {
    port: boundPort,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

// --- Heartbeat timer ------------------------------------------------------

export interface HeartbeatHandle {
  stop: () => void;
}

export interface CreateHeartbeatArgs {
  intervalMs: number;
  push: () => Promise<void>;
  log: Logger;
}

export function createHeartbeat(args: CreateHeartbeatArgs): HeartbeatHandle {
  const handle = setInterval(() => {
    args.push()
      .then(() => args.log.info("heartbeat: sent"))
      .catch((err) => {
        args.log.error(`heartbeat: push failed ${errMessage(err)}`);
      });
  }, args.intervalMs);
  return { stop: () => clearInterval(handle) };
}
