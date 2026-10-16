// Loads what the pages need from SQLite. Server-side only.
import { getDb } from "../db.ts";
import { getLeague, getPlayers, getTeams, getUser } from "../store.ts";
import { currentGuid } from "../server.ts";

export async function loadLeagueContext() {
  const db = getDb();
  const league = getLeague(db);
  const guid = await currentGuid();
  const me = guid ? getUser(db, guid) : null;
  return { db, league, players: getPlayers(db), teams: getTeams(db), myTeamKey: me?.teamKey ?? null };
}

/** The league's scoring categories (those with a point value), in the league's order. */
export function scoringCategories(league: { categories: { statId: string; display: string; name: string }[]; modifiers: Record<string, number> }) {
  return league.categories.filter((c) => league.modifiers[c.statId] !== undefined);
}
