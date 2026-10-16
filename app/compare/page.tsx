import { getGames } from "@/lib/store.ts";
import { WINDOWS, WINDOW_LABELS, isWindowId, yesterday } from "@/lib/dates.ts";
import { buildCompare, parseCompareKeys } from "@/lib/view/compare.ts";
import { loadLeagueContext } from "@/lib/view/league-data.ts";
import { CompareGrid } from "@/components/CompareGrid.tsx";

export const dynamic = "force-dynamic";

const MESSAGES = { too_few: "Pick at least 2 different players to compare.", too_many: "You can compare up to 4 players at once." };

export default async function ComparePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const window = isWindowId(sp.window) ? sp.window : "season";
  const parsed = parseCompareKeys(sp.p ?? null);
  const back = <a href="/players">Back to players</a>;
  if ("error" in parsed) {
    return <main className="page"><h1>Compare</h1><p>{MESSAGES[parsed.error]} {back}</p></main>;
  }
  const { db, league, players } = await loadLeagueContext();
  if (!league) return <main className="page"><h1>Compare</h1><p className="muted">The first sync hasn&apos;t finished yet. {back}</p></main>;

  const now = new Date();
  const c = buildCompare(
    { players, games: getGames(db, parsed.keys, league.startDate, yesterday(now)), modifiers: league.modifiers, categories: league.categories, now, seasonStart: league.startDate },
    parsed.keys, window,
  );
  const tab = (w: string) => `/compare?p=${parsed.keys.join(",")}&window=${w}`;

  return (
    <main className="page">
      <h1>Compare</h1>
      {c.unknown.length > 0 && <p className="banner">Not found in this league: {c.unknown.join(", ")}</p>}
      {c.columns.length < 2 ? (
        <p>Not enough players to compare. {back}</p>
      ) : (
        <>
          <nav className="filters" aria-label="Window">
            {WINDOWS.map((w) => (
              <a key={w} href={tab(w)} className={w === window ? "button" : "button secondary"} style={{ padding: "4px 10px" }}>{WINDOW_LABELS[w]}</a>
            ))}
          </nav>
          <CompareGrid columns={c.columns} rows={c.rows} spark={c.spark} windowLabel={WINDOW_LABELS[window]} />
          <p className="muted" style={{ fontSize: "0.85rem" }}>Highlighted: best in each row. For stats worth negative points (like turnovers), lowest is best. {back}</p>
        </>
      )}
    </main>
  );
}
