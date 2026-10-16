"use client";
import { useState } from "react";

export type TableColumn = { key: string; label: string; title?: string; stat?: boolean };
export type TableRow = {
  rank: number; playerKey: string; name: string; meta: string; injury: string | null; owner: string;
  cells: Record<string, string>;
};

const MAX_COMPARE = 4;

/** The ranked table with up-to-4 compare checkboxes. Sorting links come from the server as `sortHref`. */
export function PlayerTable(props: {
  columns: TableColumn[]; rows: TableRow[]; sortHref: Record<string, string>; sort: string; dir: "asc" | "desc";
  window: string;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const [allCols, setAllCols] = useState(false);
  const toggle = (key: string) =>
    setPicked((p) => (p.includes(key) ? p.filter((k) => k !== key) : p.length < MAX_COMPARE ? [...p, key] : p));
  const arrow = (key: string) => (props.sort === key ? (props.dir === "desc" ? " ▼" : " ▲") : "");

  return (
    <>
      <div style={{ display: "flex", gap: 8, alignItems: "center", margin: "8px 0", flexWrap: "wrap" }}>
        <a
          className="button"
          aria-disabled={picked.length < 2}
          href={picked.length >= 2 ? `/compare?p=${picked.join(",")}&window=${props.window}` : undefined}
          style={picked.length < 2 ? { opacity: 0.5, pointerEvents: "none" } : undefined}
        >
          Compare {picked.length > 0 ? `(${picked.length})` : ""}
        </a>
        <span className="muted" style={{ fontSize: "0.85rem" }}>Pick 2–4 players.</span>
        <button className="button secondary" style={{ marginLeft: "auto", padding: "4px 10px" }} onClick={() => setAllCols((v) => !v)}>
          {allCols ? "Fewer columns" : "All columns"}
        </button>
      </div>
      <div className={`table-wrap${allCols ? " show-all" : ""}`}>
        <table>
          <thead>
            <tr>
              <th aria-label="Compare" />
              <th className="num">#</th>
              <th><a href={props.sortHref.name}>Player{arrow("name")}</a></th>
              <th className="col-stat">Owner</th>
              {props.columns.map((c) => (
                <th key={c.key} className={`num${c.stat ? " col-stat" : ""}`} title={c.title}>
                  <a href={props.sortHref[c.key]}>{c.label}{arrow(c.key)}</a>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {props.rows.map((r) => (
              <tr key={r.playerKey}>
                <td>
                  <input
                    type="checkbox" aria-label={`Compare ${r.name}`} checked={picked.includes(r.playerKey)}
                    disabled={!picked.includes(r.playerKey) && picked.length >= MAX_COMPARE}
                    onChange={() => toggle(r.playerKey)}
                  />
                </td>
                <td className="num muted">{r.rank}</td>
                <td>
                  <a href={`/player/${r.playerKey}`}>{r.name}</a>
                  {r.injury && <span className="badge">{r.injury}</span>}
                  <div className="muted" style={{ fontSize: "0.8rem" }}>{r.meta}</div>
                </td>
                <td className="col-stat" style={{ fontSize: "0.85rem" }}>{r.owner}</td>
                {props.columns.map((c) => (
                  <td key={c.key} className={`num${c.stat ? " col-stat" : ""}`}>{r.cells[c.key]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {props.rows.length === 0 && <p className="muted" style={{ padding: 16 }}>No players match these filters.</p>}
      </div>
    </>
  );
}
