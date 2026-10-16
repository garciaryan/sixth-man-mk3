// Signed session cookie holding the signed-in manager's Yahoo GUID. Web Crypto only.

export const SESSION_COOKIE = "sm_session";
export const SESSION_MAX_AGE_S = 2592000; // 30 days

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

function hmacKey(secret: string, usage: "sign" | "verify"): Promise<CryptoKey> {
  return globalThis.crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [usage]);
}

/** `<base64url guid>.<expiry ms>.<signature>` */
export async function signSession(guid: string, secret: string, now: number): Promise<string> {
  const payload = `${b64url(enc.encode(guid))}.${now + SESSION_MAX_AGE_S * 1000}`;
  const sig = await globalThis.crypto.subtle.sign("HMAC", await hmacKey(secret, "sign"), enc.encode(payload));
  return `${payload}.${b64url(new Uint8Array(sig))}`;
}

export async function readSession(value: string | undefined, secret: string, now: number): Promise<{ guid: string } | null> {
  try {
    if (!value || !/^[A-Za-z0-9_-]+\.\d{1,15}\.[A-Za-z0-9_-]+$/.test(value)) return null;
    const [g, exp, sig] = value.split(".");
    if (!(Number(exp) > now)) return null;
    const ok = await globalThis.crypto.subtle.verify(
      "HMAC", await hmacKey(secret, "verify"), Buffer.from(sig, "base64url"), enc.encode(`${g}.${exp}`),
    );
    return ok ? { guid: Buffer.from(g, "base64url").toString("utf8") } : null;
  } catch {
    return null;
  }
}

export function sessionCookieOptions(production: boolean) {
  return { httpOnly: true, secure: production, sameSite: "lax" as const, path: "/", maxAge: SESSION_MAX_AGE_S };
}

/** Only same-site paths, so `next` can't redirect off the app. */
export function safeNext(next: string | null): string {
  if (!next || !/^\/(?![/\\])/.test(next) || next.includes("\\") || /[\x00-\x1f\x7f]/.test(next)) return "/";
  try {
    return new URL(next, "http://x").origin === "http://x" ? next : "/";
  } catch {
    return "/";
  }
}
