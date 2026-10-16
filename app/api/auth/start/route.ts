import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { authorizeUrl } from "@/lib/yahoo/oauth.ts";
import { appEnv, oauthConfig } from "@/lib/server.ts";
import { safeNext } from "@/lib/session.ts";

const STATE_COOKIE = "sm_oauth_state";

export function GET(request: Request): Response {
  const env = appEnv();
  if (!env.clientId) return new Response("YAHOO_CLIENT_ID is not set.", { status: 503 });
  const state = randomBytes(16).toString("base64url");
  const next = safeNext(new URL(request.url).searchParams.get("next"));
  const res = NextResponse.redirect(authorizeUrl(oauthConfig(env), state));
  res.cookies.set(STATE_COOKIE, `${state}|${next}`, {
    httpOnly: true, secure: env.production, sameSite: "lax", path: "/api/auth", maxAge: 600,
  });
  return res;
}
