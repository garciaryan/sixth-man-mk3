// Admin actions behind /settings. Server-side only.
import type { DatabaseSync } from "node:sqlite";
import { pickLeague } from "./store.ts";
import { getUserLeagues } from "./yahoo/api.ts";
import type { YahooClient } from "./yahoo/client.ts";

/** Saves the league everyone compares in. Only one of the admin's own NBA leagues is accepted. */
export async function chooseLeague(
  deps: { db: DatabaseSync; client: Pick<YahooClient, "get">; envLeagueKey: string | null; start: () => void },
  leagueKey: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (deps.envLeagueKey) return { ok: false, error: "LEAGUE_KEY is set in the environment." };
  const mine = await getUserLeagues(deps.client);
  if (!mine.some((l) => l.leagueKey === leagueKey)) return { ok: false, error: "That isn't one of your NBA leagues." };
  pickLeague(deps.db, leagueKey);
  deps.start();
  return { ok: true };
}
