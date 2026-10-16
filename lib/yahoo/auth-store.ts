// The service connection: the admin's Yahoo tokens, which drive the sync. Server-side only.
import type { DatabaseSync } from "node:sqlite";
import type { Tokens } from "./oauth.ts";

export type Service = Tokens & { guid: string; status: "ok" | "needs_reconnect" };

export function saveService(db: DatabaseSync, guid: string, t: Tokens): void {
  db.prepare(
    `INSERT INTO yahoo_auth (id, guid, access_token, refresh_token, expires_at, status) VALUES (1, ?, ?, ?, ?, 'ok')
     ON CONFLICT(id) DO UPDATE SET guid = excluded.guid, access_token = excluded.access_token,
       refresh_token = excluded.refresh_token, expires_at = excluded.expires_at, status = 'ok'`,
  ).run(guid, t.accessToken, t.refreshToken, t.expiresAt);
}

export function getService(db: DatabaseSync): Service | null {
  const r = db.prepare("SELECT * FROM yahoo_auth WHERE id = 1").get() as Record<string, string | number> | undefined;
  if (!r) return null;
  return {
    guid: r.guid as string, accessToken: r.access_token as string, refreshToken: r.refresh_token as string,
    expiresAt: r.expires_at as number, status: r.status as Service["status"],
  };
}

export function markNeedsReconnect(db: DatabaseSync): void {
  db.prepare("UPDATE yahoo_auth SET status = 'needs_reconnect' WHERE id = 1").run();
}
