import { test } from "node:test";
import assert from "node:assert/strict";
import { signSession, readSession, SESSION_MAX_AGE_S } from "../lib/session.ts";

const secret = "s".repeat(32);

test("a signed session reads back its guid", async () => {
  const v = await signSession("ABC123", secret, 1000);
  assert.deepEqual(await readSession(v, secret, 2000), { guid: "ABC123" });
});

test("a tampered session is rejected", async () => {
  const v = await signSession("ABC123", secret, 1000);
  const [, exp, sig] = v.split(".");
  const forged = `${Buffer.from("OTHER").toString("base64url")}.${exp}.${sig}`;
  assert.equal(await readSession(forged, secret, 2000), null);
  assert.equal(await readSession(v, "x".repeat(32), 2000), null);
  assert.equal(await readSession(undefined, secret, 2000), null);
  assert.equal(await readSession("garbage", secret, 2000), null);
});

test("a session expires after 30 days", async () => {
  const v = await signSession("ABC123", secret, 0);
  assert.equal(SESSION_MAX_AGE_S, 30 * 24 * 3600);
  assert.equal(await readSession(v, secret, SESSION_MAX_AGE_S * 1000 - 1) !== null, true);
  assert.equal(await readSession(v, secret, SESSION_MAX_AGE_S * 1000), null);
});
