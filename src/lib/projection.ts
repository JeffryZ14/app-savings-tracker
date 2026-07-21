function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

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
