import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db.ts";
import { completeSignIn } from "@/lib/signin.ts";
import { appEnv, oauthConfig, sessionSecret } from "@/lib/server.ts";
import { leagueKeyFor } from "@/lib/setup.ts";
import { safeNext, sessionCookieOptions, signSession, SESSION_COOKIE } from "@/lib/session.ts";

const STATE_COOKIE = "sm_oauth_state";

export async function GET(request: NextRequest): Promise<Response> {
  const env = appEnv();
  const url = new URL(request.url);
  const to = (path: string) => {
    const res = NextResponse.redirect(new URL(path, env.appUrl));
    res.cookies.delete({ name: STATE_COOKIE, path: "/api/auth" });
    return res;
  };

  const [state, next] = (request.cookies.get(STATE_COOKIE)?.value ?? "").split("|");
  if (url.searchParams.get("error")) return to("/login?error=declined");
  const code = url.searchParams.get("code");
  if (!state || !code || url.searchParams.get("state") !== state) return to("/login?error=state");

  const db = getDb();
  const result = await completeSignIn(
    { db, cfg: oauthConfig(env), leagueKey: leagueKeyFor(db, env.leagueKey), adminGuid: env.adminGuid }, code,
  );
  if (result.kind === "error") return to(`/login?error=${result.code}`);
  if (result.kind === "denied") return to("/denied");

  const res = to(safeNext(next ?? "/"));
  res.cookies.set(SESSION_COOKIE, await signSession(result.guid, sessionSecret(), Date.now()), sessionCookieOptions(env.production));
  return res;
}
