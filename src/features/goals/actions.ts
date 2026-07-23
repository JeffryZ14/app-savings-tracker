"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withDb, readOnly, newId, type Movement, type MovementType } from "@/lib/db/store";
import { round2, isTargetReached } from "@/lib/money";
import { DEFAULT_GOAL_ICON, DEFAULT_MONTHLY_RATE, MOVEMENTS_PAGE_SIZE } from "@/lib/constants";
import { computeAllocations, sumOtherManualPct } from "@/lib/goals/allocation";
import { computeMonthlySummary } from "@/lib/goals/summary";

export type { MovementType };

const GoalSchema = z.object({
  title: z.string().min(1, "El nombre es requerido").max(120),
  icon: z.string().max(10).optional(),
  description: z.string().max(500).optional(),
  targetAmount: z.number().min(0),
  targetDate: z.string().optional(),
  initialAmount: z.number().min(0).optional(),
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

// Alias local: el helper compartido `isTargetReached` es el "isCompleted" del dominio de metas.
const computeIsCompleted = isTargetReached;

export async function createGoal(data: {
  title: string;
  icon?: string;
  description?: string;
  targetAmount: number;
  targetDate?: string | null;
  initialAmount?: number;
}) {
  try {
    const goalData = GoalSchema.parse(data);
    const initialAmount = round2(goalData.initialAmount ?? 0);
    const goal = await withDb((db) => {
      const now = new Date().toISOString();
      const movements: Movement[] = [];
      if (initialAmount > 0) {
        movements.push({
          id: newId(),
          amount: initialAmount,
          type: "deposit",
          description: "Monto inicial",
          createdAt: now,
          isInitial: true,
        });
      }
      const g = {
        id: newId(),
        title: goalData.title,
        icon: goalData.icon ?? DEFAULT_GOAL_ICON,
        description: goalData.description ?? null,
        targetAmount: round2(goalData.targetAmount),
        currentAmount: initialAmount,
        targetDate: goalData.targetDate ? new Date(goalData.targetDate + "T12:00:00").toISOString() : null,
        isCompleted: computeIsCompleted(initialAmount, round2(goalData.targetAmount)),
        createdAt: now,
        movements,
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
          const sumOthers = sumOtherManualPct(db.goals, id);
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

export async function getMovements(goalId: string, offset: number, limit: number = MOVEMENTS_PAGE_SIZE) {
  try {
    const safeOffset = Math.max(0, Math.floor(offset) || 0);
    // Tope alto (500) para que la restauración de páginas ya cargadas tras un reload no se
    // trunque cuando el usuario había hecho "Cargar más" muchas veces.
    const safeLimit = Math.min(500, Math.max(1, Math.floor(limit) || MOVEMENTS_PAGE_SIZE));

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
        // Total real de movimientos para que el cliente sepe si hay más allá de la primera
        // página sin depender de que el conteo devuelto sea exactamente el tamaño de página.
        movementsTotal: g.movements.length,
        movements: g.movements
          .slice()
          .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
          .slice(0, MOVEMENTS_PAGE_SIZE)
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

export async function getMonthlySummary() {
  try {
    const db = await readOnly();
    const movements = db.goals.flatMap((g) => g.movements);
    const { currentMonth, months } = computeMonthlySummary(movements);
    return { success: true, currentMonth, months };
  } catch (error) {
    console.error("Error fetching monthly summary:", error);
    return { success: false, error: "Error al obtener resumen mensual" };
  }
}

export async function getMonthlyRate() {
  try {
    const db = await readOnly();
    return { success: true, monthlyRate: db.monthlyRate ?? DEFAULT_MONTHLY_RATE };
  } catch (error) {
    console.error("Error getting monthly rate:", error);
    return { success: false, monthlyRate: DEFAULT_MONTHLY_RATE };
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
