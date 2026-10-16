// Calendar dates as ISO `YYYY-MM-DD` strings, in the NBA's home timezone. Pure.

export type WindowId = "season" | "l7" | "l14" | "l30";
export const WINDOWS: WindowId[] = ["season", "l7", "l14", "l30"];
export const WINDOW_LABELS: Record<WindowId, string> = { season: "Season", l7: "Last 7", l14: "Last 14", l30: "Last 30" };
const WINDOW_DAYS: Record<Exclude<WindowId, "season">, number> = { l7: 7, l14: 14, l30: 30 };

const nyDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });

/** Today's date in New York. */
export function today(now: Date): string {
  return nyDate.format(now);
}

/** Adds whole days to an ISO date. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Yesterday in New York: the last date whose games are final. */
export function yesterday(now: Date): string {
  return addDays(today(now), -1);
}

export function isWindowId(v: unknown): v is WindowId {
  return typeof v === "string" && (WINDOWS as string[]).includes(v);
}

/** Inclusive date range for a window, ending yesterday and never starting before the season. */
export function windowRange(id: WindowId, now: Date, seasonStart: string): { from: string; to: string } {
  const to = yesterday(now);
  if (id === "season") return { from: seasonStart, to };
  const from = addDays(to, -(WINDOW_DAYS[id] - 1));
  return { from: from < seasonStart ? seasonStart : from, to };
}
