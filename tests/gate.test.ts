import { test } from "node:test";
import assert from "node:assert/strict";
import { gate } from "../lib/gate.ts";

const ctx = { adminGuid: "ADMIN", setupDone: true };
const member = { guid: "MEMBER" };
const admin = { guid: "ADMIN" };

test("public paths pass without a session", () => {
  for (const path of ["/login", "/denied", "/api/auth/start", "/api/auth/callback", "/api/health", "/api/sync"]) {
    assert.deepEqual(gate({ path, session: null }, ctx), { kind: "pass" }, path);
  }
});

test("pages without a session go to login with next", () => {
  assert.deepEqual(gate({ path: "/players", session: null }, ctx), { kind: "redirect", location: "/login?next=%2Fplayers" });
  assert.deepEqual(gate({ path: "/compare", search: "?p=a,b", session: null }, ctx), { kind: "redirect", location: "/login?next=%2Fcompare%3Fp%3Da%2Cb" });
});

test("APIs without a session get 401", () => {
  const r = gate({ path: "/api/anything", session: null }, ctx);
  assert.equal(r.kind, "json");
  assert.equal(r.kind === "json" && r.status, 401);
});

test("members pass on member pages", () => {
  assert.deepEqual(gate({ path: "/players", session: member }, ctx), { kind: "pass" });
  assert.deepEqual(gate({ path: "/compare", session: member }, ctx), { kind: "pass" });
});

test("admin-only paths turn members away", () => {
  assert.deepEqual(gate({ path: "/settings", session: member }, ctx), { kind: "redirect", location: "/players" });
  const r = gate({ path: "/api/admin/sync", session: member }, ctx);
  assert.equal(r.kind === "json" && r.status, 403);
  assert.deepEqual(gate({ path: "/settings", session: admin }, ctx), { kind: "pass" });
  assert.deepEqual(gate({ path: "/api/admin/sync", session: admin }, ctx), { kind: "pass" });
});

test("before setup, the admin goes to settings and members are told to wait", () => {
  const notSetUp = { ...ctx, setupDone: false };
  assert.deepEqual(gate({ path: "/players", session: admin }, notSetUp), { kind: "redirect", location: "/settings" });
  assert.deepEqual(gate({ path: "/settings", session: admin }, notSetUp), { kind: "pass" });
  assert.deepEqual(gate({ path: "/api/admin/league", session: admin }, notSetUp), { kind: "pass" });
  assert.deepEqual(gate({ path: "/players", session: member }, notSetUp), { kind: "redirect", location: "/denied?reason=setup" });
});
