import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { migrate, migrations } from "../lib/migrations.ts";
import { pickLeague } from "../lib/store.ts";
import { isSetupDone, leagueKeyFor } from "../lib/setup.ts";

function fresh() {
  const db = new DatabaseSync(":memory:");
  migrate(db, migrations);
  return db;
}
const connect = (db: DatabaseSync) =>
  db.prepare("INSERT INTO yahoo_auth (id, guid, access_token, refresh_token, expires_at) VALUES (1, 'G', 'a', 'r', 0)").run();

test("setup needs a Yahoo connection and a league", () => {
  const db = fresh();
  assert.equal(isSetupDone(db, null), false);
  connect(db);
  assert.equal(isSetupDone(db, null), false);
  assert.equal(isSetupDone(db, "466.l.1"), true);
  pickLeague(db, "466.l.2");
  assert.equal(isSetupDone(db, null), true);
});

test("the env league key wins over the picked one", () => {
  const db = fresh();
  pickLeague(db, "466.l.2");
  assert.equal(leagueKeyFor(db, "466.l.1"), "466.l.1");
  assert.equal(leagueKeyFor(db, null), "466.l.2");
});
