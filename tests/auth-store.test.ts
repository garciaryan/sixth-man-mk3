import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { migrate, migrations } from "../lib/migrations.ts";
import { saveService, getService, markNeedsReconnect } from "../lib/yahoo/auth-store.ts";

test("service tokens round-trip and can be marked for reconnect", () => {
  const db = new DatabaseSync(":memory:");
  migrate(db, migrations);
  assert.equal(getService(db), null);
  saveService(db, "G", { accessToken: "A", refreshToken: "R", expiresAt: 9 });
  assert.deepEqual(getService(db), { guid: "G", accessToken: "A", refreshToken: "R", expiresAt: 9, status: "ok" });
  markNeedsReconnect(db);
  assert.equal(getService(db)?.status, "needs_reconnect");
  saveService(db, "G", { accessToken: "A2", refreshToken: "R2", expiresAt: 10 });
  assert.equal(getService(db)?.status, "ok");
});
