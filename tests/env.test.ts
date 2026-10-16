import { test } from "node:test";
import assert from "node:assert/strict";
import { readEnv } from "../lib/env.ts";

test("readEnv lists missing required values", () => {
  const e = readEnv({ APP_URL: "https://x.test/" });
  assert.equal(e.appUrl, "https://x.test");
  assert.equal(e.leagueKey, null);
  assert.deepEqual(e.missing, ["YAHOO_CLIENT_ID", "YAHOO_CLIENT_SECRET", "ADMIN_YAHOO_GUID", "SYNC_TOKEN"]);
});

test("readEnv reads every value", () => {
  const e = readEnv({
    APP_URL: "https://x.test", YAHOO_CLIENT_ID: "id", YAHOO_CLIENT_SECRET: "sec", ADMIN_YAHOO_GUID: "G",
    SYNC_TOKEN: "t", LEAGUE_KEY: " 466.l.1 ",
  });
  assert.deepEqual(e.missing, []);
  assert.equal(e.leagueKey, "466.l.1");
  assert.equal(e.redirectUri, "https://x.test/api/auth/callback");
});
