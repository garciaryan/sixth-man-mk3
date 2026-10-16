// League scoring math. Pure: no network, fs or DB.

export type StatMap = Record<string, number>;
export type GameRow = { date: string; stats: StatMap };
export type Aggregate = { gp: number; totals: StatMap; perGame: StatMap; fpts: number; fptsPerGame: number | null };

/** Fantasy points for a stat line. Stats without a modifier score nothing. */
export function fantasyPoints(stats: StatMap, modifiers: StatMap): number {
  let total = 0;
  for (const [id, mod] of Object.entries(modifiers)) total += (stats[id] ?? 0) * mod;
  return total;
}

/** Totals, per-game averages and fantasy points over the games inside `range` (inclusive). */
export function aggregate(games: GameRow[], range: { from: string; to: string }, modifiers: StatMap): Aggregate {
  const totals: StatMap = {};
  let gp = 0;
  for (const g of games) {
    if (g.date < range.from || g.date > range.to) continue;
    gp++;
    for (const [id, v] of Object.entries(g.stats)) totals[id] = (totals[id] ?? 0) + v;
  }
  const perGame: StatMap = {};
  if (gp > 0) for (const [id, v] of Object.entries(totals)) perGame[id] = v / gp;
  const fpts = fantasyPoints(totals, modifiers);
  return { gp, totals, perGame, fpts, fptsPerGame: gp > 0 ? fpts / gp : null };
}

/** Index of the best value, ignoring nulls; null when every value is null. */
export function bestIndex(values: (number | null)[], lowerIsBetter: boolean): number | null {
  let best: number | null = null;
  values.forEach((v, i) => {
    if (v === null) return;
    const cur = best === null ? null : values[best]!;
    if (cur === null || (lowerIsBetter ? v < cur : v > cur)) best = i;
  });
  return best;
}
