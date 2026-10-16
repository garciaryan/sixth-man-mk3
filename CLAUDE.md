# Sixth Man

A web app for the managers of one Yahoo Fantasy Basketball league (points scoring) to rank and compare NBA players
using that league's point values. Spec: `docs/superpowers/specs/2026-10-16-sixth-man-design.md`. Plan:
`docs/superpowers/plans/2026-10-16-sixth-man-v1.md`. Conventions follow `~/Projects/mint-condition`.

## Decisions already made
- Next.js App Router + TypeScript, `node:sqlite`, Node 24, Node's built-in test runner. Runtime dependencies are
  `next`, `react` and `react-dom` only.
- Fly.io, one machine (never more), SQLite at `${DATA_DIR}/sixth.db` on a volume at `/data`; suspends when idle.
- Access: "Sign in with Yahoo". Only managers of `LEAGUE_KEY` get in. `ADMIN_YAHOO_GUID` is the admin; only the
  admin's Yahoo tokens are stored (`yahoo_auth`), and they drive the sync. Other users' tokens are discarded after the
  membership check. Membership is re-checked every 24 hours.
- Data: a nightly sync stores per-player, per-date raw stats in `game_stats`. Pages read only SQLite. Triggers: GitHub
  Actions cron (`POST /api/sync` with `SYNC_TOKEN`), catch-up when the last synced date is before yesterday, and the
  admin's Sync now button. The sync is single flight and resumes from `sync_state.last_date`.
- Fantasy points are computed at read time by pure functions in `lib/scoring.ts` from the league's stat modifiers, so a
  scoring change rescores history. Windows: Season, L7, L14, L30 calendar days ending yesterday in `America/New_York`.
- Yahoo tokens and secrets never reach the browser. All Yahoo calls go through the throttled client in
  `lib/yahoo/client.ts` (at most 1 request/second, retries on 429/5xx).

## Commands
- `npm run dev` (HTTPS on https://localhost:3000; Yahoo requires HTTPS redirects)
- `npm test`, `npm run typecheck`, `npm run build`
- `npm run capture` saves real Yahoo responses into `tests/fixtures/` (needs a local admin connection)
