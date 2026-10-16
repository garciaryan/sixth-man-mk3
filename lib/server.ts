// Shared wiring for route handlers and pages. Server-side only.
import { cookies } from "next/headers";
import { getDb } from "./db.ts";
import { readEnv, type AppEnv } from "./env.ts";
import { readSession, SESSION_COOKIE } from "./session.ts";
import type { OAuthConfig } from "./yahoo/oauth.ts";
import { createClient, type YahooClient } from "./yahoo/client.ts";

export const appEnv = (): AppEnv => readEnv(process.env);

export const oauthConfig = (env: AppEnv = appEnv()): OAuthConfig => ({
  clientId: env.clientId, clientSecret: env.clientSecret, redirectUri: env.redirectUri,
});

export const sessionSecret = (): string => process.env.SESSION_SECRET ?? "";

export const serviceClient = (): YahooClient => createClient({ db: getDb(), cfg: oauthConfig() });

/** The signed-in manager's GUID (pages and route handlers; middleware already checked it). */
export async function currentGuid(): Promise<string | null> {
  const s = await readSession((await cookies()).get(SESSION_COOKIE)?.value, sessionSecret(), Date.now());
  return s?.guid ?? null;
}
