import "./StatTile.css";

export type StatTileAccent = "brand" | "gold" | "negative" | "neutral";

export interface StatTileProps {
  /** Small uppercase caption above the value. */
  label: string;
  /** The primary figure. Rendered in the mono/tabular font. */
  value: string;
  /** Optional secondary line beneath the value. */
  sub?: React.ReactNode;
  /** Tints the value color and the top accent bar. */
  accent?: StatTileAccent;
  /** Optional small icon rendered in a chip at the top. */
  icon?: React.ReactNode;
}

/**
 * Presentational KPI stat tile. Pure — no client hooks, safe in Server or
 * Client Components. Colors come exclusively from global CSS custom properties,
 * so light/dark are handled automatically.
 */
export default function StatTile({
  label,
  value,
  sub,
  accent,
  icon,
}: StatTileProps) {
  const className = accent
    ? `stat-tile stat-tile--${accent}`
    : "stat-tile";

  return (
    <div className={className}>
      {accent ? <span className="stat-tile__bar" aria-hidden="true" /> : null}
      {icon ? <span className="stat-tile__icon" aria-hidden="true">{icon}</span> : null}
      <span className="stat-tile__label">{label}</span>
      <span className="stat-tile__value">{value}</span>
      {sub != null ? <span className="stat-tile__sub">{sub}</span> : null}
    </div>
  );
}
