/** Fantasy points over a player's recent games, oldest to newest. */
export function Sparkline({ values, label }: { values: number[]; label: string }) {
  if (values.length < 2) return <span className="muted" style={{ fontSize: "0.8rem" }}>Not enough games</span>;
  const w = 100, h = 24, pad = 2;
  const min = Math.min(...values, 0), max = Math.max(...values), span = max - min || 1;
  const pts = values.map((v, i) => `${(pad + (i * (w - 2 * pad)) / (values.length - 1)).toFixed(1)},${(h - pad - ((v - min) * (h - 2 * pad)) / span).toFixed(1)}`);
  const last = pts[pts.length - 1].split(",");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label}>
      <polyline points={pts.join(" ")} fill="none" stroke="var(--accent)" strokeWidth={1.5} strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r={2} fill="var(--accent)" />
    </svg>
  );
}
