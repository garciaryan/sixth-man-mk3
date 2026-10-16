# Sixth Man — Design

Date: 2026-10-16. Status: draft for review.

## Purpose

A web app for the managers of one Yahoo Fantasy Basketball league to compare NBA players using **that league's
scoring values** (a points league). It answers "who is better for *our* scoring, over which recent stretch?" for
pickups, trades and start/sit decisions.

**Success:** a league manager signs in with Yahoo on a phone, filters the ranked table to free agents over the last
14 days, picks 2–4 players, and sees a side-by-side comparison whose fantasy points match what Yahoo would award.

**Users:** members of one configured league only. One of them (the owner, Ryan) is the admin.

## Decisions

| Topic | Decision |
|---|---|
| Stack | Next.js App Router + TypeScript, Node's built-in test runner, same conventions as `mint-condition` |
| Hosting | Fly.io, one machine, SQLite on a volume at `/data` (`DATA_DIR`), suspends when idle. Never more than one machine. |
| Data source | Yahoo Fantasy Sports API only (OAuth 2.0) |
| Access | "Sign in with Yahoo"; only managers of `LEAGUE_KEY` get in |
| Data strategy | Nightly sync of per-game stats into SQLite; pages read only SQLite |
| Scoring | Computed at read time by a pure function from the league's stat modifiers |
| Windows | Season, Last 7, Last 14, Last 30 days |

## Configuration (env / Fly secrets)

- `YAHOO_CLIENT_ID`, `YAHOO_CLIENT_SECRET` — one Yahoo developer app (scopes: OpenID + Fantasy Sports read).
- `APP_URL` — public HTTPS origin; the OAuth redirect is `${APP_URL}/api/auth/callback`.
- `LEAGUE_KEY` — e.g. `466.l.12345`. Optional until the admin picks it in Settings; the env value wins when set.
- `ADMIN_YAHOO_GUID` — the admin's Yahoo GUID.
- `SESSION_SECRET` — from env, else generated once into `DATA_DIR/session-secret` (as in mint-condition).
- `SYNC_TOKEN` — bearer token for `POST /api/sync` (used by the GitHub cron).

Local development uses HTTPS (`next dev --experimental-https`), because Yahoo requires HTTPS redirect URIs.

## Architecture

### Authentication and access

1. `/login` → "Sign in with Yahoo" → Yahoo OAuth 2.0 authorize (`openid fspt-r`, random `state` in a short-lived cookie).
2. `/api/auth/callback` exchanges the code, reads the user's GUID (ID token / userinfo), then calls
   `users;use_login=1/games;game_codes=nba/leagues` **with that user's token**.
3. If `LEAGUE_KEY` is in the result: upsert `users(guid, name, team_key, checked_at)` and set a signed session cookie
   holding the GUID. Otherwise redirect to `/denied` ("This app is for members of <league name>").
4. If the GUID equals `ADMIN_YAHOO_GUID`, its tokens are stored in `yahoo_auth` as the **service connection**.
   Every other user's tokens are discarded after the membership check.
5. Middleware gate (pure `gate()` function, as in mint-condition): public paths are `/login`, `/denied`,
   `/api/auth/*`, `/api/health`, and `/api/sync` (which checks `SYNC_TOKEN` itself). Everything else needs a valid
   session. `/settings` and `/api/admin/*` also need the admin GUID.
6. Membership is re-checked when `users.checked_at` is older than 24 hours: the session is cleared and the user signs
   in again (re-running step 2).

Before the admin has connected and a league is set, signed-in admin is redirected to `/settings`; anyone else sees
"Not set up yet".

### Yahoo client (`lib/yahoo/`)

- One shared client: ~1 request/second throttle, JSON format (`?format=json`), backoff on 429/5xx (3 tries).
- Service-token refresh when the access token has under 5 minutes left; refresh failure marks the connection
  `needs_reconnect` and stops sync.
- Parsers turn Yahoo's nested JSON into plain typed objects. Parsing is pure and fixture-tested.

### Sync (`lib/sync/`)

Each step is idempotent and writes in one transaction.

1. **League settings** (daily): stat categories, `stat_modifiers` (stat ID → points), roster positions, league name,
   season start/end dates → `league_settings` (one row, JSON columns).
2. **Teams** (daily): team key, name, manager GUIDs → `teams`.
3. **Players** (daily): all players in the league context, paged 25 at a time, with ownership
   (`players;out=ownership`) → `players(player_key, name, nba_team, positions, injury_status, owner_team_key)`.
4. **Game logs** (per date): for each date from `sync_state.last_date + 1` to yesterday (US/Eastern), request
   `league/{key}/players;player_keys=…/stats;type=date;date=D` in batches of 25. Rows with no minutes played are
   skipped. Store `game_stats(player_key, date, stat_id, value)` and commit the date together with
   `sync_state.last_date = D`. The first run backfills from the season start.
5. Each run writes a `sync_runs(started_at, finished_at, status, dates_synced, error)` row.

**Triggers:**
- GitHub Actions cron at 10:00 UTC → `POST /api/sync` with `Authorization: Bearer $SYNC_TOKEN` (wakes the machine).
- Catch-up: on any request, if `sync_state.last_date` is before yesterday and no sync is running, start the
  in-process worker (single flight, started from `instrumentation.ts`).
- Admin "Sync now" button on `/settings`.

### Scoring (`lib/scoring.ts`, pure)

- `fantasyPoints(stats: Record<statId, number>, modifiers: Record<statId, number>): number`.
- `aggregate(games, window, today)` → `{ gp, totals, perGame, fpts, fptsPerGame }` for Season / L7 / L14 / L30
  (calendar days ending yesterday, inclusive).
- Only stats with a modifier count toward points. Display-only categories (e.g. FG%) are computed from their
  makes/attempts components, not averaged.
- `bestIndex(values, lowerIsBetter)` for comparison highlighting. A stat is lower-is-better when its modifier is
  negative (e.g. turnovers).

### Pages

- **`/players` (home):** ranked by fantasy points per game. Filters: window, ownership (All / Free agents / My team /
  a specific team), position, minimum GP, name search. All filters live in the URL query. Columns: rank, player (NBA
  team, positions, injury badge), owner, GP, FP/G, total FP, each scoring stat per game; every column sorts. On narrow
  screens only GP and FP/G show, with an expand toggle. Row checkboxes (max 4) → "Compare".
- **`/compare?p=k1,k2,…` (2–4 players):** one column per player. Rows: FP/G for each window; each scoring stat per
  game for the selected window; contribution (stat per game × modifier). Best value per row highlighted. Sparkline of
  each player's last 15 games' fantasy points.
- **`/player/[key]`:** game log (date, opponent if available, raw stats, game FP) and the per-window summary.
- **`/settings` (admin only):** Connect / Reconnect Yahoo, league picker (admin's NBA leagues this season), sync
  status (last synced date, backfill progress, last run and error), "Sync now", read-only scoring modifiers.
- **`/login`, `/denied`.**
- Every page shows "Stats through <date>" and, when sync is paused, a banner saying so.

### Data model (SQLite, numbered migrations)

```
yahoo_auth(id=1, guid, access_token, refresh_token, expires_at, status)
users(guid PK, name, team_key, checked_at)
league_settings(id=1, league_key, name, season, start_date, end_date, stat_categories_json, modifiers_json, updated_at)
teams(team_key PK, name, manager_guids_json)
players(player_key PK, name, nba_team, positions_json, injury_status, owner_team_key, updated_at)
game_stats(player_key, date, stat_id, value, PRIMARY KEY(player_key, date, stat_id))
sync_state(id=1, last_date)
sync_runs(id PK, started_at, finished_at, status, dates_synced, error)
```

## Error handling

- Service token revoked or refresh fails → `yahoo_auth.status = 'needs_reconnect'`, sync stops, Settings shows
  "Reconnect Yahoo", every page shows "Stats last updated <date>; sync paused."
- Yahoo 429/5xx → backoff and retry; after retries, the run ends with an error and `sync_state` stays at the last
  complete date, so the next run resumes.
- Yahoo down → pages keep working from SQLite.
- League scoring changed → picked up by the daily settings refresh; history is rescored automatically.
- OAuth failures (bad `state`, consent declined, token exchange error) → `/login?error=<code>` with a readable
  message. Nothing is written until membership is confirmed.
- Yahoo data is never sent to the browser beyond what the pages render; tokens never leave the server.

## Testing

- Node test runner (`node --experimental-strip-types --test`), as in mint-condition.
- Unit tests for pure code: `fantasyPoints`, `aggregate`, ranking/filtering/sorting, `bestIndex`, `gate`, sessions.
- Yahoo parsers and the sync loop tested against saved JSON fixtures (no network): pagination past 25, resume from
  `sync_state`, token refresh, error paths.
- Cross-check: computed points equal Yahoo's `player_points` in a fixture captured from the real league.
- CI (GitHub Actions): test, typecheck, build on every PR and push. Deploy-on-merge to Fly comes after v1 works.

## Out of scope for v1

Trade evaluator, projections, last-N-games windows, notifications, multiple leagues, category (roto/H2H-cats)
leagues.

## Open items to confirm during implementation

- Exact Yahoo stat IDs and whether per-date stats include minutes for every player (verified against real responses
  when the first fixtures are captured; the zero-minutes skip falls back to "all stats zero" if not).
