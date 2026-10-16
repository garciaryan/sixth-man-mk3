import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { gate } from "./lib/gate.ts";
import { readEnv } from "./lib/env.ts";
import { readSession, SESSION_COOKIE } from "./lib/session.ts";
import { getDb } from "./lib/db.ts";
import { isSetupDone } from "./lib/setup.ts";
import { getUser } from "./lib/store.ts";
import { needsRecheck } from "./lib/signin.ts";
import { appWorker } from "./lib/sync/app-worker.ts";

export const config = { runtime: "nodejs", matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };

export async function middleware(req: NextRequest) {
  const env = readEnv(process.env);
  const secret = process.env.SESSION_SECRET ?? "";
  const session = secret ? await readSession(req.cookies.get(SESSION_COOKIE)?.value, secret, Date.now()) : null;
  const db = getDb();
  const path = req.nextUrl.pathname;
  // Once a day, a page visit re-runs sign-in so league membership is checked again.
  if (session && !path.startsWith("/api/") && path !== "/login" && path !== "/denied" && needsRecheck(getUser(db, session.guid), Date.now())) {
    const res = NextResponse.redirect(new URL(`/api/auth/start?next=${encodeURIComponent(path + req.nextUrl.search)}`, req.url));
    res.cookies.delete(SESSION_COOKIE);
    return res;
  }
  const result = gate(
    { path, session },
    { adminGuid: env.adminGuid, setupDone: isSetupDone(db, env.leagueKey) },
  );
  switch (result.kind) {
    case "pass":
      // A signed-in page visit after a missed nightly sync starts one in the background.
      if (session && !path.startsWith("/api/")) {
        try {
          appWorker().maybeCatchUp();
        } catch (e) {
          console.error("catch-up check failed", e);
        }
      }
      return NextResponse.next();
    case "redirect":
      return NextResponse.redirect(new URL(result.location, req.url));
    case "json":
      return NextResponse.json(result.body, { status: result.status });
  }
}
