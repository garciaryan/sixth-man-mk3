# Deploying Sixth Man

One Fly.io machine with SQLite on a volume, a Yahoo developer app for sign-in and data, and a GitHub Actions cron that
syncs stats nightly.

## 1. Register a Yahoo app

1. Go to https://developer.yahoo.com/apps/create/.
2. Application type: **Web Application**.
3. Redirect URI(s): `https://sixth-man.fly.dev/api/auth/callback`. For local development, also add
   `https://localhost:3000/api/auth/callback`. Yahoo only accepts HTTPS. If it refuses the localhost URI, develop
   against the deployed app instead.
4. API permissions: **OpenID Connect** (Profile) and **Fantasy Sports: Read**.
5. Note the **Client ID** and **Client Secret**.

## 2. Local development (optional)

1. `cp .env.example .env.local` and fill in `YAHOO_CLIENT_ID`, `YAHOO_CLIENT_SECRET`, `SYNC_TOKEN`
   (any long random string), and `APP_URL=https://localhost:3000`.
2. `npm run dev` (HTTPS with a self-signed certificate; accept the browser warning).
3. Sign in once. Your GUID is in the `users` table: `sqlite3 data/sixth.db "select guid, name from users"`.
   Put it in `ADMIN_YAHOO_GUID` and sign in again. That makes you admin and stores the Yahoo connection.
4. On `/settings`, pick your league. The first sync starts.
5. `npm run capture` saves real Yahoo responses into `tests/fixtures/`. Run `npm test` so the cross-check compares
   our points with Yahoo's, then commit the fixtures.

## 3. Create the Fly app

```bash
fly launch --no-deploy --copy-config --name sixth-man
fly volumes create sixth_data --size 1 --region sjc
fly secrets set YAHOO_CLIENT_ID=… YAHOO_CLIENT_SECRET=… APP_URL=https://sixth-man.fly.dev \
  ADMIN_YAHOO_GUID=… SYNC_TOKEN=$(openssl rand -hex 32)
fly deploy
```

`LEAGUE_KEY` is optional: set it to pin the league, or leave it unset and pick on `/settings`. `SESSION_SECRET` is
optional: without it, one is made on the volume at first boot.

Never scale past one machine (`fly scale count 1`).

## 4. Nightly sync

In the GitHub repo settings:
- Secret `SYNC_TOKEN`: the same value as the Fly secret.
- Variable `APP_URL`: `https://sixth-man.fly.dev`.

`.github/workflows/sync-cron.yml` runs at 10:00 UTC and can also be run by hand from the Actions tab. If a run is
missed, the first page visit afterwards catches up.

The first sync backfills every date since the season started, about one request per second per date. Mid-season that
can take long enough for Fly's auto-suspend to stop the machine part way, and `/settings` then shows the run as
interrupted. Nothing is lost: each run resumes at the first missing date. Press **Sync now** again until it finishes,
or set `min_machines_running = 1` in `fly.toml` and `fly deploy` for the backfill, then set it back to 0.

## 5. First sign-in

1. Open the app and sign in with Yahoo as the admin.
2. On `/settings`, check that the Yahoo connection is OK, pick the league, and wait for the sync to finish.
3. Ask a league mate to sign in. Anyone without a team in the league sees "Members only".
