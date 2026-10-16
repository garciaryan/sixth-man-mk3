// Whether the admin has finished setup: a Yahoo connection and a league. Server-side only.
import type { DatabaseSync } from "node:sqlite";
import { getPickedLeagueKey } from "./store.ts";

/** LEAGUE_KEY from the environment wins over the league picked on /settings. */
export function leagueKeyFor(db: DatabaseSync, envLeagueKey: string | null): string | null {
  return envLeagueKey ?? getPickedLeagueKey(db);
}

export function isSetupDone(db: DatabaseSync, envLeagueKey: string | null): boolean {
  const connected = db.prepare("SELECT 1 FROM yahoo_auth WHERE id = 1").get() !== undefined;
  return connected && leagueKeyFor(db, envLeagueKey) !== null;
}
