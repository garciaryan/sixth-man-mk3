// Numbered schema migrations. Each step runs once, in order, tracked by `PRAGMA user_version`.
import type { DatabaseSync } from "node:sqlite";

export const migrations: string[] = [
  `CREATE TABLE yahoo_auth (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  guid TEXT NOT NULL, access_token TEXT NOT NULL, refresh_token TEXT NOT NULL,
  expires_at INTEGER NOT NULL,                       -- ms epoch
  status TEXT NOT NULL DEFAULT 'ok'                  -- 'ok' | 'needs_reconnect'
);
CREATE TABLE users (guid TEXT PRIMARY KEY, name TEXT NOT NULL, team_key TEXT, checked_at INTEGER NOT NULL);
CREATE TABLE league_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  league_key TEXT NOT NULL, name TEXT, season TEXT, start_date TEXT, end_date TEXT,
  stat_categories_json TEXT NOT NULL DEFAULT '[]', modifiers_json TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER                                 -- ms epoch; NULL = league picked but not synced yet
);
CREATE TABLE teams (team_key TEXT PRIMARY KEY, name TEXT NOT NULL, manager_guids_json TEXT NOT NULL);
CREATE TABLE players (
  player_key TEXT PRIMARY KEY, name TEXT NOT NULL, nba_team TEXT, positions_json TEXT NOT NULL,
  injury_status TEXT, owner_team_key TEXT, updated_at INTEGER NOT NULL
);
CREATE TABLE game_stats (
  player_key TEXT NOT NULL, date TEXT NOT NULL, stat_id TEXT NOT NULL, value REAL NOT NULL,
  PRIMARY KEY (player_key, date, stat_id)
);
CREATE INDEX game_stats_date ON game_stats(date);
CREATE TABLE sync_state (id INTEGER PRIMARY KEY CHECK (id = 1), last_date TEXT);
CREATE TABLE sync_runs (
  id INTEGER PRIMARY KEY, started_at INTEGER NOT NULL, finished_at INTEGER,
  status TEXT NOT NULL, dates_synced INTEGER NOT NULL DEFAULT 0, error TEXT
);`,
];

export function migrate(db: DatabaseSync, steps: string[]): number {
  const row = db.prepare("pragma user_version").get() as { user_version: number };
  let version = row.user_version;
  for (let i = version; i < steps.length; i++) {
    db.exec("BEGIN");
    try {
      db.exec(steps[i]);
      db.exec(`PRAGMA user_version = ${i + 1}`);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
    version = i + 1;
  }
  return version;
}
