"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
} from "recharts";
import "./AllocationDonut.css";

export interface AllocationDonutGoal {
  id: string;
  title: string;
  allocationPct: number;
}

export interface AllocationDonutProps {
  goals: AllocationDonutGoal[];
  monthlyRate: number;
  formatSoles: (n: number) => string;
}

// Sensible hex fallbacks matching the light-theme token defaults, used when
// getComputedStyle returns an empty string (e.g. during SSR-less first paint).
const CHART_FALLBACKS: Record<string, string> = {
  "--chart-1": "#0F5C41",
  "--chart-2": "#B8863B",
  "--chart-3": "#2C7A7B",
  "--chart-4": "#B4472F",
  "--chart-5": "#6B4E9E",
  "--chart-6": "#3E7C4F",
  "--neutral": "#8A8F88",
};

const TOKEN_KEYS = Object.keys(CHART_FALLBACKS);

function readTokens(): Record<string, string> {
  if (typeof window === "undefined") {
    return { ...CHART_FALLBACKS };
  }
  const cs = getComputedStyle(document.documentElement);
  const out: Record<string, string> = {};
  for (const key of TOKEN_KEYS) {
    const val = cs.getPropertyValue(key).trim();
    out[key] = val || CHART_FALLBACKS[key];
  }
  return out;
}

function chartColor(tokens: Record<string, string>, index: number): string {
  const key = `--chart-${(index % 6) + 1}`;
  return tokens[key] || CHART_FALLBACKS[key];
}

interface Slice {
  id: string;
  name: string;
  pct: number; // share used to size the slice
  displayPct: number; // original allocation % for labels/tooltip
  color: string;
  isRemainder: boolean;
}

export default function AllocationDonut({
  goals,
  monthlyRate,
  formatSoles,
}: AllocationDonutProps) {
  const [tokens, setTokens] = useState<Record<string, string>>(CHART_FALLBACKS);
  const [reducedMotion, setReducedMotion] = useState(false);

  // Resolve CSS custom properties to hex at runtime; re-read on theme change.
  useEffect(() => {
    setTokens(readTokens());

    const root = document.documentElement;
    const observer = new MutationObserver(() => setTokens(readTokens()));
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });

    const colorScheme = window.matchMedia("(prefers-color-scheme: dark)");
    const onScheme = () => setTokens(readTokens());
    colorScheme.addEventListener("change", onScheme);

    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onMotion = () => setReducedMotion(motion.matches);
    setReducedMotion(motion.matches);
    motion.addEventListener("change", onMotion);

    return () => {
      observer.disconnect();
      colorScheme.removeEventListener("change", onScheme);
      motion.removeEventListener("change", onMotion);
    };
  }, []);

  const activeGoals = useMemo(
    () => goals.filter((g) => g.allocationPct > 0),
    [goals]
  );

  const totalPct = useMemo(
    () => activeGoals.reduce((sum, g) => sum + g.allocationPct, 0),
    [activeGoals]
  );

  const overAllocated = totalPct > 100;

  const slices = useMemo<Slice[]>(() => {
    const result: Slice[] = activeGoals.map((g, i) => ({
      id: g.id,
      name: g.title,
      pct: g.allocationPct,
      displayPct: g.allocationPct,
      color: chartColor(tokens, i),
      isRemainder: false,
    }));

    if (totalPct < 100) {
      result.push({
        id: "__unassigned__",
        name: "Sin asignar",
        pct: 100 - totalPct,
        displayPct: 100 - totalPct,
        color: tokens["--neutral"] || CHART_FALLBACKS["--neutral"],
        isRemainder: true,
      });
    }

    return result;
  }, [activeGoals, totalPct, tokens]);

  const isEmpty = activeGoals.length === 0;

  const ariaLabel = useMemo(() => {
    if (isEmpty) {
      return "Aún no repartes tu ahorro mensual entre metas.";
    }
    const parts = activeGoals.map(
      (g) => `${g.title} ${g.allocationPct}%`
    );
    return `Distribución del ahorro mensual entre metas: ${parts.join(", ")}.`;
  }, [activeGoals, isEmpty]);

  if (isEmpty) {
    return (
      <div className="donut-card">
        <div className="donut-empty">
          <div className="donut-empty-icon" aria-hidden="true">
            ○
          </div>
          <p className="donut-empty-text">
            Aún no repartes tu ahorro mensual entre metas.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="donut-card">
      <div className="donut-body">
        <div className="donut-chart-wrap" role="img" aria-label={ariaLabel}>
          <div className="donut-chart">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={slices}
                  dataKey="pct"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius="62%"
                  outerRadius="90%"
                  paddingAngle={slices.length > 1 ? 1.5 : 0}
                  stroke="none"
                  startAngle={90}
                  endAngle={-270}
                  isAnimationActive={!reducedMotion}
                >
                  {slices.map((slice) => (
                    <Cell key={slice.id} fill={slice.color} />
                  ))}
                </Pie>
                <Tooltip
                  content={
                    <DonutTooltip
                      monthlyRate={monthlyRate}
                      formatSoles={formatSoles}
                    />
                  }
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="donut-center" aria-hidden="true">
            <span className="donut-center-label">Ahorro mensual</span>
            <span className="donut-center-value">{formatSoles(monthlyRate)}</span>
          </div>
        </div>

        <ul className="donut-legend">
          {slices.map((slice) => (
            <li key={slice.id} className="donut-legend-item">
              <span
                className="donut-legend-dot"
                style={{ backgroundColor: slice.color }}
                aria-hidden="true"
              />
              <span className="donut-legend-name" title={slice.name}>
                {slice.name}
              </span>
              <span className="donut-legend-pct">{slice.displayPct}%</span>
            </li>
          ))}
        </ul>
      </div>

      {overAllocated && (
        <p className="donut-warning" role="status">
          Asignación supera 100%
        </p>
      )}
    </div>
  );
}

interface DonutTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: Slice }>;
  monthlyRate: number;
  formatSoles: (n: number) => string;
}

function DonutTooltip({
  active,
  payload,
  monthlyRate,
  formatSoles,
}: DonutTooltipProps) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }
  const slice = payload[0].payload;
  const amount = Math.round((monthlyRate * slice.displayPct) / 100);

  return (
    <div className="donut-tooltip">
      <div className="donut-tooltip-name">{slice.name}</div>
      <div className="donut-tooltip-row">
        <span className="donut-tooltip-pct">{slice.displayPct}%</span>
        <span className="donut-tooltip-amount">{formatSoles(amount)}</span>
      </div>
    </div>
  );
}
