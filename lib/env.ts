// Typed view of the environment. Pure.

type Env = Record<string, string | undefined>;

export type AppEnv = {
  appUrl: string;
  redirectUri: string;
  leagueKey: string | null;
  adminGuid: string;
  clientId: string;
  clientSecret: string;
  syncToken: string;
  production: boolean;
  missing: string[];
};

const REQUIRED = ["YAHOO_CLIENT_ID", "YAHOO_CLIENT_SECRET", "ADMIN_YAHOO_GUID", "SYNC_TOKEN"] as const;

export function readEnv(env: Env): AppEnv {
  const v = (k: string) => env[k]?.trim() ?? "";
  const appUrl = (v("APP_URL") || "https://localhost:3000").replace(/\/+$/, "");
  return {
    appUrl,
    redirectUri: `${appUrl}/api/auth/callback`,
    leagueKey: v("LEAGUE_KEY") || null,
    adminGuid: v("ADMIN_YAHOO_GUID"),
    clientId: v("YAHOO_CLIENT_ID"),
    clientSecret: v("YAHOO_CLIENT_SECRET"),
    syncToken: v("SYNC_TOKEN"),
    production: env.NODE_ENV === "production",
    missing: REQUIRED.filter((k) => !v(k)),
  };
}
