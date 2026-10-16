import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePlayersQuery, buildRows, type PlayersQuery } from "../lib/view/players.ts";
import type { GameRow } from "../lib/scoring.ts";
import type { Player } from "../lib/yahoo/parse.ts";

const range = { from: "2026-10-20", to: "2026-10-31" };
const mods = { "12": 1, "15": 1.2 };
const P = (key: string, name: string, positions: string[], owner: string | null): Player =>
  ({ playerKey: key, name, nbaTeam: "LAL", positions, injuryStatus: null, ownerTeamKey: owner });
const players = [
  P("a", "Alpha Guard", ["PG", "SG", "G"], "t.1"),
  P("b", "Bravo Big", ["C"], null),
  P("c", "Charlie Wing", ["SF", "F"], "t.2"),
  P("d", "Delta Bench", ["PF", "F"], null),
];
const g = (date: string, pts: number): GameRow => ({ date, stats: { "12": pts } });
const games = new Map<string, GameRow[]>([
  ["a", [g("2026-10-21", 20), g("2026-10-23", 30)]],             // 25 FP/G, 2 GP
  ["b", [g("2026-10-21", 40), g("2026-10-22", 20), g("2026-10-24", 30)]], // 30 FP/G, 3 GP
  ["c", [g("2026-10-22", 10)]],                                  // 10 FP/G, 1 GP
]);                                                               // d: 0 GP
const teams = [{ teamKey: "t.1", name: "Garcia Guards", managerGuids: [] }, { teamKey: "t.2", name: "Paint Patrol", managerGuids: [] }];
const input = { players, games, modifiers: mods, teams, myTeamKey: "t.1", range };
const q = (over: Partial<PlayersQuery> = {}) => ({ ...parsePlayersQuery(new URLSearchParams()), ...over });

test("query defaults and bad values fall back", () => {
  assert.deepEqual(parsePlayersQuery(new URLSearchParams()), { window: "season", owner: "all", pos: null, minGp: 1, q: "", sort: "fptsPerGame", dir: "desc" });
  const bad = parsePlayersQuery(new URLSearchParams("window=bogus&minGp=-3&dir=sideways&sort=evil&pos=QB"));
  assert.equal(bad.window, "season");
  assert.equal(bad.minGp, 1);
  assert.equal(bad.dir, "desc");
  assert.equal(bad.sort, "fptsPerGame");
  assert.equal(bad.pos, null);
  assert.equal(parsePlayersQuery(new URLSearchParams("sort=stat:15&dir=asc&window=l7&minGp=3")).sort, "stat:15");
});

test("default ranking is FP/G descending with ranks 1..n", () => {
  const rows = buildRows(input, q());
  assert.deepEqual(rows.map((r) => [r.rank, r.playerKey]), [[1, "b"], [2, "a"], [3, "c"]]);
  assert.equal(rows[0].ownerName, "Free agent");
  assert.equal(rows[1].ownerName, "Garcia Guards");
});

test("players with no games sort last in both directions", () => {
  assert.equal(buildRows(input, q({ minGp: 0 })).at(-1)!.playerKey, "d");
  assert.equal(buildRows(input, q({ minGp: 0, dir: "asc" })).at(-1)!.playerKey, "d");
  assert.equal(buildRows(input, q({ minGp: 0 })).at(-1)!.agg.fptsPerGame, null);
});

test("ownership filters", () => {
  assert.deepEqual(buildRows(input, q({ owner: "fa", minGp: 0 })).map((r) => r.playerKey), ["b", "d"]);
  assert.deepEqual(buildRows(input, q({ owner: "mine" })).map((r) => r.playerKey), ["a"]);
  assert.deepEqual(buildRows(input, q({ owner: "t.2" })).map((r) => r.playerKey), ["c"]);
  assert.deepEqual(buildRows({ ...input, myTeamKey: null }, q({ owner: "mine" })), []);
});

test("position, search and minimum games", () => {
  assert.deepEqual(buildRows(input, q({ pos: "G" })).map((r) => r.playerKey), ["a"]);
  assert.deepEqual(buildRows(input, q({ pos: "F", minGp: 0 })).map((r) => r.playerKey), ["c", "d"]);
  assert.deepEqual(buildRows(input, q({ q: "bRaVo" })).map((r) => r.playerKey), ["b"]);
  assert.deepEqual(buildRows(input, q({ minGp: 3 })).map((r) => r.playerKey), ["b"]);
});

test("sorting by name, games and a stat", () => {
  assert.deepEqual(buildRows(input, q({ sort: "name", dir: "asc" })).map((r) => r.playerKey), ["a", "b", "c"]);
  assert.deepEqual(buildRows(input, q({ sort: "gp" })).map((r) => r.playerKey), ["b", "a", "c"]);
  assert.deepEqual(buildRows(input, q({ sort: "stat:12", dir: "asc" })).map((r) => r.playerKey), ["c", "a", "b"]);
});
