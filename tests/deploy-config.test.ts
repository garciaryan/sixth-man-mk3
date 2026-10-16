import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

test("fly.toml mounts the data volume and runs one suspending machine", () => {
  const fly = read("fly.toml");
  assert.match(fly, /app = 'sixth-man'/);
  assert.match(fly, /destination = '\/data'/);
  assert.match(fly, /DATA_DIR = '\/data'/);
  assert.match(fly, /auto_stop_machines = 'suspend'/);
  assert.match(fly, /path = '\/api\/health'/);
});

test("the nightly cron posts to /api/sync with the token", () => {
  const cron = read(".github/workflows/sync-cron.yml");
  assert.match(cron, /cron: '0 10 \* \* \*'/);
  assert.match(cron, /secrets\.SYNC_TOKEN/);
  assert.match(cron, /vars\.APP_URL/);
  assert.match(cron, /\/api\/sync/);
});

test("the image is Node 24 running the standalone server", () => {
  const docker = read("Dockerfile");
  assert.match(docker, /FROM node:24-slim/);
  assert.match(docker, /\.next\/standalone/);
});
