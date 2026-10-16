import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { migrate, migrations } from "../lib/migrations.ts";
import { saveService, getService } from "../lib/yahoo/auth-store.ts";
import { createClient, NeedsReconnectError } from "../lib/yahoo/client.ts";
import { stubFetch, json } from "./helpers/fetch-stub.ts";

const cfg = { clientId: "cid", clientSecret: "csec", redirectUri: "https://x.test/api/auth/callback" };
const HOUR = 3_600_000;

function setup(responses: Response[], expiresIn = HOUR) {
  const db = new DatabaseSync(":memory:");
  migrate(db, migrations);
  let clock = 1_000_000;
  saveService(db, "G", { accessToken: "AT", refreshToken: "RT", expiresAt: clock + expiresIn });
  const sleeps: number[] = [];
  const s = stubFetch(responses);
  const client = createClient({
    db, cfg, fetchFn: s.fetch, now: () => clock,
    sleep: async (ms) => { sleeps.push(ms); clock += ms; },
    throttle: { nextAt: 0 },
  });
  return { db, client, calls: s.calls, sleeps, tick: (ms: number) => (clock += ms) };
}

test("get prefixes the API base, asks for JSON and sends the token", async () => {
  const t = setup([json({ fantasy_content: {} })]);
  assert.deepEqual(await t.client.get("/league/466.l.1/settings"), { fantasy_content: {} });
  assert.equal(t.calls[0].url, "https://fantasysports.yahooapis.com/fantasy/v2/league/466.l.1/settings?format=json");
  assert.equal(t.calls[0].headers.authorization, "Bearer AT");
});

test("back-to-back requests are spaced one second apart", async () => {
  const t = setup([json({}), json({})]);
  await t.client.get("/a");
  t.tick(200);
  await t.client.get("/b;x=1?y=2");
  assert.deepEqual(t.sleeps, [800]);
  assert.equal(t.calls[1].url, "https://fantasysports.yahooapis.com/fantasy/v2/b;x=1?y=2&format=json");
});

test("429 and 5xx are retried with 2 s then 4 s backoff", async () => {
  const t = setup([new Response("", { status: 429 }), new Response("", { status: 503 }), json({ ok: 1 })]);
  assert.deepEqual(await t.client.get("/a"), { ok: 1 });
  assert.deepEqual(t.sleeps.filter((ms) => ms >= 2000), [2000, 4000]);
});

test("three server errors give up", async () => {
  const t = setup([new Response("", { status: 500 }), new Response("", { status: 500 }), new Response("", { status: 500 })]);
  await assert.rejects(t.client.get("/a"), /500/);
  assert.equal(t.calls.length, 3);
});

test("a 4xx other than 429 fails at once", async () => {
  const t = setup([new Response("", { status: 404 })]);
  await assert.rejects(t.client.get("/a"), /404/);
  assert.equal(t.calls.length, 1);
});

test("a token with under 5 minutes left is refreshed first and saved", async () => {
  const t = setup([json({ access_token: "AT2", refresh_token: "RT2", expires_in: 3600 }), json({})], 4 * 60_000);
  await t.client.get("/a");
  assert.equal(t.calls[0].url, "https://api.login.yahoo.com/oauth2/get_token");
  assert.equal(t.calls[1].headers.authorization, "Bearer AT2");
  assert.equal(getService(t.db)?.refreshToken, "RT2");
});

test("a refused refresh marks the connection for reconnect", async () => {
  const t = setup([json({ error: "invalid_grant" }, 400)], 0);
  await assert.rejects(t.client.get("/a"), NeedsReconnectError);
  assert.equal(getService(t.db)?.status, "needs_reconnect");
});

test("a connection needing reconnect never fetches", async () => {
  const t = setup([]);
  t.db.prepare("UPDATE yahoo_auth SET status = 'needs_reconnect'").run();
  await assert.rejects(t.client.get("/a"), NeedsReconnectError);
  assert.equal(t.calls.length, 0);
});

test("no connection at all needs reconnect", async () => {
  const t = setup([]);
  t.db.prepare("DELETE FROM yahoo_auth").run();
  await assert.rejects(t.client.get("/a"), NeedsReconnectError);
});
