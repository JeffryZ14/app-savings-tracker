/** Redondeo a 2 decimales, punto único de verdad para toda la app (antes duplicado
 * en projection.ts, goals/actions.ts y debts/actions.ts). */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Una meta está completa si tiene objetivo (>0) y el saldo lo alcanza (con tolerancia
 * de centésima para evitar falsos negativos por redondeo de punto flotante). */
export function isTargetReached(currentAmount: number, targetAmount: number): boolean {
  return (
    targetAmount > 0 &&
    (currentAmount >= targetAmount || Math.abs(currentAmount - targetAmount) < 0.001)
  );
}
