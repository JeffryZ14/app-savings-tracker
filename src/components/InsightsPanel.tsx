"use client";

import { useMemo } from "react";
import { TrendingUp, TrendingDown, Award, Sparkles } from "lucide-react";
import { MONTH_LABELS } from "@/lib/constants";
import "./InsightsPanel.css";

interface MonthRow {
  year: number;
  month: number;
  total: number;
}

interface InsightsPanelProps {
  monthHistory: MonthRow[];
  formatSoles: (n: number) => string;
}

interface Insight {
  key: string;
  icon: React.ReactNode;
  text: React.ReactNode;
  tone: "up" | "down" | "neutral";
}

// Deriva insights puramente de `monthHistory` (ya cargado por getMonthlySummary, 12 meses
// incluyendo el actual en el índice 0) — sin server action nueva, todo cálculo es client-side.
function buildInsights(monthHistory: MonthRow[], formatSoles: (n: number) => string): Insight[] {
  const insights: Insight[] = [];
  if (monthHistory.length === 0) return insights;

  const current = monthHistory[0]?.total ?? 0;
  const last = monthHistory[1]?.total;

  if (last !== undefined) {
    if (last > 0) {
      const pct = ((current - last) / last) * 100;
      const up = pct >= 0;
      insights.push({
        key: "mom",
        icon: up ? <TrendingUp size={14} /> : <TrendingDown size={14} />,
        tone: up ? "up" : "down",
        text: up
          ? <>Ahorraste <strong>{pct.toFixed(0)}% más</strong> que el mes pasado</>
          : <>Ahorraste <strong>{Math.abs(pct).toFixed(0)}% menos</strong> que el mes pasado</>,
      });
    } else if (current > 0) {
      insights.push({
        key: "mom-start",
        icon: <Sparkles size={14} />,
        tone: "up",
        text: <>Empezaste a ahorrar este mes — el pasado no tuviste depósitos</>,
      });
    }
  }

  const priorMonths = monthHistory.slice(1).filter((m) => m.total > 0);
  if (priorMonths.length > 0) {
    const avg = priorMonths.reduce((s, m) => s + m.total, 0) / priorMonths.length;
    insights.push({
      key: "avg",
      icon: <Sparkles size={14} />,
      tone: "neutral",
      text: <>Tu promedio mensual es <strong>{formatSoles(avg)}</strong> ({priorMonths.length} {priorMonths.length === 1 ? "mes" : "meses"})</>,
    });
  }

  const withData = monthHistory.filter((m) => m.total > 0);
  if (withData.length > 0) {
    const best = withData.reduce((a, b) => (b.total > a.total ? b : a));
    const isCurrentBest = best === monthHistory[0] && current === best.total;
    insights.push({
      key: "best",
      icon: <Award size={14} />,
      tone: "neutral",
      text: isCurrentBest
        ? <>Este mes es tu <strong>mejor mes registrado</strong> hasta ahora</>
        : <>Tu mejor mes fue <strong>{MONTH_LABELS[best.month]} {best.year}</strong> con {formatSoles(best.total)}</>,
    });
  }

  return insights;
}

export default function InsightsPanel({ monthHistory, formatSoles }: InsightsPanelProps) {
  const insights = useMemo(() => buildInsights(monthHistory, formatSoles), [monthHistory, formatSoles]);

  if (insights.length === 0) return null;

  return (
    <div className="ins-card">
      <div className="ins-head">
        <Sparkles size={14} />
        <span>Insights</span>
      </div>
      <ul className="ins-list">
        {insights.map((i) => (
          <li key={i.key} className={"ins-item ins-" + i.tone}>
            <span className="ins-icon">{i.icon}</span>
            <span className="ins-text">{i.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
