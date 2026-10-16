// Yahoo Fantasy JSON → plain types. Pure.
//
// Yahoo's JSON has two odd shapes: collections are objects keyed "0", "1", … plus "count", and a resource's fields
// arrive as an array of one-key objects (with stray empty arrays). `items` and `merge` undo both.
import type { StatMap } from "../scoring.ts";

export type Category = { statId: string; name: string; display: string; displayOnly: boolean };
export type LeagueSettings = {
  leagueKey: string; name: string; season: string; startDate: string; endDate: string;
  categories: Category[]; modifiers: StatMap;
};
export type Team = { teamKey: string; name: string; managerGuids: string[] };
export type Player = {
  playerKey: string; name: string; nbaTeam: string; positions: string[]; injuryStatus: string | null; ownerTeamKey: string | null;
};
export type User = { guid: string; name: string; teamKey: string | null; checkedAt: number };
export type UserLeague = { leagueKey: string; name: string; season: string; scoringType: string };
export type PlayerStatRow = { playerKey: string; stats: StatMap };

type Obj = Record<string, any>;

/** Members of a Yahoo collection (`{"0": …, "1": …, "count": n}`), or of a plain array. */
function items(coll: unknown): any[] {
  if (Array.isArray(coll)) return coll;
  if (!coll || typeof coll !== "object") return [];
  return Object.keys(coll).filter((k) => /^\d+$/.test(k)).sort((a, b) => Number(a) - Number(b)).map((k) => (coll as Obj)[k]);
}

/** Merges a Yahoo field list (`[{a: 1}, [], {b: 2}]`) into one object; nested lists are merged too. */
function merge(list: unknown): Obj {
  const out: Obj = {};
  const walk = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.assign(out, v);
  };
  walk(list);
  return out;
}

/** The second element of a resource array holds its sub-resources (`[fields, {players: …}]`). */
const sub = (resource: unknown): Obj => (Array.isArray(resource) ? merge(resource.slice(1)) : {});

function userGames(json: Obj): any[] {
  const user = items(json.fantasy_content?.users)[0]?.user;
  return items(sub(user).games).map((g) => g.game);
}

export function parseUserLeagues(json: Obj): UserLeague[] {
  return userGames(json).flatMap((game) =>
    items(sub(game).leagues).map((l) => {
      const f = merge(l.league[0]);
      return { leagueKey: String(f.league_key), name: String(f.name), season: String(f.season), scoringType: String(f.scoring_type ?? "") };
    }),
  );
}

export function parseUserTeams(json: Obj): { teamKey: string; name: string }[] {
  return userGames(json).flatMap((game) =>
    items(sub(game).teams).map((t) => {
      const f = merge(t.team[0]);
      return { teamKey: String(f.team_key), name: String(f.name) };
    }),
  );
}

export function parseSettings(json: Obj): LeagueSettings {
  const league = json.fantasy_content.league;
  const f = merge(league[0]);
  const settings = merge(sub(league).settings);
  const categories = items(settings.stat_categories?.stats).map(({ stat }) => ({
    statId: String(stat.stat_id), name: String(stat.name), display: String(stat.display_name ?? stat.name),
    displayOnly: String(stat.is_only_display_stat ?? "0") === "1",
  }));
  const modifiers: StatMap = {};
  for (const { stat } of items(settings.stat_modifiers?.stats)) modifiers[String(stat.stat_id)] = Number(stat.value);
  return {
    leagueKey: String(f.league_key), name: String(f.name), season: String(f.season),
    startDate: String(f.start_date), endDate: String(f.end_date), categories, modifiers,
  };
}

export function parseTeams(json: Obj): Team[] {
  return items(sub(json.fantasy_content.league).teams).map((t) => {
    const f = merge(t.team[0]);
    return {
      teamKey: String(f.team_key), name: String(f.name),
      managerGuids: items(f.managers).map((m) => m.manager?.guid).filter((g): g is string => typeof g === "string"),
    };
  });
}

const playerList = (json: Obj): any[] => items(sub(json.fantasy_content.league).players).map((p) => p.player);

// Yahoo's roster-slot positions that aren't real basketball positions.
const NOT_POSITIONS = new Set(["Util", "IL", "IL+", "BN"]);

export function parsePlayers(json: Obj): Player[] {
  return playerList(json).map((p) => {
    const f = merge(p[0]);
    const own = sub(p).ownership ?? {};
    return {
      playerKey: String(f.player_key),
      name: String(f.name?.full ?? ""),
      nbaTeam: String(f.editorial_team_abbr ?? ""),
      positions: items(f.eligible_positions).map((e) => String(e.position)).filter((pos) => !NOT_POSITIONS.has(pos)),
      injuryStatus: f.status ? String(f.status) : null,
      ownerTeamKey: own.ownership_type === "team" && own.owner_team_key ? String(own.owner_team_key) : null,
    };
  });
}

/** Stat values as numbers. "-" and "" (didn't play) are 0; non-numeric values such as "11/22" are left out. */
function statValues(stats: unknown): StatMap {
  const out: StatMap = {};
  for (const { stat } of items(stats)) {
    const raw = String(stat.value ?? "").trim();
    const v = raw === "-" || raw === "" ? 0 : Number(raw);
    if (Number.isFinite(v) && /^-?[\d.]*$/.test(raw.replace(/^-$/, ""))) out[String(stat.stat_id)] = v;
  }
  return out;
}

export function parsePlayerStats(json: Obj): PlayerStatRow[] {
  return playerList(json).map((p) => ({ playerKey: String(merge(p[0]).player_key), stats: statValues(sub(p).player_stats?.stats) }));
}

/** One date's stat lines, without players who didn't play (every value 0). */
export function parseDateStats(json: Obj): PlayerStatRow[] {
  return parsePlayerStats(json).filter((r) => Object.values(r.stats).some((v) => v !== 0));
}

/** Yahoo's own fantasy point totals, used only to cross-check our scoring. */
export function parsePlayerPoints(json: Obj): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of playerList(json)) {
    const total = sub(p).player_points?.total;
    if (total !== undefined) out[String(merge(p[0]).player_key)] = Number(total);
  }
  return out;
}
