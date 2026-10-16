import { test } from "node:test";
import assert from "node:assert/strict";
import { gameLogRows } from "../lib/view/players.ts";
import { fantasyPoints } from "../lib/scoring.ts";

test("game log is newest first with each game's fantasy points", () => {
  const mods = { "12": 1, "19": -1 };
  const games = [{ date: "2026-10-21", stats: { "12": 20, "19": 2 } }, { date: "2026-10-23", stats: { "12": 31, "19": 5 } }];
  const rows = gameLogRows(games, mods);
  assert.deepEqual(rows.map((r) => r.date), ["2026-10-23", "2026-10-21"]);
  assert.deepEqual(rows.map((r) => r.fpts), [26, 18]);
  assert.equal(rows[0].fpts, fantasyPoints(games[1].stats, mods));
});
