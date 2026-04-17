/**
 * Unit tests for increment 11: staleness state machine + /health HTTP server.
 *
 * Staleness is tested via the exposed `tick()` with a mocked `now()` so we
 * don't depend on wall-clock timing. The HTTP server is tested against the
 * real `http.createServer` on an OS-assigned loopback port.
 */

import {
  createStalenessMonitor,
  startHealthServer,
} from "../src/health.js";

let pass = true;
const check = (name: string, cond: boolean, detail?: string) => {
  const tag = cond ? "PASS" : "FAIL";
  console.log(`  ${tag}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) pass = false;
};

const silentLog = {
  info: () => {},
  warn: () => {},
  error: (m: string) => console.error(`[err] ${m}`),
};

// ---------- Staleness state machine ----------

{
  console.log("Staleness monitor:");
  let now = 1_000_000;
  let lastEvent: number | null = null;
  const entered: Array<{ ageMs: number }> = [];
  const exited: Array<{ stalenessDurationMs: number }> = [];
  const mon = createStalenessMonitor({
    thresholdMs: 1000,
    checkIntervalMs: 10_000_000, // effectively never auto-fires; we drive via tick()
    startedAt: now,
    getOnrampLastEventAt: () => lastEvent,
    onStaleEnter: (info) => entered.push(info),
    onStaleExit: (info) => exited.push(info),
    log: silentLog,
    now: () => now,
  });

  // Within grace window: age = now - startedAt = 0, not stale.
  mon.tick();
  check(
    "initial tick: not stale",
    !mon.isStale() && entered.length === 0 && exited.length === 0,
  );

  // Advance past threshold, no event yet → stale (startedAt is the floor).
  now += 1500;
  mon.tick();
  check(
    "crossing threshold fires onStaleEnter once",
    mon.isStale() && entered.length === 1 && exited.length === 0,
    `ageMs=${entered[0]?.ageMs}`,
  );

  // Tick again without an event → still stale, no duplicate fire.
  now += 500;
  mon.tick();
  check(
    "staying stale does not re-fire",
    mon.isStale() && entered.length === 1 && exited.length === 0,
  );

  // Event arrives → back to fresh, fires onStaleExit once.
  lastEvent = now;
  mon.tick();
  check(
    "recovery fires onStaleExit once",
    !mon.isStale() && entered.length === 1 && exited.length === 1,
    `durMs=${exited[0]?.stalenessDurationMs}`,
  );
  check(
    "recovery reports positive staleness duration",
    (exited[0]?.stalenessDurationMs ?? -1) > 0,
  );

  // Ticking while fresh: nothing changes.
  now += 100;
  mon.tick();
  check(
    "fresh ticks are no-ops",
    !mon.isStale() && entered.length === 1 && exited.length === 1,
  );

  // Age out again → second stale episode.
  now += 5000;
  mon.tick();
  check(
    "second stale episode fires onStaleEnter again",
    mon.isStale() && entered.length === 2 && exited.length === 1,
  );

  mon.stop();
}

// ---------- Staleness: callback throws should not poison the monitor ----------

{
  console.log("Staleness callback error isolation:");
  let now = 2_000_000;
  let lastEvent: number | null = now;
  let enterCalls = 0;
  const mon = createStalenessMonitor({
    thresholdMs: 1000,
    checkIntervalMs: 10_000_000,
    startedAt: now,
    getOnrampLastEventAt: () => lastEvent,
    onStaleEnter: () => {
      enterCalls++;
      throw new Error("boom");
    },
    onStaleExit: () => {},
    log: silentLog,
    now: () => now,
  });

  now += 2000;
  mon.tick();
  check(
    "onStaleEnter that throws still transitions state",
    mon.isStale() && enterCalls === 1,
  );

  // Recovery still works after the throw.
  lastEvent = now;
  mon.tick();
  check(
    "recovery after throwing enter callback still fires",
    !mon.isStale(),
  );
  mon.stop();
}

// ---------- Health HTTP server ----------

{
  console.log("Health HTTP server:");
  let now = 3_000_000;
  let lastEvent: number | null = null;
  let wsConnected = true;
  const server = await startHealthServer({
    port: 0, // OS-assigned
    thresholdMs: 1000,
    startedAt: now,
    getOnrampLastEventAt: () => lastEvent,
    getWsConnected: () => wsConnected,
    log: silentLog,
    now: () => now,
  });
  const base = `http://127.0.0.1:${server.port}`;

  // WS connected + fresh (via grace window): 200.
  {
    const res = await fetch(`${base}/health`);
    const body = await res.json();
    check(
      "200 when ws=connected, within grace window",
      res.status === 200 && body.healthy === true && body.wsConnected === true,
      `body=${JSON.stringify(body)}`,
    );
  }

  // WS disconnected: 503 even if fresh.
  {
    wsConnected = false;
    const res = await fetch(`${base}/health`);
    const body = await res.json();
    check(
      "503 when ws=disconnected",
      res.status === 503 && body.healthy === false && body.wsConnected === false,
    );
  }

  // WS reconnected but age past threshold: 503.
  {
    wsConnected = true;
    now += 5000;
    const res = await fetch(`${base}/health`);
    const body = await res.json();
    check(
      "503 when on-ramp stale (age > threshold)",
      res.status === 503 &&
        body.healthy === false &&
        body.wsConnected === true &&
        body.lastOnrampEventAgoMs > 1000,
      `ageMs=${body.lastOnrampEventAgoMs}`,
    );
  }

  // Fresh event + ws connected: 200.
  {
    lastEvent = now;
    const res = await fetch(`${base}/health`);
    const body = await res.json();
    check(
      "200 when ws=connected and event is fresh",
      res.status === 200 &&
        body.healthy === true &&
        body.lastOnrampEventAgoMs === 0,
    );
  }

  // Wrong route: 404.
  {
    const res = await fetch(`${base}/nope`);
    check("404 for unknown route", res.status === 404);
    await res.text();
  }

  // Wrong method: 404 (keeping it simple — we only serve GET /health).
  {
    const res = await fetch(`${base}/health`, { method: "POST" });
    check("404 for POST /health", res.status === 404);
    await res.text();
  }

  await server.close();
}

console.log(pass ? "ALL PASS" : "SOME FAILED");
process.exit(pass ? 0 : 1);
