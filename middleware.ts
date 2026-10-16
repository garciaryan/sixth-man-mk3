import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { gate } from "./lib/gate.ts";
import { readEnv } from "./lib/env.ts";
import { readSession, SESSION_COOKIE } from "./lib/session.ts";
import { getDb } from "./lib/db.ts";
import { isSetupDone } from "./lib/setup.ts";

export const config = { runtime: "nodejs", matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };

export async function middleware(req: NextRequest) {
  const env = readEnv(process.env);
  const secret = process.env.SESSION_SECRET ?? "";
  const session = secret ? await readSession(req.cookies.get(SESSION_COOKIE)?.value, secret, Date.now()) : null;
  const db = getDb();
  const result = gate(
    { path: req.nextUrl.pathname, session },
    { adminGuid: env.adminGuid, setupDone: isSetupDone(db, env.leagueKey) },
  );
  switch (result.kind) {
    case "pass":
      return NextResponse.next();
    case "redirect":
      return NextResponse.redirect(new URL(result.location, req.url));
    case "json":
      return NextResponse.json(result.body, { status: result.status });
  }
}
