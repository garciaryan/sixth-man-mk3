import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { migrate, migrations } from "../lib/migrations.ts";

test("migrating twice leaves the schema at the latest version", () => {
  const db = new DatabaseSync(":memory:");
  assert.equal(migrate(db, migrations), migrations.length);
  assert.equal(migrate(db, migrations), migrations.length);
  const tables = (db.prepare("select name from sqlite_master where type = 'table' order by name").all() as { name: string }[]).map((r) => r.name);
  for (const t of ["game_stats", "league_settings", "players", "sync_runs", "sync_state", "teams", "users", "yahoo_auth"]) {
    assert.ok(tables.includes(t), `missing table ${t}`);
  }
});
