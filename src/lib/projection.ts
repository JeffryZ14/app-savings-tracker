import { round2 } from "@/lib/money";

function addMonthsToNow(months: number): Date {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d;
}

function formatMonthYear(d: Date): string {
  return d.toLocaleDateString("es-PE", { month: "short", year: "numeric" });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric" });
}

function diffInMonthsCeil(target: Date, from: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  const days = (target.getTime() - from.getTime()) / msPerDay;
  return Math.ceil(days / 30.44);
}

export interface ProjectionResult {
  mode: "none" | "pace-only" | "target-date";
  paceMonths: number | null;
  paceLabel: string | null;
  targetDateLabel?: string;
  monthsUntilTarget?: number;
  requiredMonthly?: number;
  onTrack?: boolean;
}

export function calculateProjection(
  goal: { targetAmount: number; currentAmount: number; targetDate: string | null },
  monthlyRate: number
): ProjectionResult | null {
  if (goal.targetAmount <= 0) return null;
  const remaining = Math.max(0, goal.targetAmount - goal.currentAmount);
  if (remaining <= 0) return null;

  const paceMonths = monthlyRate > 0 ? Math.ceil(remaining / monthlyRate) : null;
  const paceDate = paceMonths !== null ? addMonthsToNow(paceMonths) : null;
  const paceLabel = paceDate ? formatMonthYear(paceDate) : null;

  if (!goal.targetDate) {
    return { mode: paceMonths !== null ? "pace-only" : "none", paceMonths, paceLabel };
  }

  const monthsUntilTarget = Math.max(1, diffInMonthsCeil(new Date(goal.targetDate), new Date()));
  const requiredMonthly = round2(remaining / monthsUntilTarget);
  const onTrack = monthlyRate >= requiredMonthly - 0.01;

  return {
    mode: "target-date",
    paceMonths,
    paceLabel,
    targetDateLabel: formatDate(goal.targetDate),
    monthsUntilTarget,
    requiredMonthly,
    onTrack,
  };
}

export interface PortfolioGoalInput {
  id: string;
  currentAmount: number;
  targetAmount: number;
  isCompleted: boolean;
  allocationPct: number;
  allocationManual: boolean;
}

export interface PortfolioProjection {
  completionMonth: number | null;
  completionLabel: string | null;
}

const PORTFOLIO_SIM_MAX_MONTHS = 600; // tope de 50 años, evita loop infinito si la tasa no alcanza

// Simula mes a mes el reparto real de `computeAllocations` (server): las metas manuales
// conservan su % fijo, el resto se divide entre las metas auto que sigan activas. A medida
// que cada meta llega a su objetivo, sale del reparto y su % libera espacio para las demás —
// así el "estimado" de una meta refleja que se acelera cuando otra meta se completa antes,
// en vez de asumir el % de asignación de hoy constante para siempre.
export function simulatePortfolio(
  goals: PortfolioGoalInput[],
  monthlyRate: number
): Map<string, PortfolioProjection> {
  const results = new Map<string, PortfolioProjection>();

  const state = goals
    .filter((g) => g.targetAmount > 0 && !g.isCompleted && g.currentAmount < g.targetAmount)
    .map((g) => ({
      id: g.id,
      current: g.currentAmount,
      target: g.targetAmount,
      manualPct: g.allocationManual ? g.allocationPct : null,
    }));

  if (monthlyRate <= 0 || state.length === 0) {
    for (const g of state) results.set(g.id, { completionMonth: null, completionLabel: null });
    return results;
  }

  const remainingIds = new Set(state.map((g) => g.id));
  let month = 0;
  while (remainingIds.size > 0 && month < PORTFOLIO_SIM_MAX_MONTHS) {
    month++;
    const active = state.filter((g) => remainingIds.has(g.id));

    const manualActive = active.filter((g) => g.manualPct !== null);
    const sumManual = manualActive.reduce((s, g) => s + (g.manualPct ?? 0), 0);
    const autoActive = active.filter((g) => g.manualPct === null);
    const remainingPct = Math.max(0, 100 - sumManual);
    const autoEach = autoActive.length > 0 ? remainingPct / autoActive.length : 0;

    for (const g of active) {
      const pct = g.manualPct !== null ? g.manualPct : autoEach;
      g.current += monthlyRate * (pct / 100);
      if (g.current >= g.target - 0.01) {
        remainingIds.delete(g.id);
        results.set(g.id, { completionMonth: month, completionLabel: formatMonthYear(addMonthsToNow(month)) });
      }
    }
  }

  for (const g of state) {
    if (!results.has(g.id)) results.set(g.id, { completionMonth: null, completionLabel: null });
  }
  return results;
}
