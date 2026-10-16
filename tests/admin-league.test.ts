import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { migrate, migrations } from "../lib/migrations.ts";
import { getPickedLeagueKey } from "../lib/store.ts";
import { chooseLeague } from "../lib/admin.ts";
import { fixture } from "./helpers/fixtures.ts";

function setup(envLeagueKey: string | null = null, running = false) {
  const db = new DatabaseSync(":memory:");
  migrate(db, migrations);
  let started = 0;
  const deps = { db, client: { get: async () => fixture("user-leagues") }, envLeagueKey, isRunning: () => running, start: () => { started++; } };
  return { db, deps, started: () => started };
}

test("a league the admin isn't in is refused", async () => {
  const t = setup();
  assert.deepEqual(await chooseLeague(t.deps, "466.l.9999"), { ok: false, error: "That isn't one of your NBA leagues." });
  assert.equal(getPickedLeagueKey(t.db), null);
  assert.equal(t.started(), 0);
});

test("one of the admin's leagues is saved and a sync starts", async () => {
  const t = setup();
  assert.deepEqual(await chooseLeague(t.deps, "466.l.1001"), { ok: true });
  assert.equal(getPickedLeagueKey(t.db), "466.l.1001");
  assert.equal(t.started(), 1);
});

test("LEAGUE_KEY in the environment can't be overridden", async () => {
  const t = setup("466.l.1001");
  assert.deepEqual(await chooseLeague(t.deps, "466.l.2002"), { ok: false, error: "LEAGUE_KEY is set in the environment." });
});

test("leagues can't be switched while a sync runs", async () => {
  const t = setup(null, true);
  assert.deepEqual(await chooseLeague(t.deps, "466.l.1001"), { ok: false, error: "A sync is running. Try again when it finishes." });
  assert.equal(getPickedLeagueKey(t.db), null);
});
