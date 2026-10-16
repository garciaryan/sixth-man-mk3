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

// Shared by every client in the process, so the sync and sign-in never exceed the rate together. Kept on globalThis
// because Next's middleware and route handlers are separate bundles, each with its own copy of this module.
const g = globalThis as typeof globalThis & { __sixthYahoo?: { throttle: Throttle; queue: Promise<unknown> } };
g.__sixthYahoo ??= { throttle: { nextAt: 0 }, queue: Promise.resolve() };
const shared = g.__sixthYahoo;

export function createClient(deps: {
  db: DatabaseSync;
  cfg: OAuthConfig;
  fetchFn?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  throttle?: Throttle;
  /** A signed-in user's own token, used once at sign-in instead of the service connection. */
  accessToken?: string;
}): YahooClient {
  const fetchFn = deps.fetchFn ?? fetch;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = deps.now ?? Date.now;
  const throttle = deps.throttle ?? shared.throttle;

  async function token(): Promise<string> {
    if (deps.accessToken) return deps.accessToken;
    const s = getService(deps.db);
    if (!s || s.status !== "ok") throw new NeedsReconnectError();
    if (s.expiresAt - now() >= REFRESH_EARLY_MS) return s.accessToken;
    return refresh(s.guid, s.refreshToken);
  }

  async function refresh(guid: string, refreshToken: string): Promise<string> {
    try {
      const t = await refreshTokens(deps.cfg, refreshToken, fetchFn, now());
      saveService(deps.db, guid, t);
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
    let refreshed = false;
    for (let attempt = 0; ; attempt++) {
      const access = await token();
      await slot();
      const res = await fetchFn(url, { headers: { authorization: `Bearer ${access}` } });
      if (res.ok) return res.json();
      // Yahoo can revoke an access token before it expires: refresh once and try again.
      const s = deps.accessToken ? null : getService(deps.db);
      if (res.status === 401 && !refreshed && s) {
        refreshed = true;
        await refresh(s.guid, s.refreshToken);
        attempt--;
        continue;
      }
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt >= BACKOFF_MS.length) throw new Error(`Yahoo request failed (${res.status}) for ${path}`);
      await sleep(BACKOFF_MS[attempt]);
    }
  }

  return {
    get(path) {
      const run = shared.queue.then(() => request(path));
      shared.queue = run.catch(() => undefined);
      return run;
    },
  };
}
