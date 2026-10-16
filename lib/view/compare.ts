// Side-by-side comparison of 2–4 players. Pure.
import { WINDOWS, WINDOW_LABELS, windowRange, type WindowId } from "../dates.ts";
import { aggregate, bestIndex, fantasyPoints, type GameRow, type StatMap } from "../scoring.ts";
import type { Category, Player } from "../yahoo/parse.ts";

export const MIN_COMPARE = 2;
export const MAX_COMPARE = 4;
const SPARK_GAMES = 15;

export type CompareRow = { group: "fpts" | "stats" | "points"; label: string; title?: string; values: (number | null)[]; best: number | null };

/** `p` is the raw query value: missing, one string, or several (`?p=a&p=b`). */
export function parseCompareKeys(p: string | string[] | null | undefined): { keys: string[] } | { error: "too_few" | "too_many" } {
  const raw = Array.isArray(p) ? p.join(",") : p ?? "";
  const keys = [...new Set(raw.split(",").map((k) => k.trim()).filter(Boolean))];
  if (keys.length < MIN_COMPARE) return { error: "too_few" };
  if (keys.length > MAX_COMPARE) return { error: "too_many" };
  return { keys };
}

export function buildCompare(
  input: { players: Player[]; games: Map<string, GameRow[]>; modifiers: StatMap; categories: Category[]; now: Date; seasonStart: string },
  keys: string[],
  window: WindowId,
): { columns: Player[]; rows: CompareRow[]; unknown: string[]; spark: number[][] } {
  const byKey = new Map(input.players.map((p) => [p.playerKey, p]));
  const columns = keys.map((k) => byKey.get(k)).filter((p): p is Player => !!p);
  const unknown = keys.filter((k) => !byKey.has(k));
  const gamesOf = (p: Player) => input.games.get(p.playerKey) ?? [];
  const agg = (w: WindowId) => columns.map((p) => aggregate(gamesOf(p), windowRange(w, input.now, input.seasonStart), input.modifiers));
  const row = (group: CompareRow["group"], label: string, values: (number | null)[], lowerIsBetter = false, title?: string): CompareRow =>
    ({ group, label, title, values, best: bestIndex(values, lowerIsBetter) });

  const rows: CompareRow[] = WINDOWS.map((w) => row("fpts", WINDOW_LABELS[w], agg(w).map((a) => a.fptsPerGame)));
  const sel = agg(window);
  const scoring = input.categories.filter((c) => input.modifiers[c.statId] !== undefined);
  const perGame = (statId: string) => sel.map((a) => (a.gp === 0 ? null : a.perGame[statId] ?? 0));
  for (const c of scoring) rows.push(row("stats", c.display, perGame(c.statId), input.modifiers[c.statId] < 0, c.name));
  for (const c of scoring) {
    const mod = input.modifiers[c.statId];
    rows.push(row("points", `${c.display} points`, perGame(c.statId).map((v) => (v === null ? null : v * mod)), false, `${c.name} per game × ${mod}`));
  }

  const to = windowRange("season", input.now, input.seasonStart).to;
  const spark = columns.map((p) => gamesOf(p).filter((g) => g.date <= to).slice(-SPARK_GAMES).map((g) => fantasyPoints(g.stats, input.modifiers)));
  return { columns, rows, unknown, spark };
}
