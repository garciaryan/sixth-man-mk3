import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseUserLeagues, parseUserTeams, parseSettings, parseTeams, parsePlayers, parsePlayerStats, parseDateStats, parsePlayerPoints,
} from "../lib/yahoo/parse.ts";
import { fantasyPoints } from "../lib/scoring.ts";
import { fixture } from "./helpers/fixtures.ts";

test("user leagues", () => {
  const ls = parseUserLeagues(fixture("user-leagues"));
  assert.equal(ls.length, 2);
  assert.deepEqual(ls[0], { leagueKey: "466.l.1001", name: "Hoops League", season: "2026", scoringType: "point" });
});

test("user teams", () => {
  assert.deepEqual(parseUserTeams(fixture("user-teams")), [
    { teamKey: "466.l.1001.t.3", name: "Garcia Guards" },
    { teamKey: "466.l.2002.t.7", name: "Elsewhere" },
  ]);
});

test("league settings: categories and modifiers", () => {
  const s = parseSettings(fixture("league-settings"));
  assert.equal(s.leagueKey, "466.l.1001");
  assert.equal(s.name, "Hoops League");
  assert.equal(s.startDate, "2026-10-20");
  assert.equal(s.endDate, "2027-04-12");
  assert.equal(s.categories.length, 7);
  assert.deepEqual(s.categories[0], { statId: "9004003", name: "Field Goals Made / Field Goals Attempted", display: "FGM/A", displayOnly: true });
  assert.deepEqual(s.categories[1], { statId: "12", name: "Points Scored", display: "PTS", displayOnly: false });
  assert.deepEqual(s.modifiers, { "12": 1, "15": 1.2, "16": 1.5, "17": 3, "18": 3, "19": -1 });
});

test("teams with their managers", () => {
  const ts = parseTeams(fixture("league-teams"));
  assert.deepEqual(ts, [
    { teamKey: "466.l.1001.t.3", name: "Garcia Guards", managerGuids: ["ADMINGUID"] },
    { teamKey: "466.l.1001.t.4", name: "Paint Patrol", managerGuids: ["MEMBERGUID", "COGUID"] },
  ]);
});

test("players with positions, injury and owner", () => {
  const ps = parsePlayers(fixture("league-players"));
  assert.equal(ps.length, 2);
  assert.deepEqual(ps[0], {
    playerKey: "466.p.6583", name: "Luka Doncic", nbaTeam: "LAL", positions: ["PG", "SG", "G"], injuryStatus: null,
    ownerTeamKey: "466.l.1001.t.3",
  });
  assert.equal(ps[1].injuryStatus, "GTD");
  assert.equal(ps[1].ownerTeamKey, null);
  assert.deepEqual(ps[1].positions, ["C"]);
});

test("date stats: '-' and '' become 0, fractions are skipped", () => {
  const rows = parsePlayerStats(fixture("player-stats-date"));
  assert.deepEqual(rows[0], { playerKey: "466.p.6583", stats: { "12": 34, "15": 9, "16": 11, "17": 0, "18": 1, "19": 4 } });
  assert.deepEqual(rows[1].stats, { "12": 0, "15": 0, "16": 0, "17": 0, "18": 0, "19": 0 });
  for (const r of rows) for (const v of Object.values(r.stats)) assert.ok(Number.isFinite(v));
});

test("date stats drop players who did not play", () => {
  const rows = parseDateStats(fixture("player-stats-date"));
  assert.deepEqual(rows.map((r) => r.playerKey), ["466.p.6583"]);
});

test("cross-check: our points match Yahoo's for the league's scoring", (t) => {
  const pts = fixture("player-points-season");
  if (pts._handmade) t.diagnostic("hand-made fixture; capture real ones with npm run capture");
  const mods = parseSettings(fixture("league-settings")).modifiers;
  const yahoo = parsePlayerPoints(pts);
  const ours = parsePlayerStats(pts);
  assert.ok(ours.length > 0);
  for (const r of ours) {
    assert.ok(Math.abs(fantasyPoints(r.stats, mods) - yahoo[r.playerKey]) < 0.01, r.playerKey);
  }
});
