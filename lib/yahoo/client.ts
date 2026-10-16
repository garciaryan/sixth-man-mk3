// The one way to call the Yahoo Fantasy API: the service connection's token, at most one request per second, and
// retries on 429/5xx. Server-side only.
import type { DatabaseSync } from "node:sqlite";
import { getService, markNeedsReconnect, saveService } from "./auth-store.ts";
import { refreshTokens, YahooAuthError, type OAuthConfig } from "./oauth.ts";

export const API_BASE = "https://fantasysports.yahooapis.com/fantasy/v2";
const MIN_GAP_MS = 1000;
const BACKOFF_MS = [2000, 4000];
const REFRESH_EARLY_MS = 5 * 60_000;

export class NeedsReconnectError extends Error {
  constructor() {
    super("Reconnect Yahoo");
  }
}

export type YahooClient = { get(path: string): Promise<unknown> };
type Throttle = { nextAt: number };

// Shared by every client in the process, so the sync and sign-in never exceed the rate together.
const sharedThrottle: Throttle = { nextAt: 0 };
let queue: Promise<unknown> = Promise.resolve();

export function createClient(deps: {
  db: DatabaseSync;
  cfg: OAuthConfig;
  fetchFn?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  throttle?: Throttle;
}): YahooClient {
  const fetchFn = deps.fetchFn ?? fetch;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = deps.now ?? Date.now;
  const throttle = deps.throttle ?? sharedThrottle;

  async function token(): Promise<string> {
    const s = getService(deps.db);
    if (!s || s.status !== "ok") throw new NeedsReconnectError();
    if (s.expiresAt - now() >= REFRESH_EARLY_MS) return s.accessToken;
    try {
      const t = await refreshTokens(deps.cfg, s.refreshToken, fetchFn, now());
      saveService(deps.db, s.guid, t);
      return t.accessToken;
    } catch (e) {
      if (e instanceof YahooAuthError && e.code === "invalid_grant") {
        markNeedsReconnect(deps.db);
        throw new NeedsReconnectError();
      }
      throw e;
    }
  }

  async function slot(): Promise<void> {
    const wait = throttle.nextAt - now();
    if (wait > 0) await sleep(wait);
    throttle.nextAt = now() + MIN_GAP_MS;
  }

  async function request(path: string): Promise<unknown> {
    const url = `${API_BASE}${path}${path.includes("?") ? "&" : "?"}format=json`;
    for (let attempt = 0; ; attempt++) {
      const access = await token();
      await slot();
      const res = await fetchFn(url, { headers: { authorization: `Bearer ${access}` } });
      if (res.ok) return res.json();
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt >= BACKOFF_MS.length) throw new Error(`Yahoo request failed (${res.status}) for ${path}`);
      await sleep(BACKOFF_MS[attempt]);
    }
  }

  return {
    get(path) {
      const run = queue.then(() => request(path));
      queue = run.catch(() => undefined);
      return run;
    },
  };
}
