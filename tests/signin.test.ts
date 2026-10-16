import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { migrate, migrations } from "../lib/migrations.ts";
import { getUser } from "../lib/store.ts";
import { getService } from "../lib/yahoo/auth-store.ts";
import { completeSignIn, needsRecheck, RECHECK_MS } from "../lib/signin.ts";
import { stubFetch, json } from "./helpers/fetch-stub.ts";
import { fixture } from "./helpers/fixtures.ts";

const cfg = { clientId: "cid", clientSecret: "csec", redirectUri: "https://x.test/api/auth/callback" };
const NOW = 5_000_000;

function run(guid: string, opts: { leagueKey?: string | null; teams?: Response; token?: Response } = {}) {
  const db = new DatabaseSync(":memory:");
  migrate(db, migrations);
  const responses = [
    opts.token ?? json({ access_token: "UAT", refresh_token: "URT", expires_in: 3600 }),
    json({ sub: guid, name: "Someone" }),
  ];
  if (opts.teams) responses.push(opts.teams);
  const s = stubFetch(responses);
  const leagueKey = opts.leagueKey === undefined ? "466.l.1001" : opts.leagueKey;
  const result = completeSignIn(
    { db, cfg, leagueKey, adminGuid: "ADMINGUID", fetchFn: s.fetch, now: NOW, throttle: { nextAt: 0 } }, "CODE",
  );
  return { db, result, calls: s.calls };
}

test("a member gets in and is remembered with their team, without storing tokens", async () => {
  const t = run("MEMBERGUID", { teams: json(fixture("user-teams")) });
  assert.deepEqual(await t.result, { kind: "ok", guid: "MEMBERGUID" });
  assert.deepEqual(getUser(t.db, "MEMBERGUID"), { guid: "MEMBERGUID", name: "Someone", teamKey: "466.l.1001.t.3", checkedAt: NOW });
  assert.equal(getService(t.db), null);
  assert.equal(t.calls[2].headers.authorization, "Bearer UAT");
});

test("the admin's tokens become the service connection", async () => {
  const t = run("ADMINGUID", { teams: json(fixture("user-teams")) });
  assert.deepEqual(await t.result, { kind: "ok", guid: "ADMINGUID" });
  assert.deepEqual(getService(t.db), { guid: "ADMINGUID", accessToken: "UAT", refreshToken: "URT", expiresAt: NOW + 3_600_000, status: "ok" });
});

test("a non-member is denied and nothing is written", async () => {
  const t = run("STRANGER", { leagueKey: "466.l.9999", teams: json(fixture("user-teams")) });
  assert.deepEqual(await t.result, { kind: "denied", leagueName: null });
  assert.equal(getUser(t.db, "STRANGER"), null);
  assert.equal(getService(t.db), null);
});

test("the admin can sign in before a league is chosen", async () => {
  const t = run("ADMINGUID", { leagueKey: null });
  assert.deepEqual(await t.result, { kind: "ok", guid: "ADMINGUID" });
  assert.equal(getService(t.db)?.accessToken, "UAT");
  assert.equal(getUser(t.db, "ADMINGUID")?.teamKey, null);
});

test("a member can't sign in before a league is chosen", async () => {
  const t = run("MEMBERGUID", { leagueKey: null });
  assert.deepEqual(await t.result, { kind: "denied", leagueName: null });
});

test("a failed code exchange is an exchange error", async () => {
  const t = run("MEMBERGUID", { token: json({ error: "invalid_request" }, 400) });
  assert.deepEqual(await t.result, { kind: "error", code: "exchange" });
});

test("a failed teams lookup is a leagues error", async () => {
  const t = run("MEMBERGUID", { teams: new Response("", { status: 404 }) });
  assert.deepEqual(await t.result, { kind: "error", code: "leagues" });
});

test("the admin still gets in when the teams lookup fails, without a team", async () => {
  const t = run("ADMINGUID", { teams: new Response("", { status: 404 }) });
  assert.deepEqual(await t.result, { kind: "ok", guid: "ADMINGUID" });
  assert.equal(getUser(t.db, "ADMINGUID")?.teamKey, null);
  assert.equal(getService(t.db)?.accessToken, "UAT");
});

test("membership is re-checked after 24 hours", () => {
  assert.equal(RECHECK_MS, 24 * 3600 * 1000);
  assert.equal(needsRecheck({ checkedAt: NOW }, NOW + RECHECK_MS - 1), false);
  assert.equal(needsRecheck({ checkedAt: NOW }, NOW + RECHECK_MS), true);
  assert.equal(needsRecheck(null, NOW), true);
});

test("a failed exchange logs Yahoo's reason", async () => {
  const logged: unknown[][] = [];
  const orig = console.error;
  console.error = (...a: unknown[]) => { logged.push(a); };
  try {
    const t = run("MEMBERGUID", { token: json({ error: "invalid_grant", error_description: "redirect_uri mismatch" }, 400) });
    await t.result;
  } finally {
    console.error = orig;
  }
  assert.match(logged.map((a) => a.join(" ")).join("\n"), /redirect_uri mismatch/);
});

test("the GUID from the token response is used without calling userinfo", async () => {
  const db = new DatabaseSync(":memory:");
  migrate(db, migrations);
  const s = stubFetch([
    json({ access_token: "UAT", refresh_token: "URT", expires_in: 3600, xoauth_yahoo_guid: "MEMBERGUID" }),
    json(fixture("user-teams")),
  ]);
  const r = await completeSignIn({ db, cfg, leagueKey: "466.l.1001", adminGuid: "ADMINGUID", fetchFn: s.fetch, now: NOW, throttle: { nextAt: 0 } }, "CODE");
  assert.deepEqual(r, { kind: "ok", guid: "MEMBERGUID" });
  assert.ok(!s.calls.some((c) => c.url.includes("userinfo")));
  assert.equal(getUser(db, "MEMBERGUID")?.name, "Manager");
});

test("without a GUID in the token response, a refused userinfo is a userinfo error", async () => {
  const db = new DatabaseSync(":memory:");
  migrate(db, migrations);
  const s = stubFetch([json({ access_token: "UAT", refresh_token: "URT", expires_in: 3600 }), new Response("", { status: 403 })]);
  const r = await completeSignIn({ db, cfg, leagueKey: "466.l.1001", adminGuid: "ADMINGUID", fetchFn: s.fetch, now: NOW, throttle: { nextAt: 0 } }, "CODE");
  assert.deepEqual(r, { kind: "error", code: "userinfo" });
});

test("with no admin configured, a turned-away sign-in logs the GUID to use", async () => {
  const db = new DatabaseSync(":memory:");
  migrate(db, migrations);
  const s = stubFetch([json({ access_token: "UAT", refresh_token: "URT", expires_in: 3600, xoauth_yahoo_guid: "NEWGUID" })]);
  const logged: string[] = [];
  const orig = console.info;
  console.info = (...a: unknown[]) => { logged.push(a.join(" ")); };
  try {
    const r = await completeSignIn({ db, cfg, leagueKey: null, adminGuid: "", fetchFn: s.fetch, now: NOW, throttle: { nextAt: 0 } }, "CODE");
    assert.equal(r.kind, "denied");
  } finally {
    console.info = orig;
  }
  assert.match(logged.join("\n"), /ADMIN_YAHOO_GUID=NEWGUID/);
  assert.equal(getUser(db, "NEWGUID"), null);
});
