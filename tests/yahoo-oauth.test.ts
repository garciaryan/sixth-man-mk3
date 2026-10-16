import { test } from "node:test";
import assert from "node:assert/strict";
import { authorizeUrl, exchangeCode, refreshTokens, fetchGuid, YahooAuthError } from "../lib/yahoo/oauth.ts";
import { stubFetch, json } from "./helpers/fetch-stub.ts";

const cfg = { clientId: "cid", clientSecret: "csec", redirectUri: "https://x.test/api/auth/callback" };

test("authorize URL carries client, redirect, scope and state", () => {
  const u = new URL(authorizeUrl(cfg, "st8"));
  assert.equal(u.origin + u.pathname, "https://api.login.yahoo.com/oauth2/request_auth");
  assert.equal(u.searchParams.get("client_id"), "cid");
  assert.equal(u.searchParams.get("redirect_uri"), cfg.redirectUri);
  assert.equal(u.searchParams.get("response_type"), "code");
  assert.equal(u.searchParams.get("scope"), "openid fspt-r");
  assert.equal(u.searchParams.get("state"), "st8");
});

test("exchangeCode posts the code with Basic auth and maps expiry", async () => {
  const s = stubFetch([json({ access_token: "AT", refresh_token: "RT", expires_in: 3600 })]);
  const t = await exchangeCode(cfg, "CODE", s.fetch, 1_000);
  assert.deepEqual(t, { accessToken: "AT", refreshToken: "RT", expiresAt: 1_000 + 3_600_000, identity: null });
  const c = s.calls[0];
  assert.equal(c.url, "https://api.login.yahoo.com/oauth2/get_token");
  assert.equal(c.method, "POST");
  assert.equal(c.headers.authorization, `Basic ${Buffer.from("cid:csec").toString("base64")}`);
  const form = new URLSearchParams(c.body);
  assert.equal(form.get("grant_type"), "authorization_code");
  assert.equal(form.get("code"), "CODE");
  assert.equal(form.get("redirect_uri"), cfg.redirectUri);
});

test("refreshTokens keeps the old refresh token when Yahoo omits it", async () => {
  const s = stubFetch([json({ access_token: "AT2", expires_in: 3600 })]);
  const t = await refreshTokens(cfg, "RT", s.fetch, 0);
  assert.deepEqual(t, { accessToken: "AT2", refreshToken: "RT", expiresAt: 3_600_000 });
  assert.equal(new URLSearchParams(s.calls[0].body).get("grant_type"), "refresh_token");
});

test("invalid_grant becomes a YahooAuthError with that code", async () => {
  const s = stubFetch([json({ error: "invalid_grant" }, 400)]);
  await assert.rejects(refreshTokens(cfg, "RT", s.fetch, 0), (e: unknown) => e instanceof YahooAuthError && e.code === "invalid_grant");
});

test("other token errors are http errors", async () => {
  const s = stubFetch([new Response("down", { status: 502 })]);
  await assert.rejects(exchangeCode(cfg, "C", s.fetch, 0), (e: unknown) => e instanceof YahooAuthError && e.code === "http");
});

test("fetchGuid reads sub and name from userinfo", async () => {
  const s = stubFetch([json({ sub: "GUID1", name: "Ryan G", given_name: "Ryan" })]);
  assert.deepEqual(await fetchGuid("AT", s.fetch), { guid: "GUID1", name: "Ryan G" });
  assert.equal(s.calls[0].url, "https://api.login.yahoo.com/openid/v1/userinfo");
  assert.equal(s.calls[0].headers.authorization, "Bearer AT");
});

test("token errors carry Yahoo's status and description for the logs", async () => {
  const s = stubFetch([json({ error: "invalid_client", error_description: "client authentication failed" }, 401)]);
  await assert.rejects(exchangeCode(cfg, "C", s.fetch, 0), (e: unknown) =>
    e instanceof YahooAuthError && /401/.test(e.message) && /invalid_client/.test(e.message) && /client authentication failed/.test(e.message));
});

const idToken = (claims: Record<string, unknown>) =>
  `${Buffer.from('{"alg":"ES256"}').toString("base64url")}.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.sig`;

test("exchangeCode reads who signed in from the id_token", async () => {
  const s = stubFetch([json({ access_token: "AT", refresh_token: "RT", expires_in: 3600, xoauth_yahoo_guid: "XG", id_token: idToken({ sub: "SUBG", name: "Ryan G" }) })]);
  const t = await exchangeCode(cfg, "C", s.fetch, 0);
  assert.deepEqual(t.identity, { guid: "SUBG", name: "Ryan G" });
});

test("exchangeCode falls back to xoauth_yahoo_guid without an id_token", async () => {
  const s = stubFetch([json({ access_token: "AT", refresh_token: "RT", expires_in: 3600, xoauth_yahoo_guid: "XG" })]);
  assert.deepEqual((await exchangeCode(cfg, "C", s.fetch, 0)).identity, { guid: "XG", name: null });
});

test("exchangeCode has no identity when Yahoo sends neither", async () => {
  const s = stubFetch([json({ access_token: "AT", refresh_token: "RT", expires_in: 3600, id_token: "not-a-jwt" })]);
  assert.equal((await exchangeCode(cfg, "C", s.fetch, 0)).identity, null);
});
