import { test } from "node:test";
import assert from "node:assert/strict";
import { getAllPlayers, getDateStats, getUserLeagues, getUserTeams, getSettings, getTeams } from "../lib/yahoo/api.ts";
import { fixture } from "./helpers/fixtures.ts";

function playersPage(n: number, offset: number, owned: boolean) {
  const players: Record<string, unknown> = { count: n };
  for (let i = 0; i < n; i++) {
    players[i] = { player: [[{ player_key: `466.p.${offset + i}` }, { name: { full: `P${offset + i}` } }, { editorial_team_abbr: "X" },
      { eligible_positions: [{ position: "C" }] }], { ownership: owned ? { ownership_type: "team", owner_team_key: "t.1" } : { ownership_type: "freeagents" } }] };
  }
  return { fantasy_content: { league: [{}, { players }] } };
}

function stub(answer: (path: string) => unknown) {
  const paths: string[] = [];
  return { paths, client: { get: async (p: string) => { paths.push(p); return answer(p); } } };
}

test("getAllPlayers pages taken and available players until a short page", async () => {
  const s = stub((p) => {
    const start = Number(/start=(\d+)/.exec(p)![1]);
    if (p.includes("status=T")) return playersPage(start === 0 ? 25 : 10, 1000 + start, true);
    return playersPage(start < 50 ? 25 : 3, start, false);
  });
  const ps = await getAllPlayers(s.client, "466.l.1");
  assert.equal(ps.length, 35 + 53);
  assert.equal(s.paths.length, 2 + 3);
  assert.equal(s.paths[0], "/league/466.l.1/players;status=T;start=0;count=25;out=ownership");
});

test("getAllPlayers stops on an empty page", async () => {
  const s = stub((p) => (p.includes("start=0") ? playersPage(25, 0, false) : { fantasy_content: { league: [{}, { players: [] }] } }));
  const ps = await getAllPlayers(s.client, "466.l.1");
  assert.equal(ps.length, 25); // same keys in both statuses, de-duplicated
  assert.equal(s.paths.length, 4);
});

test("getDateStats batches 25 player keys per request", async () => {
  const s = stub(() => fixture("player-stats-date"));
  const keys = Array.from({ length: 60 }, (_, i) => `466.p.${i}`);
  await getDateStats(s.client, "466.l.1", keys, "2026-10-21");
  assert.equal(s.paths.length, 3);
  assert.equal(s.paths[0], `/league/466.l.1/players;player_keys=${keys.slice(0, 25).join(",")}/stats;type=date;date=2026-10-21`);
});

test("the simple calls hit the documented paths", async () => {
  const s = stub((p) =>
    p.includes("teams") && p.startsWith("/users") ? fixture("user-teams")
    : p.startsWith("/users") ? fixture("user-leagues")
    : p.endsWith("/settings") ? fixture("league-settings")
    : fixture("league-teams"));
  await getUserLeagues(s.client);
  await getUserTeams(s.client);
  await getSettings(s.client, "466.l.1");
  await getTeams(s.client, "466.l.1");
  assert.deepEqual(s.paths, [
    "/users;use_login=1/games;game_codes=nba/leagues",
    "/users;use_login=1/games;game_codes=nba/teams",
    "/league/466.l.1/settings",
    "/league/466.l.1/teams",
  ]);
});
