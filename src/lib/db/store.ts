import { promises as fs } from "fs";
import path from "path";

export type MovementType = "deposit" | "withdrawal";

export interface Movement {
  id: string;
  amount: number;
  type: MovementType;
  description: string | null;
  createdAt: string;
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
}

export interface DebtPayment {
  id: string;
  amount: number;
  description: string | null;
  createdAt: string;
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

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

async function ensureFile(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(DB_FILE);
  } catch {
    const empty: DbShape = { goals: [], debts: [], monthlyRate: 1421 };
    await fs.writeFile(DB_FILE, JSON.stringify(empty, null, 2), "utf-8");
  }
}

async function readDb(): Promise<DbShape> {
  await ensureFile();
  const raw = await fs.readFile(DB_FILE, "utf-8");
  try {
    const parsed = JSON.parse(raw) as DbShape;
    return {
      goals: (parsed.goals ?? []).map((g) => ({ ...g, allocationPct: g.allocationPct ?? null })),
      debts: parsed.debts ?? [],
      monthlyRate: parsed.monthlyRate ?? 1421,
    };
  } catch {
    return { goals: [], debts: [], monthlyRate: 1421 };
  }
}

async function writeDb(db: DbShape): Promise<void> {
  const tmp = DB_FILE + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(db, null, 2), "utf-8");
  await fs.rename(tmp, DB_FILE);
}

// Serializa todas las escrituras para evitar carreras (single-process Node).
let writeQueue: Promise<unknown> = Promise.resolve();

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const result = writeQueue.then(fn, fn);
  writeQueue = result.catch(() => {});
  return result;
}

export function withDb<T>(fn: (db: DbShape) => T | Promise<T>): Promise<T> {
  return enqueue(async () => {
    const db = await readDb();
    const result = await fn(db);
    await writeDb(db);
    return result;
  });
}

export async function readOnly(): Promise<DbShape> {
  return readDb();
}

export { newId };
