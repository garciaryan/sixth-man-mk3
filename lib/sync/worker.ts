// Runs at most one sync at a time per process, and decides when a page visit should catch up. Server-side only.
import { timingSafeEqual } from "node:crypto";
import { yesterday } from "../dates.ts";
import { getLeague, getSyncState } from "../store.ts";
import { getService } from "../yahoo/auth-store.ts";
import { runSync, lastRuns, type SyncDeps } from "./run.ts";

const RETRY_AFTER_ERROR_MS = 15 * 60_000;

type MakeDeps = () => Omit<SyncDeps, "leagueKey"> & { leagueKey: string | null };

export function createWorker(makeDeps: MakeDeps) {
  let running: Promise<unknown> | null = null;

  function startSync(): { started: boolean; running: boolean } {
    if (running) return { started: false, running: true };
    const deps = makeDeps();
    const leagueKey = deps.leagueKey;
    if (!leagueKey) return { started: false, running: false };
    running = runSync({ ...deps, leagueKey })
      .catch((e) => console.error("sync failed", e))
      .finally(() => (running = null));
    return { started: true, running: true };
  }

  /** Starts a sync when the data is behind, the connection works, and no sync failed in the last 15 minutes. */
  function maybeCatchUp(): boolean {
    if (running) return false;
    const { db, leagueKey, now } = makeDeps();
    if (!leagueKey || getService(db)?.status !== "ok") return false;
    const last = getSyncState(db).lastDate;
    const y = yesterday(now);
    const league = getLeague(db);
    if (league && y < league.startDate) return false; // the season hasn't started
    const target = league && league.endDate && league.endDate < y ? league.endDate : y; // or it's over
    if (last && last >= target) return false;
    const recent = lastRuns(db, 1)[0];
    if (recent?.status === "error" && now.getTime() - recent.startedAt < RETRY_AFTER_ERROR_MS) return false;
    return startSync().started;
  }

  return { startSync, maybeCatchUp, isRunning: () => running !== null, current: () => running ?? Promise.resolve() };
}

/** POST /api/sync: bearer SYNC_TOKEN, compared in constant time. */
export function syncRequest(
  authorization: string | null, token: string, start: () => { started: boolean; running: boolean },
): { status: number; body: unknown } {
  if (!token) return { status: 503, body: { error: "SYNC_TOKEN is not set." } };
  const given = Buffer.from(authorization?.replace(/^Bearer /, "") ?? "");
  const want = Buffer.from(token);
  if (given.length !== want.length || !timingSafeEqual(given, want)) return { status: 401, body: { error: "Bad token." } };
  return { status: 202, body: start() };
}
