"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withDb, readOnly, newId, type Movement, type MovementType } from "@/lib/db/store";

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
}) {
  try {
    const goal = await withDb((db) => {
      const g = db.goals.find((x) => x.id === id);
      if (!g) return null;
      if (data.title !== undefined) g.title = data.title;
      if (data.icon !== undefined) g.icon = data.icon;
      if (data.description !== undefined) g.description = data.description;
      if (data.targetAmount !== undefined) g.targetAmount = data.targetAmount;
      if (data.targetDate !== undefined) {
        g.targetDate = data.targetDate ? new Date(data.targetDate + "T12:00:00").toISOString() : null;
      }
      return g;
    });
    if (!goal) return { success: false, error: "Meta no encontrada" };
    revalidatePath("/");
    return { success: true, goal };
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
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const allMovements = db.goals.flatMap((g) =>
      g.movements.filter((m) => m.type === "deposit").map((m) => ({ ...m, date: new Date(m.createdAt) }))
    );

    const currentMonth = allMovements
      .filter((m) => m.date >= startOfMonth && m.date < startOfNextMonth)
      .reduce((sum, m) => sum + m.amount, 0);

    const months: { year: number; month: number; total: number }[] = [];
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const start = new Date(d.getFullYear(), d.getMonth(), 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      const total = allMovements
        .filter((m) => m.date >= start && m.date < end)
        .reduce((sum, m) => sum + m.amount, 0);
      months.push({ year: d.getFullYear(), month: d.getMonth(), total: round2(total) });
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
      g.targetAmount = targetAmount;
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
