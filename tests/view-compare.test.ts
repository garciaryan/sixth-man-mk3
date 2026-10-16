import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCompareKeys, buildCompare } from "../lib/view/compare.ts";
import type { GameRow } from "../lib/scoring.ts";
import type { Player } from "../lib/yahoo/parse.ts";

test("compare keys: 2 to 4 distinct players", () => {
  assert.deepEqual(parseCompareKeys("a,a"), { error: "too_few" });
  assert.deepEqual(parseCompareKeys(null), { error: "too_few" });
  assert.deepEqual(parseCompareKeys(""), { error: "too_few" });
  assert.deepEqual(parseCompareKeys("a,b,c,d,e"), { error: "too_many" });
  assert.deepEqual(parseCompareKeys(" a, b ,a,"), { keys: ["a", "b"] });
});

const NOW = new Date("2026-11-05T15:00:00Z"); // yesterday 2026-11-04
const P = (key: string): Player => ({ playerKey: key, name: key.toUpperCase(), nbaTeam: "X", positions: ["C"], injuryStatus: null, ownerTeamKey: null });
const g = (date: string, pts: number, to: number): GameRow => ({ date, stats: { "12": pts, "19": to } });
const games = new Map<string, GameRow[]>([
  ["a", [g("2026-10-21", 30, 5), g("2026-11-03", 20, 4)]],
  ["b", [g("2026-10-22", 10, 1), g("2026-11-02", 12, 2)]],
  ["c", [g("2026-10-22", 50, 0)]], // no games in the last 7 days
]);
const input = {
  players: [P("a"), P("b"), P("c")], games, modifiers: { "12": 1, "19": -1 }, now: NOW, seasonStart: "2026-10-20",
  categories: [{ statId: "12", name: "Points", display: "PTS", displayOnly: false }, { statId: "19", name: "Turnovers", display: "TO", displayOnly: false }],
};
const row = (c: ReturnType<typeof buildCompare>, label: string) => c.rows.find((r) => r.label === label)!;

test("unknown keys are reported and left out", () => {
  const c = buildCompare(input, ["a", "zzz", "b"], "season");
  assert.deepEqual(c.columns.map((p) => p.playerKey), ["a", "b"]);
  assert.deepEqual(c.unknown, ["zzz"]);
});

test("FP/G for every window, best highest", () => {
  const c = buildCompare(input, ["a", "b", "c"], "season");
  assert.deepEqual(row(c, "Season").values, [20.5, 9.5, 50]);
  assert.equal(row(c, "Season").best, 2);
  assert.deepEqual(row(c, "Last 7").values, [16, 10, null]);
  assert.equal(row(c, "Last 7").best, 0);
});

test("turnovers: lowest per game is best", () => {
  const c = buildCompare(input, ["a", "b"], "season");
  assert.deepEqual(row(c, "TO").values, [4.5, 1.5]);
  assert.equal(row(c, "TO").best, 1);
});

test("a window with no games is null and never best", () => {
  const c = buildCompare(input, ["a", "c"], "l7");
  assert.deepEqual(row(c, "PTS").values, [20, null]);
  assert.equal(row(c, "PTS").best, 0);
  assert.deepEqual(row(c, "TO").values, [4, null]);
  assert.equal(row(c, "TO").best, 0);
});

test("contribution rows are per-game value times the modifier", () => {
  const c = buildCompare(input, ["a", "b"], "season");
  assert.deepEqual(row(c, "TO points").values, [-4.5, -1.5]);
  assert.equal(row(c, "TO points").best, 1);
});

test("sparkline holds the last 15 games' points, oldest first", () => {
  const many = new Map([["a", Array.from({ length: 20 }, (_, i) => g(`2026-10-${String(i + 1).padStart(2, "0")}`, i, 0))], ["b", []]]);
  const c = buildCompare({ ...input, games: many, seasonStart: "2026-10-01" }, ["a", "b"], "season");
  assert.deepEqual(c.spark[0], [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
  assert.deepEqual(c.spark[1], []);
});
