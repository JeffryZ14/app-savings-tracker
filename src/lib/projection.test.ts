import { describe, it, expect } from "vitest";
import { calculateProjection, simulatePortfolio, type PortfolioGoalInput } from "@/lib/projection";

describe("calculateProjection", () => {
  it("devuelve null si no hay objetivo o ya está cumplido", () => {
    expect(calculateProjection({ targetAmount: 0, currentAmount: 0, targetDate: null }, 100)).toBeNull();
    expect(calculateProjection({ targetAmount: 100, currentAmount: 100, targetDate: null }, 100)).toBeNull();
  });

  it("modo pace-only: estima meses según la tasa mensual", () => {
    const r = calculateProjection({ targetAmount: 1000, currentAmount: 0, targetDate: null }, 250)!;
    expect(r.mode).toBe("pace-only");
    expect(r.paceMonths).toBe(4);
  });

  it("modo none si la tasa es 0", () => {
    const r = calculateProjection({ targetAmount: 1000, currentAmount: 0, targetDate: null }, 0)!;
    expect(r.mode).toBe("none");
    expect(r.paceMonths).toBeNull();
  });

  it("modo target-date: marca onTrack cuando la tasa alcanza lo requerido", () => {
    const future = new Date();
    future.setMonth(future.getMonth() + 10);
    const r = calculateProjection(
      { targetAmount: 1000, currentAmount: 0, targetDate: future.toISOString() },
      200
    )!;
    expect(r.mode).toBe("target-date");
    expect(r.onTrack).toBe(true);
  });

  it("modo target-date: onTrack falso si la tasa no alcanza", () => {
    const future = new Date();
    future.setMonth(future.getMonth() + 2);
    const r = calculateProjection(
      { targetAmount: 1000, currentAmount: 0, targetDate: future.toISOString() },
      100
    )!;
    expect(r.onTrack).toBe(false);
    expect(r.requiredMonthly).toBeGreaterThan(100);
  });
});

describe("simulatePortfolio", () => {
  function g(partial: Partial<PortfolioGoalInput> & { id: string }): PortfolioGoalInput {
    return {
      id: partial.id,
      currentAmount: partial.currentAmount ?? 0,
      targetAmount: partial.targetAmount ?? 1000,
      isCompleted: partial.isCompleted ?? false,
      allocationPct: partial.allocationPct ?? 0,
      allocationManual: partial.allocationManual ?? false,
    };
  }

  it("una sola meta se completa en ceil(target/rate) meses", () => {
    const res = simulatePortfolio([g({ id: "a", targetAmount: 1000 })], 250);
    expect(res.get("a")?.completionMonth).toBe(4);
  });

  it("una meta que termina antes acelera a las demás (efecto cascada)", () => {
    // Dos metas auto: 50/50. La chica termina primero y libera su % a la grande.
    const res = simulatePortfolio(
      [
        g({ id: "chica", targetAmount: 500 }),
        g({ id: "grande", targetAmount: 5000 }),
      ],
      1000
    );
    const chica = res.get("chica")!.completionMonth!;
    const grande = res.get("grande")!.completionMonth!;
    // Sin cascada la grande tardaría 10 meses a 500/mes; con la aceleración termina antes.
    expect(grande).toBeLessThan(10);
    expect(chica).toBeLessThanOrEqual(grande);
  });

  it("completionMonth null si la tasa es 0", () => {
    const res = simulatePortfolio([g({ id: "a" })], 0);
    expect(res.get("a")?.completionMonth).toBeNull();
  });

  it("ignora metas ya completadas o sin objetivo", () => {
    const res = simulatePortfolio(
      [g({ id: "done", isCompleted: true }), g({ id: "noTarget", targetAmount: 0 })],
      500
    );
    expect(res.has("done")).toBe(false);
    expect(res.has("noTarget")).toBe(false);
  });
});
