import { test } from "node:test";
import assert from "node:assert/strict";
import { fantasyPoints, aggregate, bestIndex } from "../lib/scoring.ts";

const mods = { "12": 1, "15": 1.2, "16": 1.5, "19": -1 }; // PTS, REB, AST, TO

test("fantasyPoints applies modifiers and ignores stats without one", () => {
  assert.equal(fantasyPoints({ "12": 20, "15": 10, "16": 5, "19": 3, "99": 7 }, mods), 36.5);
});

test("aggregate sums games inside the range", () => {
  const games = [
    { date: "2026-11-01", stats: { "12": 20, "15": 10, "16": 5, "19": 3 } },
    { date: "2026-11-03", stats: { "12": 10, "15": 0, "16": 0, "19": 1 } },
    { date: "2026-10-01", stats: { "12": 50 } }, // outside range
  ];
  const a = aggregate(games, { from: "2026-10-29", to: "2026-11-04" }, mods);
  assert.equal(a.gp, 2);
  assert.equal(a.fpts, 45.5);
  assert.equal(a.fptsPerGame, 22.75);
  assert.equal(a.perGame["12"], 15);
  assert.equal(a.totals["12"], 30);
});

test("aggregate with no games has null per-game points", () => {
  const a = aggregate([], { from: "2026-10-29", to: "2026-11-04" }, mods);
  assert.equal(a.gp, 0);
  assert.equal(a.fptsPerGame, null);
  assert.deepEqual(a.perGame, {});
});

test("bestIndex picks highest, or lowest when lower is better", () => {
  assert.equal(bestIndex([3, 1, 2], false), 0);
  assert.equal(bestIndex([3, 1, 2], true), 1);
  assert.equal(bestIndex([null, 1, null], true), 1);
  assert.equal(bestIndex([null, null], false), null);
});
