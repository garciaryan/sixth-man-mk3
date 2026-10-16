import { getGames } from "@/lib/store.ts";
import { WINDOWS, WINDOW_LABELS, windowRange } from "@/lib/dates.ts";
import { buildRows, parsePlayersQuery, POSITIONS } from "@/lib/view/players.ts";
import { loadLeagueContext, scoringCategories } from "@/lib/view/league-data.ts";
import { fmt } from "@/lib/format.ts";
import { PlayerTable, type TableColumn } from "@/components/PlayerTable.tsx";

export const dynamic = "force-dynamic";

type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function PlayersPage({ searchParams }: { searchParams: SP }) {
  const raw = await searchParams;
  const sp = new URLSearchParams(Object.entries(raw).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])));
  const q = parsePlayersQuery(sp);
  const { db, league, players, teams, myTeamKey } = await loadLeagueContext();
  if (!league) {
    return (
      <main className="page">
        <h1>Players</h1>
        <p className="muted">The first sync hasn&apos;t finished yet. Check back in a few minutes.</p>
      </main>
    );
  }

  const range = windowRange(q.window, new Date(), league.startDate);
  const rows = buildRows({ players, games: getGames(db, null, range.from, range.to), modifiers: league.modifiers, teams, myTeamKey, range }, q);
  const cats = scoringCategories(league);

  const columns: TableColumn[] = [
    { key: "gp", label: "GP" },
    { key: "fptsPerGame", label: "FP/G" },
    { key: "fpts", label: "FP", stat: true },
    ...cats.map((c) => ({ key: `stat:${c.statId}`, label: c.display, title: `${c.name} per game (×${league.modifiers[c.statId]})`, stat: true })),
  ];
  const href = (over: Record<string, string>) => {
    const next = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(over)) next.set(k, v);
    return `/players?${next}`;
  };
  const sortHref: Record<string, string> = {};
  for (const key of ["name", ...columns.map((c) => c.key)]) {
    const dir = q.sort === key ? (q.dir === "desc" ? "asc" : "desc") : key === "name" ? "asc" : "desc";
    sortHref[key] = href({ sort: key, dir });
  }

  return (
    <main className="page">
      <h1>Players</h1>
      <form className="filters" method="get">
        <label>Window
          <select name="window" defaultValue={q.window}>
            {WINDOWS.map((w) => <option key={w} value={w}>{WINDOW_LABELS[w]}</option>)}
          </select>
        </label>
        <label>Owner
          <select name="owner" defaultValue={q.owner}>
            <option value="all">All players</option>
            <option value="fa">Free agents</option>
            {myTeamKey && <option value="mine">My team</option>}
            {teams.map((t) => <option key={t.teamKey} value={t.teamKey}>{t.name}</option>)}
          </select>
        </label>
        <label>Position
          <select name="pos" defaultValue={q.pos ?? ""}>
            <option value="">Any</option>
            {POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <label>Min GP
          <input name="minGp" type="number" min={0} defaultValue={q.minGp} style={{ width: 70 }} />
        </label>
        <label>Search
          <input name="q" type="search" defaultValue={q.q} placeholder="Player name" />
        </label>
        <input type="hidden" name="sort" value={q.sort} />
        <input type="hidden" name="dir" value={q.dir} />
        <button className="button">Apply</button>
      </form>
      <p className="muted" style={{ fontSize: "0.85rem", margin: "4px 0" }}>
        {rows.length} players · {WINDOW_LABELS[q.window]} ({range.from} to {range.to}) · scored with {league.name}&apos;s point values
      </p>
      <PlayerTable
        columns={columns}
        sortHref={sortHref}
        sort={q.sort}
        dir={q.dir}
        window={q.window}
        rows={rows.map((r) => ({
          rank: r.rank, playerKey: r.playerKey, name: r.name, injury: r.injuryStatus, owner: r.ownerName,
          meta: `${r.nbaTeam} · ${r.positions.join(", ")}`,
          cells: Object.fromEntries([
            ["gp", String(r.agg.gp)],
            ["fptsPerGame", fmt(r.agg.fptsPerGame)],
            ["fpts", r.agg.gp ? fmt(r.agg.fpts) : "—"],
            ...cats.map((c) => [`stat:${c.statId}`, fmt(r.agg.perGame[c.statId] ?? (r.agg.gp ? 0 : null))]),
          ]),
        }))}
      />
    </main>
  );
}
