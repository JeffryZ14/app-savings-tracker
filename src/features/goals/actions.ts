"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withDb, readOnly, newId, type Movement, type MovementType, type Goal } from "@/lib/db/store";

export type { MovementType };

const GoalSchema = z.object({
  title: z.string().min(1, "El nombre es requerido").max(120),
  icon: z.string().max(10).optional(),
  description: z.string().max(500).optional(),
  targetAmount: z.number().min(0),
  targetDate: z.string().optional(),
});

const MovementSchema = z.object({
  amount: z.number().positive("El monto debe ser positivo"),
  type: z.enum(["deposit", "withdrawal"]).optional(),
  description: z.string().max(300).optional(),
});

const MovementUpdateSchema = z.object({
  amount: z.number().positive("El monto debe ser positivo"),
  type: z.enum(["deposit", "withdrawal"]),
  description: z.string().max(300).optional(),
});

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function computeIsCompleted(currentAmount: number, targetAmount: number): boolean {
  return targetAmount > 0 && (currentAmount >= targetAmount || Math.abs(currentAmount - targetAmount) < 0.001);
}

function isActiveForAllocation(g: Goal): boolean {
  return g.targetAmount > 0 && !g.isCompleted;
}

// Reparte `total` (entero) entre `count` casillas en enteros lo más parejo posible,
// sumando siempre exactamente `total` — método de mayor resto, sin decimales.
function splitIntegerEvenly(total: number, count: number): number[] {
  if (count <= 0) return [];
  const base = Math.floor(total / count);
  const remainder = total - base * count;
  return Array.from({ length: count }, (_, i) => base + (i < remainder ? 1 : 0));
}

// Reparte el ahorro mensual entre metas activas: las que tienen % manual lo conservan;
// el resto (100 - suma de manuales) se divide en enteros lo más parejo posible entre las que no lo tienen.
function computeAllocations(goals: Goal[]): Map<string, { pct: number; manual: boolean }> {
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
    map.set(g.id, g.allocationPct !== null
      ? { pct: g.allocationPct, manual: true }
      : { pct: autoSplit[autoIdx++], manual: false });
  }
  return map;
}

export async function createGoal(data: {
  title: string;
  icon?: string;
  description?: string;
  targetAmount: number;
  targetDate?: string | null;
}) {
  try {
    const goalData = GoalSchema.parse(data);
    const goal = await withDb((db) => {
      const g = {
        id: newId(),
        title: goalData.title,
        icon: goalData.icon ?? "⭐",
        description: goalData.description ?? null,
        targetAmount: goalData.targetAmount,
        currentAmount: 0,
        targetDate: goalData.targetDate ? new Date(goalData.targetDate + "T12:00:00").toISOString() : null,
        isCompleted: false,
        createdAt: new Date().toISOString(),
        movements: [] as Movement[],
        allocationPct: null,
      };
      db.goals.unshift(g);
      return g;
    });
    revalidatePath("/");
    return { success: true, goal };
  } catch (error) {
    console.error("Error creating goal:", error);
    if (error instanceof z.ZodError) {
      return { success: false, error: error.errors[0].message };
    }
    return { success: false, error: "Error al crear la meta" };
  }
}

export async function updateGoal(id: string, data: {
  title?: string;
  icon?: string;
  description?: string;
  targetAmount?: number;
  targetDate?: string | null;
  allocationPct?: number | null;
}) {
  try {
    const result = await withDb((db) => {
      const g = db.goals.find((x) => x.id === id);
      if (!g) return { error: "Meta no encontrada" as const };

      if (data.allocationPct !== undefined) {
        if (data.allocationPct !== null) {
          // Enteros únicamente: así el resto se reparte siempre en enteros exactos, sin decimales.
          if (!Number.isInteger(data.allocationPct) || data.allocationPct < 0 || data.allocationPct > 100) {
            return { error: "El porcentaje debe ser un entero entre 0 y 100" as const };
          }
          const sumOthers = db.goals
            .filter((x) => x.id !== id && isActiveForAllocation(x) && x.allocationPct !== null)
            .reduce((s, x) => s + (x.allocationPct ?? 0), 0);
          if (sumOthers + data.allocationPct > 100) {
            return { error: "La suma de porcentajes asignados no puede superar 100%" as const };
          }
        }
        g.allocationPct = data.allocationPct;
      }

      if (data.title !== undefined) g.title = data.title;
      if (data.icon !== undefined) g.icon = data.icon;
      if (data.description !== undefined) g.description = data.description;
      if (data.targetAmount !== undefined) g.targetAmount = data.targetAmount;
      if (data.targetDate !== undefined) {
        g.targetDate = data.targetDate ? new Date(data.targetDate + "T12:00:00").toISOString() : null;
      }
      g.isCompleted = computeIsCompleted(round2(g.currentAmount), round2(g.targetAmount));
      return { goal: g };
    });
    if ("error" in result) return { success: false, error: result.error };
    revalidatePath("/");
    return { success: true, goal: result.goal };
  } catch (error) {
    console.error("Error updating goal:", error);
    return { success: false, error: "Error al actualizar la meta" };
  }
}

export async function deleteGoal(id: string) {
  try {
    await withDb((db) => {
      db.goals = db.goals.filter((g) => g.id !== id);
    });
    revalidatePath("/");
    return { success: true };
  } catch (error) {
    console.error("Error deleting goal:", error);
    return { success: false, error: "Error al eliminar la meta" };
  }
}

export async function addMovement(goalId: string, data: {
  amount: number;
  type?: "deposit" | "withdrawal";
  description?: string;
}) {
  try {
    const movementData = MovementSchema.parse(data);
    const movementType = (movementData.type ?? "deposit") as MovementType;

    const result = await withDb((db) => {
      const goal = db.goals.find((g) => g.id === goalId);
      if (!goal) return { error: "Meta no encontrada" as const };

      if (movementType === "withdrawal" && movementData.amount > goal.currentAmount) {
        return { error: "No puedes retirar más del monto actual disponible" as const };
      }

      const newCurrentAmount =
        movementType === "deposit"
          ? goal.currentAmount + movementData.amount
          : goal.currentAmount - movementData.amount;

      const newCurrentRounded = round2(newCurrentAmount);
      const targetRounded = round2(goal.targetAmount);

      const movement: Movement = {
        id: newId(),
        amount: movementData.amount,
        type: movementType,
        description: movementData.description ?? null,
        createdAt: new Date().toISOString(),
      };

      goal.movements.unshift(movement);
      goal.currentAmount = newCurrentRounded;
      goal.isCompleted = computeIsCompleted(newCurrentRounded, targetRounded);

      return { movement, currentAmount: newCurrentRounded };
    });

    if ("error" in result) {
      return { success: false, error: result.error };
    }

    revalidatePath("/");
    return { success: true, movement: result.movement, currentAmount: result.currentAmount };
  } catch (error) {
    console.error("Error adding movement:", error);
    if (error instanceof z.ZodError) {
      return { success: false, error: error.errors[0].message };
    }
    return { success: false, error: "Error al registrar el movimiento" };
  }
}

export async function updateMovement(goalId: string, movementId: string, data: {
  amount: number;
  type: MovementType;
  description?: string;
}) {
  try {
    const movementData = MovementUpdateSchema.parse(data);

    const result = await withDb((db) => {
      const goal = db.goals.find((g) => g.id === goalId);
      if (!goal) return { error: "Meta no encontrada" as const };

      const movement = goal.movements.find((m) => m.id === movementId);
      if (!movement) return { error: "Movimiento no encontrado" as const };

      const reversed =
        movement.type === "deposit"
          ? goal.currentAmount - movement.amount
          : goal.currentAmount + movement.amount;

      const newCurrentAmount =
        movementData.type === "deposit" ? reversed + movementData.amount : reversed - movementData.amount;

      const newCurrentRounded = round2(newCurrentAmount);
      if (newCurrentRounded < 0) {
        return { error: "El movimiento resultaría en un saldo negativo" as const };
      }

      movement.amount = movementData.amount;
      movement.type = movementData.type;
      movement.description = movementData.description ?? null;

      goal.currentAmount = newCurrentRounded;
      goal.isCompleted = computeIsCompleted(newCurrentRounded, round2(goal.targetAmount));

      return { movement, currentAmount: newCurrentRounded };
    });

    if ("error" in result) {
      return { success: false, error: result.error };
    }

    revalidatePath("/");
    return { success: true, movement: result.movement, currentAmount: result.currentAmount };
  } catch (error) {
    console.error("Error updating movement:", error);
    if (error instanceof z.ZodError) {
      return { success: false, error: error.errors[0].message };
    }
    return { success: false, error: "Error al actualizar el movimiento" };
  }
}

export async function deleteMovement(goalId: string, movementId: string) {
  try {
    const result = await withDb((db) => {
      const goal = db.goals.find((g) => g.id === goalId);
      if (!goal) return { error: "Meta no encontrada" as const };

      const idx = goal.movements.findIndex((m) => m.id === movementId);
      if (idx === -1) return { error: "Movimiento no encontrado" as const };

      const movement = goal.movements[idx];
      const newCurrentAmount =
        movement.type === "deposit"
          ? goal.currentAmount - movement.amount
          : goal.currentAmount + movement.amount;

      const newCurrentRounded = round2(newCurrentAmount);
      if (newCurrentRounded < 0) {
        return { error: "No se puede eliminar: resultaría en un saldo negativo" as const };
      }

      goal.movements.splice(idx, 1);
      goal.currentAmount = newCurrentRounded;
      goal.isCompleted = computeIsCompleted(newCurrentRounded, round2(goal.targetAmount));

      return { currentAmount: newCurrentRounded };
    });

    if ("error" in result) {
      return { success: false, error: result.error };
    }

    revalidatePath("/");
    return { success: true, currentAmount: result.currentAmount };
  } catch (error) {
    console.error("Error deleting movement:", error);
    return { success: false, error: "Error al eliminar el movimiento" };
  }
}

export async function getMovements(goalId: string, offset: number, limit: number = 10) {
  try {
    const safeOffset = Math.max(0, Math.floor(offset) || 0);
    const safeLimit = Math.min(50, Math.max(1, Math.floor(limit) || 10));

    const db = await readOnly();
    const goal = db.goals.find((g) => g.id === goalId);
    if (!goal) return { success: false, error: "Meta no encontrada" };

    const sorted = goal.movements.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    const page = sorted.slice(safeOffset, safeOffset + safeLimit).map((m) => ({
      id: m.id,
      amount: round2(m.amount),
      type: m.type,
      description: m.description,
      createdAt: m.createdAt,
    }));

    return {
      success: true,
      movements: page,
      total: sorted.length,
      hasMore: safeOffset + safeLimit < sorted.length,
    };
  } catch (error) {
    console.error("Error fetching movements:", error);
    return { success: false, error: "Error al obtener movimientos" };
  }
}

export async function getGoals() {
  try {
    const db = await readOnly();
    const allocations = computeAllocations(db.goals);
    const goalsPlain = [...db.goals]
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .map((g) => ({
        id: g.id,
        title: g.title,
        icon: g.icon,
        description: g.description,
        targetAmount: round2(g.targetAmount),
        currentAmount: round2(g.currentAmount),
        targetDate: g.targetDate,
        isCompleted: g.isCompleted,
        createdAt: g.createdAt,
        allocationPct: allocations.get(g.id)?.pct ?? 0,
        allocationManual: allocations.get(g.id)?.manual ?? false,
        movements: g.movements
          .slice()
          .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
          .slice(0, 10)
          .map((m) => ({
            id: m.id,
            amount: round2(m.amount),
            type: m.type,
            description: m.description,
            createdAt: m.createdAt,
          })),
      }));

    return { success: true, goals: goalsPlain };
  } catch (error) {
    console.error("Error fetching goals:", error);
    return { success: false, error: "Error al obtener las metas" };
  }
}

export async function getGoalById(id: string) {
  try {
    const db = await readOnly();
    const goal = db.goals.find((g) => g.id === id);
    if (!goal) {
      return { success: false, error: "Meta no encontrada" };
    }

    const allocation = computeAllocations(db.goals).get(goal.id);
    const goalPlain = {
      id: goal.id,
      title: goal.title,
      icon: goal.icon,
      description: goal.description,
      targetAmount: round2(goal.targetAmount),
      currentAmount: round2(goal.currentAmount),
      targetDate: goal.targetDate,
      isCompleted: goal.isCompleted,
      createdAt: goal.createdAt,
      allocationPct: allocation?.pct ?? 0,
      allocationManual: allocation?.manual ?? false,
      movements: goal.movements
        .slice()
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .map((m) => ({
          id: m.id,
          amount: round2(m.amount),
          type: m.type,
          description: m.description,
          createdAt: m.createdAt,
        })),
    };

    return { success: true, goal: goalPlain };
  } catch (error) {
    console.error("Error fetching goal:", error);
    return { success: false, error: "Error al obtener la meta" };
  }
}

export async function getMonthlySummary() {
  try {
    const db = await readOnly();

    // Los movimientos se guardan en UTC pero el usuario es de Lima (UTC-5, sin DST).
    // Agrupamos por mes calendario de Lima para no misatribuir depósitos cerca del
    // límite de mes cuando el servidor corre en UTC.
    const LIMA_OFFSET_MS = 5 * 60 * 60 * 1000;
    const ymKey = (iso: string) => {
      const l = new Date(new Date(iso).getTime() - LIMA_OFFSET_MS);
      return l.getUTCFullYear() * 12 + l.getUTCMonth();
    };

    const deposits = db.goals.flatMap((g) =>
      g.movements
        .filter((m) => m.type === "deposit")
        .map((m) => ({ amount: m.amount, key: ymKey(m.createdAt) }))
    );

    const nowLima = new Date(Date.now() - LIMA_OFFSET_MS);
    const curKey = nowLima.getUTCFullYear() * 12 + nowLima.getUTCMonth();

    const currentMonth = deposits
      .filter((m) => m.key === curKey)
      .reduce((sum, m) => sum + m.amount, 0);

    const months: { year: number; month: number; total: number }[] = [];
    for (let i = 0; i < 6; i++) {
      const key = curKey - i;
      const total = deposits
        .filter((m) => m.key === key)
        .reduce((sum, m) => sum + m.amount, 0);
      months.push({ year: Math.floor(key / 12), month: key % 12, total: round2(total) });
    }

    return {
      success: true,
      currentMonth: round2(currentMonth),
      months,
    };
  } catch (error) {
    console.error("Error fetching monthly summary:", error);
    return { success: false, error: "Error al obtener resumen mensual" };
  }
}

export async function updateGoalTarget(id: string, targetAmount: number) {
  try {
    const goal = await withDb((db) => {
      const g = db.goals.find((x) => x.id === id);
      if (!g) return null;
      g.targetAmount = round2(targetAmount);
      g.isCompleted = computeIsCompleted(round2(g.currentAmount), g.targetAmount);
      return g;
    });
    if (!goal) return { success: false, error: "Meta no encontrada" };
    revalidatePath("/");
    return { success: true, goal };
  } catch (error) {
    console.error("Error updating goal target:", error);
    return { success: false, error: "Error al actualizar el objetivo" };
  }
}

export async function getMonthlyRate() {
  try {
    const db = await readOnly();
    return { success: true, monthlyRate: db.monthlyRate ?? 1421 };
  } catch (error) {
    console.error("Error getting monthly rate:", error);
    return { success: false, monthlyRate: 1421 };
  }
}

export async function updateMonthlyRate(rate: number) {
  try {
    if (rate <= 0) return { success: false, error: "La tasa debe ser mayor a 0" };
    await withDb((db) => {
      db.monthlyRate = round2(rate);
    });
    revalidatePath("/");
    return { success: true, monthlyRate: rate };
  } catch (error) {
    console.error("Error updating monthly rate:", error);
    return { success: false, error: "Error al actualizar la tasa mensual" };
  }
}
