// Reads and writes for synced league data and users. Server-side only.
import type { DatabaseSync } from "node:sqlite";
import type { GameRow, StatMap } from "./scoring.ts";
import type { LeagueSettings, Player, Team, User } from "./yahoo/parse.ts";

function tx<T>(db: DatabaseSync, fn: () => T): T {
  db.exec("BEGIN");
  try {
    const out = fn();
    db.exec("COMMIT");
    return out;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

export function saveLeague(db: DatabaseSync, s: LeagueSettings, now = Date.now()): void {
  db.prepare(
    `INSERT INTO league_settings (id, league_key, name, season, start_date, end_date, stat_categories_json, modifiers_json, updated_at)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET league_key = excluded.league_key, name = excluded.name, season = excluded.season,
       start_date = excluded.start_date, end_date = excluded.end_date, stat_categories_json = excluded.stat_categories_json,
       modifiers_json = excluded.modifiers_json, updated_at = excluded.updated_at`,
  ).run(s.leagueKey, s.name, s.season, s.startDate, s.endDate, JSON.stringify(s.categories), JSON.stringify(s.modifiers), now);
}

/** The synced league settings, or null before the first settings sync. */
export function getLeague(db: DatabaseSync): LeagueSettings | null {
  const r = db.prepare("SELECT * FROM league_settings WHERE id = 1 AND updated_at IS NOT NULL").get() as Record<string, string> | undefined;
  if (!r) return null;
  return {
    leagueKey: r.league_key, name: r.name, season: r.season, startDate: r.start_date, endDate: r.end_date,
    categories: JSON.parse(r.stat_categories_json), modifiers: JSON.parse(r.modifiers_json),
  };
}

/** The league picked on /settings (may not be synced yet). */
export function getPickedLeagueKey(db: DatabaseSync): string | null {
  const r = db.prepare("SELECT league_key FROM league_settings WHERE id = 1").get() as { league_key: string } | undefined;
  return r?.league_key ?? null;
}

/** Picks a league. Switching to a different league clears everything synced for the old one. */
export function pickLeague(db: DatabaseSync, leagueKey: string): void {
  if (getPickedLeagueKey(db) === leagueKey) return;
  tx(db, () => {
    db.exec("DELETE FROM league_settings; DELETE FROM teams; DELETE FROM players; DELETE FROM game_stats; DELETE FROM sync_state;");
    db.prepare("INSERT INTO league_settings (id, league_key) VALUES (1, ?)").run(leagueKey);
  });
}

export function saveTeams(db: DatabaseSync, teams: Team[]): void {
  tx(db, () => {
    db.exec("DELETE FROM teams");
    const ins = db.prepare("INSERT INTO teams (team_key, name, manager_guids_json) VALUES (?, ?, ?)");
    for (const t of teams) ins.run(t.teamKey, t.name, JSON.stringify(t.managerGuids));
  });
}

export function getTeams(db: DatabaseSync): Team[] {
  const rows = db.prepare("SELECT * FROM teams ORDER BY name").all() as Record<string, string>[];
  return rows.map((r) => ({ teamKey: r.team_key, name: r.name, managerGuids: JSON.parse(r.manager_guids_json) }));
}

export function savePlayers(db: DatabaseSync, players: Player[], now = Date.now()): void {
  tx(db, () => {
    const up = db.prepare(
      `INSERT INTO players (player_key, name, nba_team, positions_json, injury_status, owner_team_key, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(player_key) DO UPDATE SET name = excluded.name, nba_team = excluded.nba_team,
         positions_json = excluded.positions_json, injury_status = excluded.injury_status,
         owner_team_key = excluded.owner_team_key, updated_at = excluded.updated_at`,
    );
    for (const p of players) up.run(p.playerKey, p.name, p.nbaTeam, JSON.stringify(p.positions), p.injuryStatus, p.ownerTeamKey, now);
  });
}

export function getPlayers(db: DatabaseSync): Player[] {
  const rows = db.prepare("SELECT * FROM players ORDER BY name").all() as Record<string, string | null>[];
  return rows.map((r) => ({
    playerKey: r.player_key!, name: r.name!, nbaTeam: r.nba_team ?? "", positions: JSON.parse(r.positions_json!),
    injuryStatus: r.injury_status, ownerTeamKey: r.owner_team_key,
  }));
}

/** Replaces one date's stats and marks the date synced, atomically. */
export function saveGameDay(db: DatabaseSync, date: string, rows: { playerKey: string; stats: StatMap }[]): void {
  tx(db, () => {
    db.prepare("DELETE FROM game_stats WHERE date = ?").run(date);
    const ins = db.prepare("INSERT INTO game_stats (player_key, date, stat_id, value) VALUES (?, ?, ?, ?)");
    for (const r of rows) for (const [id, v] of Object.entries(r.stats)) ins.run(r.playerKey, date, id, v);
    db.prepare("INSERT INTO sync_state (id, last_date) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET last_date = excluded.last_date").run(date);
  });
}

/** Games per player between `from` and `to` (inclusive), oldest first. `playerKeys` null = every player. */
export function getGames(db: DatabaseSync, playerKeys: string[] | null, from: string, to: string): Map<string, GameRow[]> {
  let sql = "SELECT player_key, date, stat_id, value FROM game_stats WHERE date BETWEEN ? AND ?";
  const params: string[] = [from, to];
  if (playerKeys) {
    if (playerKeys.length === 0) return new Map();
    sql += ` AND player_key IN (${playerKeys.map(() => "?").join(",")})`;
    params.push(...playerKeys);
  }
  sql += " ORDER BY player_key, date";
  const out = new Map<string, GameRow[]>();
  for (const r of db.prepare(sql).all(...params) as { player_key: string; date: string; stat_id: string; value: number }[]) {
    let games = out.get(r.player_key);
    if (!games) out.set(r.player_key, (games = []));
    let last = games[games.length - 1];
    if (!last || last.date !== r.date) games.push((last = { date: r.date, stats: {} }));
    last.stats[r.stat_id] = r.value;
  }
  return out;
}

export function getSyncState(db: DatabaseSync): { lastDate: string | null } {
  const r = db.prepare("SELECT last_date FROM sync_state WHERE id = 1").get() as { last_date: string | null } | undefined;
  return { lastDate: r?.last_date ?? null };
}

export function upsertUser(db: DatabaseSync, u: User): void {
  db.prepare(
    `INSERT INTO users (guid, name, team_key, checked_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(guid) DO UPDATE SET name = excluded.name, team_key = excluded.team_key, checked_at = excluded.checked_at`,
  ).run(u.guid, u.name, u.teamKey, u.checkedAt);
}

export function getUser(db: DatabaseSync, guid: string): User | null {
  const r = db.prepare("SELECT * FROM users WHERE guid = ?").get(guid) as Record<string, string | number | null> | undefined;
  if (!r) return null;
  return { guid: r.guid as string, name: r.name as string, teamKey: r.team_key as string | null, checkedAt: r.checked_at as number };
}
