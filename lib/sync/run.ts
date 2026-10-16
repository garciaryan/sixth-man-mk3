// One sync run: league settings, teams and players, then each missing date's stat lines. Each step commits on its
// own, so a failure keeps everything before it and the next run resumes at the first missing date. Server-side only.
import type { DatabaseSync } from "node:sqlite";
import { addDays, yesterday } from "../dates.ts";
import { getPickedLeagueKey, getSyncState, saveGameDay, saveLeague, savePlayers, saveTeams } from "../store.ts";
import { getAllPlayers, getDateStats, getSettings, getTeams } from "../yahoo/api.ts";
import { NeedsReconnectError, type YahooClient } from "../yahoo/client.ts";

export type SyncDeps = { db: DatabaseSync; client: Pick<YahooClient, "get">; leagueKey: string; now: Date; maxDates?: number };
export type SyncResult = { datesSynced: number; status: "ok" | "error"; error?: string };
// Yesterday and the day before are always fetched again: a sync just after midnight Eastern can catch West Coast
// games still in progress, and Yahoo applies stat corrections the next day. saveGameDay replaces a date, so it's safe.
export const RESYNC_DAYS = 2;

class LeagueChangedError extends Error {
  constructor() {
    super("The league changed during the sync; stopped.");
  }
}

export type SyncRun = { startedAt: number; finishedAt: number | null; status: string; datesSynced: number; error: string | null };

export async function runSync(deps: SyncDeps): Promise<SyncResult> {
  const { db, client, leagueKey, now } = deps;
  const runId = db.prepare("INSERT INTO sync_runs (started_at, status) VALUES (?, 'running')").run(now.getTime()).lastInsertRowid;
  let datesSynced = 0;
  let result: SyncResult;
  // The admin may pick another league mid-run (which clears the tables); never write the old league's data after that.
  const stillOurs = () => {
    const picked = getPickedLeagueKey(db);
    if (picked !== null && picked !== leagueKey) throw new LeagueChangedError();
  };
  try {
    const settings = await getSettings(client, leagueKey);
    stillOurs();
    saveLeague(db, settings, now.getTime());
    const teams = await getTeams(client, leagueKey);
    stillOurs();
    saveTeams(db, teams);
    const players = await getAllPlayers(client, leagueKey);
    stillOurs();
    savePlayers(db, players, now.getTime());

    const last = getSyncState(db).lastDate;
    const end = settings.endDate && settings.endDate < yesterday(now) ? settings.endDate : yesterday(now);
    const keys = players.map((p) => p.playerKey);
    let from = last ? addDays(last, 1) : settings.startDate;
    const resyncFrom = addDays(end, -(RESYNC_DAYS - 1));
    if (last && resyncFrom < from) from = resyncFrom;
    if (from < settings.startDate) from = settings.startDate;
    for (let d = from; d <= end; d = addDays(d, 1)) {
      if (deps.maxDates !== undefined && datesSynced >= deps.maxDates) break;
      const rows = await getDateStats(client, leagueKey, keys, d);
      stillOurs();
      saveGameDay(db, d, rows);
      datesSynced++;
    }
    result = { datesSynced, status: "ok" };
  } catch (e) {
    const error = e instanceof NeedsReconnectError ? "Reconnect Yahoo" : e instanceof Error ? e.message : String(e);
    result = { datesSynced, status: "error", error };
  }
  db.prepare("UPDATE sync_runs SET finished_at = ?, status = ?, dates_synced = ?, error = ? WHERE id = ?")
    .run(Date.now(), result.status, datesSynced, result.error ?? null, runId);
  return result;
}

export function lastRuns(db: DatabaseSync, limit: number): SyncRun[] {
  const rows = db.prepare("SELECT * FROM sync_runs ORDER BY id DESC LIMIT ?").all(limit) as Record<string, string | number | null>[];
  return rows.map((r) => ({
    startedAt: r.started_at as number, finishedAt: r.finished_at as number | null, status: r.status as string,
    datesSynced: r.dates_synced as number, error: r.error as string | null,
  }));
}
