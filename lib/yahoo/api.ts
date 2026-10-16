// Typed Yahoo Fantasy API calls on top of the throttled client. Server-side only.
import type { YahooClient } from "./client.ts";
import {
  parseDateStats, parsePlayers, parseSettings, parseTeams, parseUserLeagues, parseUserTeams,
  type LeagueSettings, type Player, type PlayerStatRow, type Team, type UserLeague,
} from "./parse.ts";

export const PAGE = 25;
type Getter = Pick<YahooClient, "get">;
type Json = Record<string, any>;

export async function getUserLeagues(client: Getter): Promise<UserLeague[]> {
  return parseUserLeagues((await client.get("/users;use_login=1/games;game_codes=nba/leagues")) as Json);
}

export async function getUserTeams(client: Getter): Promise<{ teamKey: string; name: string }[]> {
  return parseUserTeams((await client.get("/users;use_login=1/games;game_codes=nba/teams")) as Json);
}

export async function getSettings(client: Getter, leagueKey: string): Promise<LeagueSettings> {
  return parseSettings((await client.get(`/league/${leagueKey}/settings`)) as Json);
}

export async function getTeams(client: Getter, leagueKey: string): Promise<Team[]> {
  return parseTeams((await client.get(`/league/${leagueKey}/teams`)) as Json);
}

/** Every player in the league: taken (T) and available (A = free agents + waivers), 25 per page. */
export async function getAllPlayers(client: Getter, leagueKey: string): Promise<Player[]> {
  const byKey = new Map<string, Player>();
  for (const status of ["T", "A"]) {
    for (let start = 0; ; start += PAGE) {
      const page = parsePlayers((await client.get(`/league/${leagueKey}/players;status=${status};start=${start};count=${PAGE};out=ownership`)) as Json);
      for (const p of page) byKey.set(p.playerKey, p);
      if (page.length < PAGE) break;
    }
  }
  return [...byKey.values()];
}

/** One date's stat lines for the given players (only those who played), 25 players per request. */
export async function getDateStats(client: Getter, leagueKey: string, playerKeys: string[], date: string): Promise<PlayerStatRow[]> {
  const out: PlayerStatRow[] = [];
  for (let i = 0; i < playerKeys.length; i += PAGE) {
    const keys = playerKeys.slice(i, i + PAGE).join(",");
    out.push(...parseDateStats((await client.get(`/league/${leagueKey}/players;player_keys=${keys}/stats;type=date;date=${date}`)) as Json));
  }
  return out;
}
