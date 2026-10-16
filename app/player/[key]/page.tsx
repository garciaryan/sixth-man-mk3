import { notFound } from "next/navigation";
import { getGames } from "@/lib/store.ts";
import { WINDOWS, WINDOW_LABELS, windowRange, yesterday } from "@/lib/dates.ts";
import { aggregate } from "@/lib/scoring.ts";
import { gameLogRows } from "@/lib/view/players.ts";
import { loadLeagueContext, scoringCategories } from "@/lib/view/league-data.ts";
import { fmt, fmtDate } from "@/lib/format.ts";

export const dynamic = "force-dynamic";

export default async function PlayerPage({ params }: { params: Promise<{ key: string }> }) {
  const key = decodeURIComponent((await params).key);
  const { db, league, players, teams } = await loadLeagueContext();
  const player = players.find((p) => p.playerKey === key);
  if (!league || !player) notFound();

  const now = new Date();
  const games = getGames(db, [key], league.startDate, yesterday(now)).get(key) ?? [];
  const cats = scoringCategories(league);
  const owner = player.ownerTeamKey ? teams.find((t) => t.teamKey === player.ownerTeamKey)?.name ?? "Another team" : "Free agent";

  return (
    <main className="page">
      <h1>
        {player.name}
        {player.injuryStatus && <span className="badge">{player.injuryStatus}</span>}
      </h1>
      <p className="muted">{player.nbaTeam} · {player.positions.join(", ")} · {owner}</p>

      <div className="tiles">
        {WINDOWS.map((w) => {
          const a = aggregate(games, windowRange(w, now, league.startDate), league.modifiers);
          return (
            <div key={w} className="card">
              <div className="muted" style={{ fontSize: "0.8rem" }}>{WINDOW_LABELS[w]}</div>
              <div className="num" style={{ fontSize: "1.5rem", fontWeight: 700, textAlign: "left" }}>{fmt(a.fptsPerGame)}</div>
              <div className="muted" style={{ fontSize: "0.8rem" }}>FP/G · {a.gp} GP</div>
            </div>
          );
        })}
      </div>

      <h2>Game log</h2>
      {games.length === 0 ? (
        <p className="muted">No games played yet this season.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th className="num">FP</th>
                {cats.map((c) => <th key={c.statId} className="num" title={c.name}>{c.display}</th>)}
              </tr>
            </thead>
            <tbody>
              {gameLogRows(games, league.modifiers).map((g) => (
                <tr key={g.date}>
                  <td style={{ whiteSpace: "nowrap" }}>{fmtDate(g.date)}</td>
                  <td className="num"><strong>{fmt(g.fpts)}</strong></td>
                  {cats.map((c) => <td key={c.statId} className="num">{fmt(g.stats[c.statId] ?? 0, 0)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p><a href="/players">Back to players</a></p>
    </main>
  );
}
