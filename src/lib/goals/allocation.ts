import type { Goal } from "@/lib/db/store";

/** Una meta participa del reparto del ahorro mensual si tiene objetivo y no está completa. */
export function isActiveForAllocation(g: Pick<Goal, "targetAmount" | "isCompleted">): boolean {
  return g.targetAmount > 0 && !g.isCompleted;
}

/** Reparte `total` (entero) entre `count` casillas en enteros lo más parejo posible,
 * sumando siempre exactamente `total` — método de mayor resto, sin decimales. */
export function splitIntegerEvenly(total: number, count: number): number[] {
  if (count <= 0) return [];
  const base = Math.floor(total / count);
  const remainder = total - base * count;
  return Array.from({ length: count }, (_, i) => base + (i < remainder ? 1 : 0));
}

/** Reparte el ahorro mensual entre metas activas: las que tienen % manual lo conservan;
 * el resto (100 - suma de manuales) se divide en enteros lo más parejo posible entre las
 * que no lo tienen. */
export function computeAllocations(
  goals: Goal[]
): Map<string, { pct: number; manual: boolean }> {
  const active = goals.filter(isActiveForAllocation);
  const manualActive = active.filter((g) => g.allocationPct !== null);
  const sumManual = manualActive.reduce((s, g) => s + (g.allocationPct ?? 0), 0);
  const autoActive = active.filter((g) => g.allocationPct === null);
  const remainingPct = Math.max(0, 100 - sumManual);
  const autoSplit = splitIntegerEvenly(remainingPct, autoActive.length);

  const map = new Map<string, { pct: number; manual: boolean }>();
  let autoIdx = 0;
  for (const g of goals) {
    if (!isActiveForAllocation(g)) {
      map.set(g.id, { pct: 0, manual: g.allocationPct !== null });
      continue;
    }
    map.set(
      g.id,
      g.allocationPct !== null
        ? { pct: g.allocationPct, manual: true }
        : { pct: autoSplit[autoIdx++], manual: false }
    );
  }
  return map;
}

/** Suma de porcentajes manuales de las demás metas activas — para validar que al fijar un
 * nuevo % manual la suma no supere 100. */
export function sumOtherManualPct(goals: Goal[], excludeId: string): number {
  return goals
    .filter((x) => x.id !== excludeId && isActiveForAllocation(x) && x.allocationPct !== null)
    .reduce((s, x) => s + (x.allocationPct ?? 0), 0);
}
