// The process-wide sync worker, wired to the real database and the admin's Yahoo connection. Server-side only.
import { getDb } from "../db.ts";
import { readEnv } from "../env.ts";
import { leagueKeyFor } from "../setup.ts";
import { createClient } from "../yahoo/client.ts";
import { createWorker } from "./worker.ts";

const g = globalThis as typeof globalThis & { __sixthWorker?: ReturnType<typeof createWorker> };

export function appWorker() {
  g.__sixthWorker ??= createWorker(() => {
    const env = readEnv(process.env);
    const db = getDb();
    return {
      db,
      client: createClient({ db, cfg: { clientId: env.clientId, clientSecret: env.clientSecret, redirectUri: env.redirectUri } }),
      leagueKey: leagueKeyFor(db, env.leagueKey),
      now: new Date(),
    };
  });
  return g.__sixthWorker;
}
