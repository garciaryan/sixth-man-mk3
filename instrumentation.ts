export async function register() {
  // Node-only work stays inside this block: Next also compiles this file for the edge runtime.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Before anything serves a request, so every session is signed with the same secret.
    (await import("./lib/session-secret.ts")).ensureSessionSecret(process.env, process.env.DATA_DIR ?? "./data");
    // No sync survives a restart, so any run still marked running was interrupted.
    (await import("./lib/sync/run.ts")).markInterruptedRuns((await import("./lib/db.ts")).getDb());
  }
}
