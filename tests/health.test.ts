import { test } from "node:test";
import assert from "node:assert/strict";
import { GET } from "../app/api/health/route.ts";

test("health returns ok", async () => {
  const res = await GET();
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
});
