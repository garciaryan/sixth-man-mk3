// Who may see what. Pure: middleware.ts feeds it the request path and the session.

export type GateResult =
  | { kind: "pass" }
  | { kind: "redirect"; location: string }
  | { kind: "json"; status: number; body: unknown };

const PUBLIC = ["/login", "/denied", "/api/auth/", "/api/health", "/api/sync"];
const ADMIN = ["/settings", "/api/admin/"];

const matches = (path: string, prefixes: string[]) =>
  prefixes.some((p) => (p.endsWith("/") ? path.startsWith(p) : path === p || path.startsWith(`${p}/`)));

export function gate(
  req: { path: string; session: { guid: string } | null },
  ctx: { adminGuid: string; setupDone: boolean },
): GateResult {
  const { path, session } = req;
  const api = path.startsWith("/api/");
  if (matches(path, PUBLIC)) return { kind: "pass" };
  if (!session) {
    return api
      ? { kind: "json", status: 401, body: { error: "Sign in first." } }
      : { kind: "redirect", location: `/login?next=${encodeURIComponent(path)}` };
  }
  const isAdmin = ctx.adminGuid !== "" && session.guid === ctx.adminGuid;
  if (matches(path, ADMIN)) {
    if (isAdmin) return { kind: "pass" };
    return api ? { kind: "json", status: 403, body: { error: "Admin only." } } : { kind: "redirect", location: "/players" };
  }
  if (!ctx.setupDone) {
    if (api) return { kind: "json", status: 503, body: { error: "Not set up yet." } };
    return { kind: "redirect", location: isAdmin ? "/settings" : "/denied?reason=setup" };
  }
  return { kind: "pass" };
}
