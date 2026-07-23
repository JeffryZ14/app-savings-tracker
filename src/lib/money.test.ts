import { describe, it, expect } from "vitest";
import { round2, isTargetReached } from "@/lib/money";

describe("round2", () => {
  it("redondea a 2 decimales", () => {
    expect(round2(1.005)).toBe(1.0); // punto flotante: 1.005 -> 1
    expect(round2(1.239)).toBe(1.24);
    expect(round2(10)).toBe(10);
    expect(round2(0.1 + 0.2)).toBe(0.3);
  });
});

describe("isTargetReached", () => {
  it("es falso si no hay objetivo (target <= 0)", () => {
    expect(isTargetReached(100, 0)).toBe(false);
    expect(isTargetReached(0, 0)).toBe(false);
  });

  it("es verdadero cuando el saldo alcanza o supera el objetivo", () => {
    expect(isTargetReached(100, 100)).toBe(true);
    expect(isTargetReached(150, 100)).toBe(true);
  });

  it("es falso cuando falta para el objetivo", () => {
    expect(isTargetReached(99, 100)).toBe(false);
  });

  it("tolera diferencias por redondeo de punto flotante", () => {
    expect(isTargetReached(99.9999, 100)).toBe(true);
    expect(isTargetReached(99.99, 100)).toBe(false);
  });
});
