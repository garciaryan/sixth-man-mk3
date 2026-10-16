// Yahoo OAuth 2.0 + OpenID: authorize URL, code exchange, refresh, and who signed in. Server-side only.

export type Tokens = { accessToken: string; refreshToken: string; expiresAt: number };
export type OAuthConfig = { clientId: string; clientSecret: string; redirectUri: string };

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

async function tokenRequest(cfg: OAuthConfig, form: Record<string, string>, fetchFn: typeof fetch, now: number, oldRefresh?: string): Promise<Tokens> {
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
  return { accessToken: body.access_token, refreshToken, expiresAt: now + Number(body.expires_in ?? 3600) * 1000 };
}

export function exchangeCode(cfg: OAuthConfig, code: string, fetchFn: typeof fetch = fetch, now = Date.now()): Promise<Tokens> {
  return tokenRequest(cfg, { grant_type: "authorization_code", code }, fetchFn, now);
}

export function refreshTokens(cfg: OAuthConfig, refreshToken: string, fetchFn: typeof fetch = fetch, now = Date.now()): Promise<Tokens> {
  return tokenRequest(cfg, { grant_type: "refresh_token", refresh_token: refreshToken }, fetchFn, now, refreshToken);
}

export async function fetchGuid(accessToken: string, fetchFn: typeof fetch = fetch): Promise<{ guid: string; name: string }> {
  const res = await fetchFn(USERINFO, { headers: { authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new YahooAuthError("http", `Yahoo userinfo failed (${res.status}).`);
  const body = (await res.json()) as Record<string, string | undefined>;
  if (!body.sub) throw new YahooAuthError("http", "Yahoo userinfo had no id.");
  return { guid: body.sub, name: body.name ?? body.given_name ?? body.nickname ?? "Manager" };
}
