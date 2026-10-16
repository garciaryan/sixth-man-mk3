import { getDb } from "@/lib/db.ts";
import { getLeague, getPickedLeagueKey, getSyncState } from "@/lib/store.ts";
import { getService } from "@/lib/yahoo/auth-store.ts";
import { getUserLeagues } from "@/lib/yahoo/api.ts";
import type { UserLeague } from "@/lib/yahoo/parse.ts";
import { lastRuns } from "@/lib/sync/run.ts";
import { appEnv, serviceClient } from "@/lib/server.ts";
import { fmtDate } from "@/lib/format.ts";

export const dynamic = "force-dynamic";

const time = (ms: number | null) => (ms ? new Date(ms).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "—");

export default async function SettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const env = appEnv();
  const db = getDb();
  const service = getService(db);
  const league = getLeague(db);
  const picked = env.leagueKey ?? getPickedLeagueKey(db);
  const sync = getSyncState(db);
  const runs = lastRuns(db, 5);

  let leagues: UserLeague[] = [];
  let leaguesError: string | null = null;
  if (service?.status === "ok" && !env.leagueKey) {
    try {
      const all = await getUserLeagues(serviceClient());
      const latest = all.reduce((m, l) => (l.season > m ? l.season : m), "");
      leagues = all.filter((l) => l.season === latest);
    } catch (e) {
      leaguesError = e instanceof Error ? e.message : "Couldn't reach Yahoo.";
    }
  }

  return (
    <main className="page" style={{ maxWidth: 760 }}>
      <h1>Settings</h1>
      {sp.error && <p className="banner" role="alert">{sp.error}</p>}
      {sp.league === "saved" && <p className="muted">League saved. The first sync has started.</p>}
      {sp.sync && <p className="muted">{sp.sync === "started" ? "Sync started." : "A sync is already running."}</p>}
      {env.missing.length > 0 && (
        <p className="banner" role="alert">Missing environment variables: {env.missing.join(", ")}.</p>
      )}

      <h2>Yahoo connection</h2>
      <div className="card">
        {!service && <p>Not connected. Your Yahoo account drives the nightly sync.</p>}
        {service?.status === "ok" && <p>Connected. Token refreshes automatically.</p>}
        {service?.status === "needs_reconnect" && <p><strong>Yahoo stopped accepting the connection.</strong> Reconnect to resume syncing.</p>}
        <a className="button" href="/api/auth/start?next=/settings">{service ? "Reconnect Yahoo" : "Connect Yahoo"}</a>
      </div>

      <h2>League</h2>
      <div className="card">
        {env.leagueKey ? (
          <p>Set by <code>LEAGUE_KEY</code>: <strong>{league?.name ?? env.leagueKey}</strong></p>
        ) : !service ? (
          <p className="muted">Connect Yahoo first.</p>
        ) : leaguesError ? (
          <p className="banner">{leaguesError}</p>
        ) : leagues.length === 0 ? (
          <p className="muted">No NBA leagues found on your Yahoo account this season.</p>
        ) : (
          <form action="/api/admin/league" method="post" className="filters">
            <label>Your NBA leagues
              <select name="leagueKey" defaultValue={picked ?? ""}>
                {!picked && <option value="" disabled>Choose a league</option>}
                {leagues.map((l) => (
                  <option key={l.leagueKey} value={l.leagueKey}>
                    {l.name}{l.scoringType && l.scoringType !== "point" ? " (not a points league)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <button className="button">Save</button>
          </form>
        )}
        {picked && !env.leagueKey && <p className="muted" style={{ fontSize: "0.85rem" }}>Switching leagues clears synced stats.</p>}
      </div>

      <h2>Sync</h2>
      <div className="card">
        <p>Stats through <strong>{fmtDate(sync.lastDate)}</strong>{league ? ` · season ${fmtDate(league.startDate)} to ${fmtDate(league.endDate)}` : ""}</p>
        <form action="/api/admin/sync" method="post"><button className="button" disabled={!picked || service?.status !== "ok"}>Sync now</button></form>
        {runs.length > 0 && (
          <div className="table-wrap" style={{ marginTop: 12 }}>
            <table>
              <thead><tr><th>Started</th><th>Status</th><th className="num">Dates</th><th>Error</th></tr></thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.startedAt + r.status}>
                    <td>{time(r.startedAt)}</td><td>{r.status}</td><td className="num">{r.datesSynced}</td>
                    <td className="muted" style={{ fontSize: "0.85rem" }}>{r.error ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <h2>Scoring</h2>
      <div className="card">
        {!league ? (
          <p className="muted">Appears after the first sync.</p>
        ) : (
          <table>
            <thead><tr><th>Stat</th><th className="num">Points each</th></tr></thead>
            <tbody>
              {league.categories.filter((c) => league.modifiers[c.statId] !== undefined).map((c) => (
                <tr key={c.statId}><td>{c.name} <span className="muted">({c.display})</span></td><td className="num">{league.modifiers[c.statId]}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
