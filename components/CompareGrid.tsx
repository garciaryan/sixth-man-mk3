import type { CompareRow } from "@/lib/view/compare.ts";
import type { Player } from "@/lib/yahoo/parse.ts";
import { fmt } from "@/lib/format.ts";
import { Sparkline } from "./Sparkline.tsx";

const GROUPS: { id: CompareRow["group"]; title: string; digits: number }[] = [
  { id: "fpts", title: "Fantasy points per game", digits: 1 },
  { id: "stats", title: "Per game", digits: 1 },
  { id: "points", title: "Fantasy points per game, by stat", digits: 2 },
];

export function CompareGrid({ columns, rows, spark, windowLabel }: { columns: Player[]; rows: CompareRow[]; spark: number[][]; windowLabel: string }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th />
            {columns.map((p) => (
              <th key={p.playerKey} className="num" style={{ verticalAlign: "bottom" }}>
                <a href={`/player/${p.playerKey}`} style={{ color: "var(--text)", fontSize: "0.95rem" }}>{p.name}</a>
                {p.injuryStatus && <span className="badge">{p.injuryStatus}</span>}
                <div className="muted" style={{ fontWeight: 400 }}>{p.nbaTeam} · {p.positions.join(", ")}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="muted" style={{ fontSize: "0.8rem" }}>Last 15 games</td>
            {spark.map((s, i) => <td key={i} className="num"><Sparkline values={s} label={`${columns[i].name}, last ${s.length} games`} /></td>)}
          </tr>
          {GROUPS.map((g) => [
            <tr key={g.id}>
              <th colSpan={columns.length + 1} style={{ paddingTop: 16 }}>
                {g.title}{g.id === "fpts" ? "" : ` · ${windowLabel}`}
              </th>
            </tr>,
            ...rows.filter((r) => r.group === g.id).map((r) => (
              <tr key={`${g.id}-${r.label}`}>
                <td title={r.title}>{r.label}</td>
                {r.values.map((v, i) => <td key={i} className={`num${r.best === i && columns.length > 1 ? " best" : ""}`}>{fmt(v, g.digits)}</td>)}
              </tr>
            )),
          ])}
        </tbody>
      </table>
    </div>
  );
}
