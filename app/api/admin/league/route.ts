import { NextResponse } from "next/server";
import { getDb } from "@/lib/db.ts";
import { chooseLeague } from "@/lib/admin.ts";
import { appEnv, serviceClient } from "@/lib/server.ts";
import { appWorker } from "@/lib/sync/app-worker.ts";

// The league picker on /settings (the middleware already checked the admin session).
export async function POST(request: Request): Promise<Response> {
  const env = appEnv();
  const leagueKey = String((await request.formData()).get("leagueKey") ?? "");
  let q: string;
  try {
    const r = await chooseLeague({ db: getDb(), client: serviceClient(), envLeagueKey: env.leagueKey, start: () => appWorker().startSync() }, leagueKey);
    q = r.ok ? "league=saved" : `error=${encodeURIComponent(r.error)}`;
  } catch (e) {
    q = `error=${encodeURIComponent(e instanceof Error ? e.message : "Couldn't reach Yahoo.")}`;
  }
  return NextResponse.redirect(new URL(`/settings?${q}`, env.appUrl), 303);
}
