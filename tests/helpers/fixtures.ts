import { readFileSync } from "node:fs";

export function fixture(name: string): any {
  return JSON.parse(readFileSync(new URL(`../fixtures/${name}.json`, import.meta.url), "utf8"));
}
