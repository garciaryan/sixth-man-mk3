import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { migrate, migrations } from "../lib/migrations.ts";
import {
  saveGameDay, getGames, getSyncState, saveLeague, getLeague, savePlayers, getPlayers, saveTeams, getTeams, upsertUser, getUser,
} from "../lib/store.ts";

function fresh() {
  const db = new DatabaseSync(":memory:");
  migrate(db, migrations);
  return db;
}

test("game days round-trip and set the sync state", () => {
  const db = fresh();
  saveGameDay(db, "2026-10-21", [{ playerKey: "p.1", stats: { "12": 20, "15": 5 } }, { playerKey: "p.2", stats: { "12": 8 } }]);
  saveGameDay(db, "2026-10-22", [{ playerKey: "p.1", stats: { "12": 30 } }]);
  const games = getGames(db, ["p.1"], "2026-10-01", "2026-10-31");
  assert.deepEqual(games.get("p.1"), [
    { date: "2026-10-21", stats: { "12": 20, "15": 5 } },
    { date: "2026-10-22", stats: { "12": 30 } },
  ]);
  assert.equal(games.has("p.2"), false);
  assert.equal(getGames(db, null, "2026-10-21", "2026-10-21").size, 2);
  assert.equal(getSyncState(db).lastDate, "2026-10-22");
});

test("saving a date twice replaces it", () => {
  const db = fresh();
  saveGameDay(db, "2026-10-21", [{ playerKey: "p.1", stats: { "12": 20 } }]);
  saveGameDay(db, "2026-10-21", [{ playerKey: "p.1", stats: { "12": 21 } }]);
  assert.deepEqual(getGames(db, null, "2026-10-21", "2026-10-21").get("p.1"), [{ date: "2026-10-21", stats: { "12": 21 } }]);
});

test("an empty game day still advances the sync state", () => {
  const db = fresh();
  assert.equal(getSyncState(db).lastDate, null);
  saveGameDay(db, "2026-10-21", []);
  assert.equal(getSyncState(db).lastDate, "2026-10-21");
});

test("league, teams, players and users round-trip", () => {
  const db = fresh();
  const league = {
    leagueKey: "466.l.1", name: "Hoops", season: "2026", startDate: "2026-10-20", endDate: "2027-04-12",
    categories: [{ statId: "12", name: "Points Scored", display: "PTS", displayOnly: false }], modifiers: { "12": 1 },
  };
  saveLeague(db, league);
  assert.deepEqual(getLeague(db), league);
  saveTeams(db, [{ teamKey: "466.l.1.t.1", name: "Team A", managerGuids: ["G1"] }]);
  assert.deepEqual(getTeams(db), [{ teamKey: "466.l.1.t.1", name: "Team A", managerGuids: ["G1"] }]);
  const p = { playerKey: "466.p.1", name: "A B", nbaTeam: "LAL", positions: ["PG", "G"], injuryStatus: null, ownerTeamKey: null };
  savePlayers(db, [p]);
  savePlayers(db, [{ ...p, ownerTeamKey: "466.l.1.t.1" }]);
  assert.deepEqual(getPlayers(db), [{ ...p, ownerTeamKey: "466.l.1.t.1" }]);
  upsertUser(db, { guid: "G1", name: "Ryan", teamKey: "466.l.1.t.1", checkedAt: 5 });
  assert.deepEqual(getUser(db, "G1"), { guid: "G1", name: "Ryan", teamKey: "466.l.1.t.1", checkedAt: 5 });
  assert.equal(getUser(db, "nope"), null);
});
