// Yahoo OAuth 2.0 + OpenID: authorize URL, code exchange, refresh, and who signed in. Server-side only.

export type Tokens = { accessToken: string; refreshToken: string; expiresAt: number };
export type OAuthConfig = { clientId: string; clientSecret: string; redirectUri: string };
/** Who signed in, as Yahoo's token response says (no extra call). */
export type Identity = { guid: string; name: string | null };

const AUTHORIZE = "https://api.login.yahoo.com/oauth2/request_auth";
const TOKEN = "https://api.login.yahoo.com/oauth2/get_token";
const USERINFO = "https://api.login.yahoo.com/openid/v1/userinfo";

export class YahooAuthError extends Error {
  code: "invalid_grant" | "http";
  constructor(code: "invalid_grant" | "http", message: string) {
    super(message);
    this.code = code;
  }
}

export function authorizeUrl(cfg: Pick<OAuthConfig, "clientId" | "redirectUri">, state: string): string {
  const q = new URLSearchParams({
    client_id: cfg.clientId, redirect_uri: cfg.redirectUri, response_type: "code", scope: "openid fspt-r", state,
  });
  return `${AUTHORIZE}?${q}`;
}

async function tokenRequest(cfg: OAuthConfig, form: Record<string, string>, fetchFn: typeof fetch, now: number, oldRefresh?: string): Promise<{ tokens: Tokens; body: Record<string, unknown> }> {
  const res = await fetchFn(TOKEN, {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ ...form, redirect_uri: cfg.redirectUri }).toString(),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    // Yahoo's own reason (never tokens), so a failed sign-in can be diagnosed from the server log.
    const reason = [body.error, body.error_description].filter(Boolean).join(": ");
    const detail = `Yahoo token request failed (${res.status})${reason ? `: ${reason}` : ""}`;
    if (body.error === "invalid_grant") throw new YahooAuthError("invalid_grant", detail);
    throw new YahooAuthError("http", detail);
  }
  const refreshToken = (body.refresh_token as string | undefined) ?? oldRefresh;
  if (typeof body.access_token !== "string" || !refreshToken) {
    throw new YahooAuthError("http", `Yahoo returned no ${typeof body.access_token !== "string" ? "access" : "refresh"} token.`);
  }
  return { tokens: { accessToken: body.access_token, refreshToken, expiresAt: now + Number(body.expires_in ?? 3600) * 1000 }, body };
}

export async function exchangeCode(
  cfg: OAuthConfig, code: string, fetchFn: typeof fetch = fetch, now = Date.now(),
): Promise<Tokens & { identity: Identity | null }> {
  const { tokens, body } = await tokenRequest(cfg, { grant_type: "authorization_code", code }, fetchFn, now);
  return { ...tokens, identity: identityFrom(body) };
}

export async function refreshTokens(cfg: OAuthConfig, refreshToken: string, fetchFn: typeof fetch = fetch, now = Date.now()): Promise<Tokens> {
  return (await tokenRequest(cfg, { grant_type: "refresh_token", refresh_token: refreshToken }, fetchFn, now, refreshToken)).tokens;
}

/** The GUID from the id_token's `sub` (OpenID), else Yahoo's `xoauth_yahoo_guid`. The id_token came straight from
 * Yahoo's token endpoint over TLS, so its claims are read without checking the signature. */
function identityFrom(body: Record<string, unknown>): Identity | null {
  if (typeof body.id_token === "string") {
    try {
      const claims = JSON.parse(Buffer.from(body.id_token.split(".")[1] ?? "", "base64url").toString("utf8")) as Record<string, unknown>;
      const name = [claims.name, claims.nickname, claims.given_name].find((v): v is string => typeof v === "string") ?? null;
      if (typeof claims.sub === "string" && claims.sub) return { guid: claims.sub, name };
    } catch {
      // not a JWT; fall through
    }
  }
  return typeof body.xoauth_yahoo_guid === "string" && body.xoauth_yahoo_guid ? { guid: body.xoauth_yahoo_guid, name: null } : null;
}

export async function fetchGuid(accessToken: string, fetchFn: typeof fetch = fetch): Promise<{ guid: string; name: string }> {
  const res = await fetchFn(USERINFO, { headers: { authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new YahooAuthError("http", `Yahoo userinfo failed (${res.status}).`);
  const body = (await res.json()) as Record<string, string | undefined>;
  if (!body.sub) throw new YahooAuthError("http", "Yahoo userinfo had no id.");
  return { guid: body.sub, name: body.name ?? body.given_name ?? body.nickname ?? "Manager" };
}
