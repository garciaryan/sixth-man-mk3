import { NextResponse } from "next/server";
import { appWorker } from "@/lib/sync/app-worker.ts";
import { appEnv } from "@/lib/server.ts";

// The admin's "Sync now" button (the middleware already checked the admin session).
export function POST(): Response {
  const r = appWorker().startSync();
  return NextResponse.redirect(new URL(`/settings?sync=${r.started ? "started" : "running"}`, appEnv().appUrl), 303);
}
