import { appWorker } from "@/lib/sync/app-worker.ts";
import { syncRequest } from "@/lib/sync/worker.ts";
import { appEnv } from "@/lib/server.ts";

// Called by the nightly GitHub Actions cron (which also wakes the machine).
export function POST(request: Request): Response {
  const r = syncRequest(request.headers.get("authorization"), appEnv().syncToken, () => appWorker().startSync());
  return Response.json(r.body, { status: r.status });
}
