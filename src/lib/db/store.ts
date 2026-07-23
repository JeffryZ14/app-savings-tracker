import path from "path";
import { DEFAULT_MONTHLY_RATE } from "@/lib/constants";
import { JsonFileStore } from "@/lib/db/jsonFileStore";
import type { DataStore } from "@/lib/db/dataStore";

export type MovementType = "deposit" | "withdrawal";

export interface Movement {
  id: string;
  amount: number;
  type: MovementType;
  description: string | null;
  createdAt: string;
  /** Marca el depósito semilla al crear la meta (plata ya ahorrada antes de usar la app) —
   * se excluye del resumen mensual para no aparentar que se ahorró este mes. */
  isInitial?: boolean;
}

export interface Goal {
  id: string;
  title: string;
  icon: string;
  description: string | null;
  targetAmount: number;
  currentAmount: number;
  targetDate: string | null;
  isCompleted: boolean;
  createdAt: string;
  movements: Movement[];
  /** % manual del ahorro mensual asignado a esta meta (0-100). null = reparto automático entre metas activas. */
  allocationPct: number | null;
  /** Categoría libre para agrupar/filtrar metas (viaje, emergencia, ...). null = sin categorizar. */
  category: string | null;
}

export interface DebtPayment {
  id: string;
  amount: number;
  description: string | null;
  createdAt: string;
  /** Si el pago se aplicó como depósito a una meta (feature "deuda como aporte").
   * Se guarda el título además del id porque la meta puede borrarse después y el
   * historial de la deuda debe seguir mostrando a qué se aplicó. */
  appliedToGoalId?: string | null;
  appliedToGoalTitle?: string | null;
}

export interface Debt {
  id: string;
  person: string;
  concept: string | null;
  amount: number;
  payments: DebtPayment[];
  createdAt: string;
  isSettled: boolean;
}

export interface DbShape {
  goals: Goal[];
  debts: Debt[];
  monthlyRate: number;
}

export const DEFAULT_DB: DbShape = { goals: [], debts: [], monthlyRate: DEFAULT_MONTHLY_RATE };

/** Normaliza un DbShape recién parseado: rellena campos que pueden faltar en archivos viejos
 * (compatibilidad hacia atrás — ver CLAUDE.md, "keep this pattern for any future field additions"). */
export function normalizeDb(parsed: Partial<DbShape>): DbShape {
  return {
    goals: (parsed.goals ?? []).map((g) => ({
      ...g,
      allocationPct: g.allocationPct ?? null,
      category: g.category ?? null,
    })),
    debts: parsed.debts ?? [],
    monthlyRate: parsed.monthlyRate ?? DEFAULT_MONTHLY_RATE,
  };
}

function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

// Punto único de creación del backend de persistencia. Hoy solo existe JsonFileStore (archivo
// plano, adecuado al volumen actual — ver CLAUDE.md). El resto del módulo programa contra la
// interfaz DataStore, así que cambiar de backend (p.ej. a SQLite si el histórico crece mucho)
// es sustituir esta función sin tocar las Server Actions que consumen withDb/readOnly.
function createStore(): DataStore {
  return new JsonFileStore(DATA_DIR, DB_FILE);
}

const store: DataStore = createStore();

// Serializa todas las escrituras para evitar carreras (single-process Node).
let writeQueue: Promise<unknown> = Promise.resolve();

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const result = writeQueue.then(fn, fn);
  writeQueue = result.catch(() => {});
  return result;
}

export function withDb<T>(fn: (db: DbShape) => T | Promise<T>): Promise<T> {
  return enqueue(async () => {
    const db = await store.read();
    const result = await fn(db);
    await store.write(db);
    return result;
  });
}

export async function readOnly(): Promise<DbShape> {
  return store.read();
}

export { newId };
