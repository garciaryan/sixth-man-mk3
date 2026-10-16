// Saves real Yahoo responses into tests/fixtures/, replacing the hand-made ones.
// Needs .env.local and a local admin connection (sign in once with `npm run dev`). Usage: npm run capture [date]
import { writeFileSync } from "node:fs";
import path from "node:path";
import { openDb } from "../lib/db.ts";
import { readEnv } from "../lib/env.ts";
import { leagueKeyFor } from "../lib/setup.ts";
import { createClient } from "../lib/yahoo/client.ts";
import { parsePlayers } from "../lib/yahoo/parse.ts";
import { yesterday } from "../lib/dates.ts";

const env = readEnv(process.env);
const db = openDb(path.join(process.env.DATA_DIR ?? "./data", "sixth.db"));
const leagueKey = leagueKeyFor(db, env.leagueKey);
if (!leagueKey) throw new Error("No league yet: set LEAGUE_KEY or pick one on /settings.");
const client = createClient({ db, cfg: { clientId: env.clientId, clientSecret: env.clientSecret, redirectUri: env.redirectUri } });
const date = process.argv[2] ?? yesterday(new Date());

const save = (name: string, json: unknown) => {
  writeFileSync(new URL(`../tests/fixtures/${name}.json`, import.meta.url), `${JSON.stringify(json, null, 1)}\n`);
  console.log(`saved ${name}.json`);
};

save("user-leagues", await client.get("/users;use_login=1/games;game_codes=nba/leagues"));
save("user-teams", await client.get("/users;use_login=1/games;game_codes=nba/teams"));
save("league-settings", await client.get(`/league/${leagueKey}/settings`));
save("league-teams", await client.get(`/league/${leagueKey}/teams`));
const players = await client.get(`/league/${leagueKey}/players;status=T;start=0;count=25;out=ownership`);
save("league-players", players);
const keys = parsePlayers(players as Record<string, any>).map((p) => p.playerKey).join(",");
save("player-stats-date", await client.get(`/league/${leagueKey}/players;player_keys=${keys}/stats;type=date;date=${date}`));
save("player-points-season", await client.get(`/league/${leagueKey}/players;player_keys=${keys}/stats;type=season`));
console.log("Now run npm test: the cross-check compares our points with Yahoo's.");
