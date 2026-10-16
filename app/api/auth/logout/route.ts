import { NextResponse } from "next/server";
import { appEnv } from "@/lib/server.ts";
import { SESSION_COOKIE } from "@/lib/session.ts";

export function POST(): Response {
  const res = NextResponse.redirect(new URL("/login?signedOut=1", appEnv().appUrl), 303);
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
