// Sign in with Yahoo: who is this, and do they manage a team in our league? Server-side only.
import type { DatabaseSync } from "node:sqlite";
import { getLeague, upsertUser } from "./store.ts";
import { saveService } from "./yahoo/auth-store.ts";
import { createClient } from "./yahoo/client.ts";
import { getUserTeams } from "./yahoo/api.ts";
import { exchangeCode, fetchGuid, type OAuthConfig, type Tokens } from "./yahoo/oauth.ts";

export const RECHECK_MS = 24 * 3600 * 1000;

export type SignInResult =
  | { kind: "ok"; guid: string }
  | { kind: "denied"; leagueName: string | null }
  | { kind: "error"; code: "exchange" | "userinfo" | "leagues" };

export async function completeSignIn(
  deps: {
    db: DatabaseSync; cfg: OAuthConfig; leagueKey: string | null; adminGuid: string;
    fetchFn?: typeof fetch; now?: number; throttle?: { nextAt: number };
  },
  code: string,
): Promise<SignInResult> {
  const { db, cfg, leagueKey, adminGuid } = deps;
  const fetchFn = deps.fetchFn ?? fetch;
  const now = deps.now ?? Date.now();

  let tokens: Tokens;
  try {
    tokens = await exchangeCode(cfg, code, fetchFn, now);
  } catch (e) {
    console.error("sign-in: code exchange failed:", e instanceof Error ? e.message : e);
    return { kind: "error", code: "exchange" };
  }
  let who: { guid: string; name: string };
  try {
    who = await fetchGuid(tokens.accessToken, fetchFn);
  } catch (e) {
    console.error("sign-in: userinfo failed:", e instanceof Error ? e.message : e);
    return { kind: "error", code: "userinfo" };
  }
  const isAdmin = adminGuid !== "" && who.guid === adminGuid;
  const leagueName = getLeague(db)?.name ?? null;

  let teamKey: string | null = null;
  if (leagueKey) {
    try {
      const client = createClient({ db, cfg, fetchFn, accessToken: tokens.accessToken, throttle: deps.throttle });
      const teams = await getUserTeams(client);
      teamKey = teams.find((t) => t.teamKey.startsWith(`${leagueKey}.t.`))?.teamKey ?? null;
    } catch (e) {
      console.error("sign-in: teams lookup failed:", e instanceof Error ? e.message : e);
      // The admin gets in without a team, so a Yahoo outage can't lock them out of setup.
      if (!isAdmin) return { kind: "error", code: "leagues" };
    }
  }
  // The admin always gets in (to fix setup); everyone else needs a team in the league.
  if (!isAdmin && !teamKey) return { kind: "denied", leagueName };

  upsertUser(db, { guid: who.guid, name: who.name, teamKey, checkedAt: now });
  if (isAdmin) saveService(db, who.guid, tokens);
  return { kind: "ok", guid: who.guid };
}

/** True when the user must sign in again so their league membership is checked. */
export function needsRecheck(user: { checkedAt: number } | null, now: number): boolean {
  return !user || now - user.checkedAt >= RECHECK_MS;
}
