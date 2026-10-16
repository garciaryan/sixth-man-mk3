// The ranked players table: query parsing, filtering, sorting and ranking. Pure.
import { isWindowId, type WindowId } from "../dates.ts";
import { aggregate, fantasyPoints, type Aggregate, type GameRow, type StatMap } from "../scoring.ts";
import type { Player, Team } from "../yahoo/parse.ts";

export const POSITIONS = ["PG", "SG", "G", "SF", "PF", "F", "C"];

export type PlayersQuery = {
  window: WindowId;
  owner: "all" | "fa" | "mine" | string; // or a team key
  pos: string | null;
  minGp: number;
  q: string;
  sort: string; // "fptsPerGame" | "fpts" | "gp" | "name" | "stat:<id>"
  dir: "asc" | "desc";
};

export type PlayerRow = {
  rank: number; playerKey: string; name: string; nbaTeam: string; positions: string[]; injuryStatus: string | null;
  ownerName: string; agg: Aggregate;
};

const SORTS = /^(fptsPerGame|fpts|gp|name|stat:\d+)$/;

export function parsePlayersQuery(sp: URLSearchParams): PlayersQuery {
  const window = sp.get("window");
  const minGp = Number(sp.get("minGp") ?? 1);
  const pos = sp.get("pos");
  const sort = sp.get("sort") ?? "";
  return {
    window: isWindowId(window) ? window : "season",
    owner: sp.get("owner") || "all",
    pos: pos && POSITIONS.includes(pos) ? pos : null,
    minGp: Number.isInteger(minGp) && minGp >= 0 ? minGp : 1,
    q: (sp.get("q") ?? "").trim(),
    sort: SORTS.test(sort) ? sort : "fptsPerGame",
    dir: sp.get("dir") === "asc" ? "asc" : "desc",
  };
}

function sortValue(row: PlayerRow, sort: string): number | string | null {
  if (sort === "name") return row.name.toLowerCase();
  if (sort === "gp") return row.agg.gp;
  if (sort === "fpts") return row.agg.gp > 0 ? row.agg.fpts : null;
  if (sort.startsWith("stat:")) return row.agg.perGame[sort.slice(5)] ?? null;
  return row.agg.fptsPerGame;
}

export function buildRows(
  input: {
    players: Player[]; games: Map<string, GameRow[]>; modifiers: StatMap; teams: Team[]; myTeamKey: string | null;
    range: { from: string; to: string };
  },
  q: PlayersQuery,
): PlayerRow[] {
  const teamName = new Map(input.teams.map((t) => [t.teamKey, t.name]));
  const needle = q.q.toLowerCase();
  const rows: PlayerRow[] = [];
  for (const p of input.players) {
    if (q.owner === "fa" && p.ownerTeamKey) continue;
    if (q.owner === "mine" && (!input.myTeamKey || p.ownerTeamKey !== input.myTeamKey)) continue;
    if (!["all", "fa", "mine"].includes(q.owner) && p.ownerTeamKey !== q.owner) continue;
    if (q.pos && !p.positions.includes(q.pos)) continue;
    if (needle && !p.name.toLowerCase().includes(needle)) continue;
    const agg = aggregate(input.games.get(p.playerKey) ?? [], input.range, input.modifiers);
    if (agg.gp < q.minGp) continue;
    rows.push({
      rank: 0, playerKey: p.playerKey, name: p.name, nbaTeam: p.nbaTeam, positions: p.positions, injuryStatus: p.injuryStatus,
      ownerName: p.ownerTeamKey ? teamName.get(p.ownerTeamKey) ?? "Another team" : "Free agent", agg,
    });
  }
  const sign = q.dir === "asc" ? 1 : -1;
  rows.sort((a, b) => {
    const va = sortValue(a, q.sort);
    const vb = sortValue(b, q.sort);
    if (va === null || vb === null) return va === vb ? a.name.localeCompare(b.name) : va === null ? 1 : -1; // empty values last
    if (va < vb) return -sign;
    if (va > vb) return sign;
    return a.name.localeCompare(b.name);
  });
  rows.forEach((r, i) => (r.rank = i + 1));
  return rows;
}


/** One player's games, newest first, with each game's fantasy points. */
export function gameLogRows(games: GameRow[], modifiers: StatMap): (GameRow & { fpts: number })[] {
  return [...games].sort((a, b) => b.date.localeCompare(a.date)).map((g) => ({ ...g, fpts: fantasyPoints(g.stats, modifiers) }));
}
