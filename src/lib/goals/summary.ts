import { round2 } from "@/lib/money";
import { MONTHS_OF_HISTORY } from "@/lib/constants";

// Lima es UTC-5 sin horario de verano. Los movimientos se guardan en UTC; agrupamos por
// mes calendario de Lima para no misatribuir depósitos cerca del límite de mes cuando el
// servidor corre en UTC.
const LIMA_OFFSET_MS = 5 * 60 * 60 * 1000;

/** Clave numérica monótona de mes (año*12+mes) en zona horaria de Lima. */
export function limaMonthKey(iso: string): number {
  const l = new Date(new Date(iso).getTime() - LIMA_OFFSET_MS);
  return l.getUTCFullYear() * 12 + l.getUTCMonth();
}

/** Clave de mes de Lima para un instante dado (por defecto ahora). */
export function limaMonthKeyNow(now: number = Date.now()): number {
  const l = new Date(now - LIMA_OFFSET_MS);
  return l.getUTCFullYear() * 12 + l.getUTCMonth();
}

export interface DepositLike {
  amount: number;
  type: "deposit" | "withdrawal";
  createdAt: string;
  isInitial?: boolean;
}

export interface MonthlySummary {
  currentMonth: number;
  months: { year: number; month: number; total: number }[];
}

/** Resume los depósitos (excluye retiros y semillas iniciales) por mes de Lima: total del
 * mes en curso más los últimos `monthsCount` meses (índice 0 = mes actual). */
export function computeMonthlySummary(
  movements: DepositLike[],
  now: number = Date.now(),
  monthsCount: number = MONTHS_OF_HISTORY
): MonthlySummary {
  const deposits = movements
    .filter((m) => m.type === "deposit" && !m.isInitial)
    .map((m) => ({ amount: m.amount, key: limaMonthKey(m.createdAt) }));

  const curKey = limaMonthKeyNow(now);
  const totalFor = (key: number) =>
    deposits.filter((m) => m.key === key).reduce((sum, m) => sum + m.amount, 0);

  const months: { year: number; month: number; total: number }[] = [];
  for (let i = 0; i < monthsCount; i++) {
    const key = curKey - i;
    months.push({ year: Math.floor(key / 12), month: key % 12, total: round2(totalFor(key)) });
  }

  return { currentMonth: round2(totalFor(curKey)), months };
}
