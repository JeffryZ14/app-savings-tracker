import { describe, it, expect } from "vitest";
import {
  splitIntegerEvenly,
  isActiveForAllocation,
  computeAllocations,
  sumOtherManualPct,
} from "@/lib/goals/allocation";
import type { Goal } from "@/lib/db/store";

function goal(partial: Partial<Goal> & { id: string }): Goal {
  return {
    id: partial.id,
    title: partial.title ?? "Meta",
    icon: "⭐",
    description: null,
    targetAmount: partial.targetAmount ?? 1000,
    currentAmount: partial.currentAmount ?? 0,
    targetDate: null,
    isCompleted: partial.isCompleted ?? false,
    createdAt: "2025-01-01T00:00:00.000Z",
    movements: [],
    allocationPct: partial.allocationPct ?? null,
  };
}

describe("splitIntegerEvenly", () => {
  it("reparte exacto y parejo, dando el resto a las primeras", () => {
    expect(splitIntegerEvenly(100, 3)).toEqual([34, 33, 33]);
    expect(splitIntegerEvenly(100, 4)).toEqual([25, 25, 25, 25]);
    expect(splitIntegerEvenly(10, 3)).toEqual([4, 3, 3]);
  });

  it("suma siempre el total", () => {
    const parts = splitIntegerEvenly(100, 7);
    expect(parts.reduce((s, n) => s + n, 0)).toBe(100);
  });

  it("devuelve [] si count <= 0", () => {
    expect(splitIntegerEvenly(100, 0)).toEqual([]);
  });
});

describe("isActiveForAllocation", () => {
  it("requiere objetivo > 0 y no completada", () => {
    expect(isActiveForAllocation({ targetAmount: 1000, isCompleted: false })).toBe(true);
    expect(isActiveForAllocation({ targetAmount: 0, isCompleted: false })).toBe(false);
    expect(isActiveForAllocation({ targetAmount: 1000, isCompleted: true })).toBe(false);
  });
});

describe("computeAllocations", () => {
  it("reparte 100% entre metas auto activas", () => {
    const goals = [goal({ id: "a" }), goal({ id: "b" }), goal({ id: "c" })];
    const map = computeAllocations(goals);
    expect(map.get("a")).toEqual({ pct: 34, manual: false });
    expect(map.get("b")).toEqual({ pct: 33, manual: false });
    expect(map.get("c")).toEqual({ pct: 33, manual: false });
  });

  it("respeta % manuales y reparte el resto entre las auto", () => {
    const goals = [
      goal({ id: "a", allocationPct: 50 }),
      goal({ id: "b" }),
      goal({ id: "c" }),
    ];
    const map = computeAllocations(goals);
    expect(map.get("a")).toEqual({ pct: 50, manual: true });
    expect(map.get("b")).toEqual({ pct: 25, manual: false });
    expect(map.get("c")).toEqual({ pct: 25, manual: false });
  });

  it("da 0% a metas completadas o sin objetivo", () => {
    const goals = [
      goal({ id: "a" }),
      goal({ id: "done", isCompleted: true }),
      goal({ id: "noTarget", targetAmount: 0 }),
    ];
    const map = computeAllocations(goals);
    expect(map.get("a")?.pct).toBe(100);
    expect(map.get("done")?.pct).toBe(0);
    expect(map.get("noTarget")?.pct).toBe(0);
  });

  it("no reparte nada extra si los manuales ya suman 100", () => {
    const goals = [
      goal({ id: "a", allocationPct: 60 }),
      goal({ id: "b", allocationPct: 40 }),
      goal({ id: "c" }),
    ];
    const map = computeAllocations(goals);
    expect(map.get("c")?.pct).toBe(0);
  });
});

describe("sumOtherManualPct", () => {
  it("suma los % manuales de las demás metas activas", () => {
    const goals = [
      goal({ id: "a", allocationPct: 30 }),
      goal({ id: "b", allocationPct: 20 }),
      goal({ id: "c" }),
    ];
    expect(sumOtherManualPct(goals, "c")).toBe(50);
    expect(sumOtherManualPct(goals, "a")).toBe(20);
  });
});
