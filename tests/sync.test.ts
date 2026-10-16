import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { migrate, migrations } from "../lib/migrations.ts";
import { getGames, getLeague, getPickedLeagueKey, getPlayers, getSyncState, getTeams, pickLeague } from "../lib/store.ts";
import { runSync, lastRuns } from "../lib/sync/run.ts";
import { createWorker, syncRequest } from "../lib/sync/worker.ts";
import { NeedsReconnectError } from "../lib/yahoo/client.ts";
import { fixture } from "./helpers/fixtures.ts";

const NOW = new Date("2026-10-24T15:00:00Z"); // yesterday in New York = 2026-10-23; season starts 2026-10-20
const LEAGUE = "466.l.1001";

function fresh() {
  const db = new DatabaseSync(":memory:");
  migrate(db, migrations);
  db.prepare("INSERT INTO yahoo_auth (id, guid, access_token, refresh_token, expires_at) VALUES (1, 'G', 'a', 'r', 0)").run();
  return db;
}

function fakeClient(opts: { failDate?: string; reconnect?: boolean; gate?: Promise<void> } = {}) {
  const paths: string[] = [];
  const empty = { fantasy_content: { league: [{}, { players: { count: 0 } }] } };
  return {
    paths,
    dates: () => paths.filter((p) => p.includes("type=date")).map((p) => /date=([\d-]+)/.exec(p)![1]),
    get: async (p: string) => {
      paths.push(p);
      if (opts.gate) await opts.gate;
      if (opts.reconnect) throw new NeedsReconnectError();
      if (p.endsWith("/settings")) return fixture("league-settings");
      if (p.endsWith("/teams")) return fixture("league-teams");
      if (p.includes("status=T")) return fixture("league-players");
      if (p.includes("status=A")) return empty;
      if (opts.failDate && p.includes(`date=${opts.failDate}`)) throw new Error("Yahoo request failed (503)");
      return fixture("player-stats-date");
    },
  };
}

test("a fresh sync stores league data and every date from the season start to yesterday", async () => {
  const db = fresh();
  const client = fakeClient();
  const r = await runSync({ db, client, leagueKey: LEAGUE, now: NOW });
  assert.deepEqual(r, { datesSynced: 4, status: "ok" });
  assert.deepEqual(client.dates(), ["2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23"]);
  assert.equal(getSyncState(db).lastDate, "2026-10-23");
  assert.equal(getLeague(db)?.name, "Hoops League");
  assert.equal(getTeams(db).length, 2);
  assert.equal(getPlayers(db).length, 2);
  // Only the player who played is stored.
  const games = getGames(db, null, "2026-10-20", "2026-10-23");
  assert.deepEqual([...games.keys()], ["466.p.6583"]);
  assert.equal(games.get("466.p.6583")!.length, 4);
  assert.equal(lastRuns(db, 5)[0].status, "ok");
});

test("every run re-syncs the last two dates so late games and stat corrections land", async () => {
  const db = fresh();
  await runSync({ db, client: fakeClient(), leagueKey: LEAGUE, now: NOW });
  const client = fakeClient();
  assert.deepEqual(await runSync({ db, client, leagueKey: LEAGUE, now: NOW }), { datesSynced: 2, status: "ok" });
  assert.deepEqual(client.dates(), ["2026-10-22", "2026-10-23"]);
  assert.equal(getSyncState(db).lastDate, "2026-10-23");
});

test("a failure keeps the last good date and the next run resumes there", async () => {
  const db = fresh();
  const r = await runSync({ db, client: fakeClient({ failDate: "2026-10-22" }), leagueKey: LEAGUE, now: NOW });
  assert.equal(r.status, "error");
  assert.equal(r.datesSynced, 2);
  assert.match(r.error!, /503/);
  assert.equal(getSyncState(db).lastDate, "2026-10-21");
  assert.equal(lastRuns(db, 1)[0].error, r.error);
  const client = fakeClient();
  await runSync({ db, client, leagueKey: LEAGUE, now: NOW });
  assert.deepEqual(client.dates(), ["2026-10-22", "2026-10-23"]);
});

test("a lost Yahoo connection ends the run asking to reconnect", async () => {
  const db = fresh();
  const r = await runSync({ db, client: fakeClient({ reconnect: true }), leagueKey: LEAGUE, now: NOW });
  assert.deepEqual(r, { datesSynced: 0, status: "error", error: "Reconnect Yahoo" });
});

test("before the season starts there are no dates to sync", async () => {
  const db = fresh();
  const client = fakeClient();
  const r = await runSync({ db, client, leagueKey: LEAGUE, now: new Date("2026-10-16T15:00:00Z") });
  assert.deepEqual(r, { datesSynced: 0, status: "ok" });
});

test("maxDates limits one run", async () => {
  const db = fresh();
  const r = await runSync({ db, client: fakeClient(), leagueKey: LEAGUE, now: NOW, maxDates: 2 });
  assert.equal(r.datesSynced, 2);
  assert.equal(getSyncState(db).lastDate, "2026-10-21");
});

test("a second start while a sync runs does not start another", async () => {
  const db = fresh();
  let release!: () => void;
  const client = fakeClient({ gate: new Promise<void>((r) => (release = r)) });
  const worker = createWorker(() => ({ db, client, leagueKey: LEAGUE, now: NOW }));
  assert.deepEqual(worker.startSync(), { started: true, running: true });
  assert.deepEqual(worker.startSync(), { started: false, running: true });
  release();
  await worker.current();
  assert.deepEqual(client.dates(), ["2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23"]);
  assert.equal(worker.startSync().started, true);
  await worker.current();
});

test("catch-up starts only when behind and no sync failed in the last 15 minutes", async () => {
  const db = fresh();
  const worker = createWorker(() => ({ db, client: fakeClient({ failDate: "2026-10-20" }), leagueKey: LEAGUE, now: NOW }));
  assert.equal(worker.maybeCatchUp(), true);
  await worker.current();
  assert.equal(worker.maybeCatchUp(), false, "just failed");
  db.prepare("UPDATE sync_runs SET started_at = started_at - 16 * 60000").run();
  const ok = createWorker(() => ({ db, client: fakeClient(), leagueKey: LEAGUE, now: NOW }));
  assert.equal(ok.maybeCatchUp(), true);
  await ok.current();
  assert.equal(ok.maybeCatchUp(), false, "up to date");
});

test("catch-up does nothing before the season starts or after it ends", async () => {
  const db = fresh();
  const pre = createWorker(() => ({ db, client: fakeClient(), leagueKey: LEAGUE, now: new Date("2026-10-16T15:00:00Z") }));
  assert.equal(pre.maybeCatchUp(), true, "first run fetches the league settings");
  await pre.current();
  assert.equal(pre.maybeCatchUp(), false, "season hasn't started");
  const post = createWorker(() => ({ db, client: fakeClient(), leagueKey: LEAGUE, now: new Date("2027-05-01T15:00:00Z") }));
  assert.equal(post.maybeCatchUp(), true, "behind: the season has dates to sync");
  await post.current();
  assert.equal(getSyncState(db).lastDate, "2027-04-12");
  assert.equal(post.maybeCatchUp(), false, "season is over and fully synced");
});

test("a run stops writing once the admin switches leagues", async () => {
  const db = fresh();
  db.prepare("INSERT INTO league_settings (id, league_key) VALUES (1, ?)").run(LEAGUE);
  const client = fakeClient();
  const get = client.get;
  client.get = async (p: string) => {
    if (p.includes("date=2026-10-21")) pickLeague(db, "466.l.2002");
    return get(p);
  };
  const r = await runSync({ db, client, leagueKey: LEAGUE, now: NOW });
  assert.equal(r.status, "error");
  assert.match(r.error!, /league changed/i);
  assert.equal(getPickedLeagueKey(db), "466.l.2002");
  assert.equal(getSyncState(db).lastDate, null);
  assert.equal(getLeague(db), null);
});

test("catch-up does nothing without a league or a working connection", () => {
  const db = fresh();
  assert.equal(createWorker(() => ({ db, client: fakeClient(), leagueKey: null, now: NOW })).maybeCatchUp(), false);
  db.prepare("UPDATE yahoo_auth SET status = 'needs_reconnect'").run();
  assert.equal(createWorker(() => ({ db, client: fakeClient(), leagueKey: LEAGUE, now: NOW })).maybeCatchUp(), false);
});

test("the sync endpoint needs the right bearer token", () => {
  const start = () => ({ started: true, running: true });
  assert.equal(syncRequest("Bearer nope", "secret", start).status, 401);
  assert.equal(syncRequest(null, "secret", start).status, 401);
  assert.equal(syncRequest("Bearer secret", "", start).status, 503);
  const ok = syncRequest("Bearer secret", "secret", start);
  assert.equal(ok.status, 202);
  assert.deepEqual(ok.body, { started: true, running: true });
});
