import { test } from "node:test";
import assert from "node:assert/strict";
import { yesterday, windowRange } from "../lib/dates.ts";

test("yesterday uses New York time, not UTC", () => {
  assert.equal(yesterday(new Date("2026-11-05T02:00:00Z")), "2026-11-03"); // 21:00 Nov 4 in New York
  assert.equal(yesterday(new Date("2026-11-05T15:00:00Z")), "2026-11-04");
});

test("windows end yesterday and start N-1 days earlier", () => {
  const now = new Date("2026-11-05T15:00:00Z");
  assert.deepEqual(windowRange("l7", now, "2026-10-20"), { from: "2026-10-29", to: "2026-11-04" });
  assert.deepEqual(windowRange("l14", now, "2026-10-20"), { from: "2026-10-22", to: "2026-11-04" });
  assert.deepEqual(windowRange("season", now, "2026-10-20"), { from: "2026-10-20", to: "2026-11-04" });
});

test("windows never start before the season", () => {
  assert.deepEqual(windowRange("l30", new Date("2026-11-05T15:00:00Z"), "2026-10-20"), { from: "2026-10-20", to: "2026-11-04" });
});
