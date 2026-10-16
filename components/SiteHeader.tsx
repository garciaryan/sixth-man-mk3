import { getDb } from "@/lib/db.ts";
import { getSyncState } from "@/lib/store.ts";
import { getService } from "@/lib/yahoo/auth-store.ts";
import { appEnv, currentGuid } from "@/lib/server.ts";
import { fmtDate } from "@/lib/format.ts";

/** Nav plus the "stats through" line and a banner when the sync is paused. Hidden when signed out. */
export async function SiteHeader() {
  const guid = await currentGuid();
  if (!guid) return null;
  const db = getDb();
  const isAdmin = guid === appEnv().adminGuid;
  const last = getSyncState(db).lastDate;
  const paused = getService(db)?.status === "needs_reconnect";
  return (
    <>
      <header className="site-header">
        <a className="brand" href="/players">Sixth Man</a>
        <nav>
          <a href="/players">Players</a>
          {isAdmin && <a href="/settings">Settings</a>}
        </nav>
        <span className="muted" style={{ fontSize: "0.85rem" }}>Stats through {fmtDate(last)}</span>
        <form action="/api/auth/logout" method="post">
          <button className="button secondary" style={{ padding: "4px 10px" }}>Sign out</button>
        </form>
      </header>
      {paused && (
        <div className="banner" role="status">
          Stats last updated {fmtDate(last)}; sync paused until the admin reconnects Yahoo.
        </div>
      )}
    </>
  );
}
