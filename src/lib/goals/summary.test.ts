import { describe, it, expect } from "vitest";
import { limaMonthKey, computeMonthlySummary, type DepositLike } from "@/lib/goals/summary";

// Referencia fija: 2026-07-15 12:00 UTC (mediodía en Lima, sin ambigüedad de borde de mes).
const NOW = Date.parse("2026-07-15T12:00:00.000Z");

function dep(amount: number, iso: string, extra: Partial<DepositLike> = {}): DepositLike {
  return { amount, createdAt: iso, type: "deposit", ...extra };
}

describe("limaMonthKey", () => {
  it("agrupa por mes calendario de Lima (UTC-5)", () => {
    // 2026-08-01 03:00 UTC = 2026-07-31 22:00 en Lima -> sigue siendo julio.
    const julio = limaMonthKey("2026-08-01T03:00:00.000Z");
    // 2026-08-01 12:00 UTC = 2026-08-01 07:00 en Lima -> agosto.
    const agosto = limaMonthKey("2026-08-01T12:00:00.000Z");
    expect(agosto - julio).toBe(1);
  });
});

describe("computeMonthlySummary", () => {
  it("suma los depósitos del mes en curso", () => {
    const movs = [
      dep(100, "2026-07-02T12:00:00.000Z"),
      dep(50, "2026-07-20T12:00:00.000Z"),
      dep(999, "2026-06-10T12:00:00.000Z"),
    ];
    const { currentMonth } = computeMonthlySummary(movs, NOW);
    expect(currentMonth).toBe(150);
  });

  it("excluye retiros y depósitos semilla (isInitial)", () => {
    const movs = [
      dep(100, "2026-07-02T12:00:00.000Z"),
      dep(500, "2026-07-03T12:00:00.000Z", { type: "withdrawal" }),
      dep(300, "2026-07-04T12:00:00.000Z", { isInitial: true }),
    ];
    const { currentMonth } = computeMonthlySummary(movs, NOW);
    expect(currentMonth).toBe(100);
  });

  it("devuelve la cantidad de meses pedida, índice 0 = mes actual", () => {
    const movs = [
      dep(100, "2026-07-02T12:00:00.000Z"),
      dep(80, "2026-06-02T12:00:00.000Z"),
    ];
    const { months } = computeMonthlySummary(movs, NOW, 12);
    expect(months).toHaveLength(12);
    expect(months[0]).toEqual({ year: 2026, month: 6, total: 100 }); // julio (mes 6)
    expect(months[1]).toEqual({ year: 2026, month: 5, total: 80 }); // junio
    expect(months[2].total).toBe(0);
  });

  it("cruza el límite de año correctamente", () => {
    const janNow = Date.parse("2026-01-15T12:00:00.000Z");
    const movs = [dep(40, "2025-12-10T12:00:00.000Z")];
    const { months } = computeMonthlySummary(movs, janNow, 3);
    expect(months[0]).toEqual({ year: 2026, month: 0, total: 0 });
    expect(months[1]).toEqual({ year: 2025, month: 11, total: 40 });
  });
});
