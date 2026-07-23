"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withDb, readOnly, type DbShape } from "@/lib/db/store";
import { DEFAULT_MONTHLY_RATE } from "@/lib/constants";

const MovementSchema = z.object({
  id: z.string(),
  amount: z.number(),
  type: z.enum(["deposit", "withdrawal"]),
  description: z.string().nullable().optional().default(null),
  createdAt: z.string(),
  isInitial: z.boolean().optional(),
});

const GoalSchema = z.object({
  id: z.string(),
  title: z.string(),
  icon: z.string(),
  description: z.string().nullable().optional().default(null),
  category: z.string().nullable().optional().default(null),
  targetAmount: z.number(),
  currentAmount: z.number(),
  targetDate: z.string().nullable().optional().default(null),
  isCompleted: z.boolean(),
  createdAt: z.string(),
  movements: z.array(MovementSchema).default([]),
  allocationPct: z.number().nullable().optional().default(null),
});

const DebtPaymentSchema = z.object({
  id: z.string(),
  amount: z.number(),
  description: z.string().nullable().optional().default(null),
  createdAt: z.string(),
  appliedToGoalId: z.string().nullable().optional(),
  appliedToGoalTitle: z.string().nullable().optional(),
});

const DebtSchema = z.object({
  id: z.string(),
  person: z.string(),
  concept: z.string().nullable().optional().default(null),
  amount: z.number(),
  payments: z.array(DebtPaymentSchema).default([]),
  createdAt: z.string(),
  isSettled: z.boolean(),
});

const BackupSchema = z.object({
  goals: z.array(GoalSchema),
  debts: z.array(DebtSchema).default([]),
  monthlyRate: z.number().positive().default(DEFAULT_MONTHLY_RATE),
});

/** Devuelve el estado completo del store para descargar como respaldo. */
export async function exportBackup() {
  try {
    const db = await readOnly();
    return { success: true as const, data: db, exportedAt: new Date().toISOString() };
  } catch (error) {
    console.error("Error exporting backup:", error);
    return { success: false as const, error: "Error al exportar el respaldo" };
  }
}

/** Reemplaza TODO el store con el contenido de un respaldo previamente exportado.
 * Operación destructiva: valida la estructura con zod antes de escribir. */
export async function importBackup(payload: unknown) {
  try {
    const parsed = BackupSchema.parse(payload);
    const next: DbShape = {
      goals: parsed.goals.map((g) => ({
        ...g,
        description: g.description ?? null,
        category: g.category ?? null,
        targetDate: g.targetDate ?? null,
        allocationPct: g.allocationPct ?? null,
        movements: g.movements.map((m) => ({ ...m, description: m.description ?? null })),
      })),
      debts: parsed.debts.map((d) => ({
        ...d,
        concept: d.concept ?? null,
        payments: d.payments.map((p) => ({ ...p, description: p.description ?? null })),
      })),
      monthlyRate: parsed.monthlyRate,
    };
    await withDb((db) => {
      db.goals = next.goals;
      db.debts = next.debts;
      db.monthlyRate = next.monthlyRate;
    });
    revalidatePath("/");
    return { success: true as const, goals: next.goals.length, debts: next.debts.length };
  } catch (error) {
    console.error("Error importing backup:", error);
    if (error instanceof z.ZodError) {
      return { success: false as const, error: "El archivo no tiene un formato de respaldo válido" };
    }
    return { success: false as const, error: "Error al importar el respaldo" };
  }
}
