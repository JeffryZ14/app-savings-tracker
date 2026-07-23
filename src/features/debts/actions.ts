"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withDb, readOnly, newId, type Debt, type DebtPayment, type Movement } from "@/lib/db/store";
import { round2, isTargetReached } from "@/lib/money";

const DebtSchema = z.object({
  person: z.string().min(1, "El nombre es requerido").max(120),
  concept: z.string().max(300).optional(),
  amount: z.number().positive("El monto debe ser positivo"),
});

const DebtUpdateSchema = z.object({
  person: z.string().min(1, "El nombre es requerido").max(120).optional(),
  concept: z.string().max(300).optional(),
  amount: z.number().positive("El monto debe ser positivo").optional(),
});

const PaymentSchema = z.object({
  amount: z.number().positive("El monto debe ser positivo"),
  description: z.string().max(300).optional(),
});

function outstandingOf(debt: Debt): number {
  const paid = debt.payments.reduce((s, p) => s + p.amount, 0);
  return round2(debt.amount - paid);
}

function isSettled(debt: Debt): boolean {
  return outstandingOf(debt) <= 0.001;
}

function toPlain(debt: Debt) {
  return {
    id: debt.id,
    person: debt.person,
    concept: debt.concept,
    amount: round2(debt.amount),
    outstanding: Math.max(0, outstandingOf(debt)),
    isSettled: debt.isSettled,
    createdAt: debt.createdAt,
    payments: debt.payments
      .slice()
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .map((p) => ({
        id: p.id,
        amount: round2(p.amount),
        description: p.description,
        createdAt: p.createdAt,
        appliedToGoalId: p.appliedToGoalId ?? null,
        appliedToGoalTitle: p.appliedToGoalTitle ?? null,
      })),
  };
}

export async function getDebts() {
  try {
    const db = await readOnly();
    const debts = [...db.debts]
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .map(toPlain);
    const totalReceivable = round2(
      db.debts.filter((d) => !d.isSettled).reduce((s, d) => s + Math.max(0, outstandingOf(d)), 0)
    );
    return { success: true, debts, totalReceivable };
  } catch (error) {
    console.error("Error fetching debts:", error);
    return { success: false, error: "Error al obtener las deudas" };
  }
}

export async function createDebt(data: { person: string; concept?: string; amount: number }) {
  try {
    const parsed = DebtSchema.parse(data);
    const debt = await withDb((db) => {
      const d: Debt = {
        id: newId(),
        person: parsed.person,
        concept: parsed.concept ?? null,
        amount: round2(parsed.amount),
        payments: [],
        createdAt: new Date().toISOString(),
        isSettled: false,
      };
      db.debts.unshift(d);
      return d;
    });
    revalidatePath("/");
    return { success: true, debt: toPlain(debt) };
  } catch (error) {
    console.error("Error creating debt:", error);
    if (error instanceof z.ZodError) {
      return { success: false, error: error.errors[0].message };
    }
    return { success: false, error: "Error al crear la deuda" };
  }
}

export async function updateDebt(id: string, data: { person?: string; concept?: string; amount?: number }) {
  try {
    const parsed = DebtUpdateSchema.parse(data);
    const result = await withDb((db) => {
      const d = db.debts.find((x) => x.id === id);
      if (!d) return { error: "Deuda no encontrada" as const };
      if (parsed.person !== undefined) d.person = parsed.person;
      if (parsed.concept !== undefined) d.concept = parsed.concept;
      if (parsed.amount !== undefined) {
        const paid = d.payments.reduce((s, p) => s + p.amount, 0);
        if (parsed.amount < paid) {
          return { error: "El monto no puede ser menor a lo ya pagado" as const };
        }
        d.amount = round2(parsed.amount);
      }
      d.isSettled = isSettled(d);
      return { debt: d };
    });
    if ("error" in result) return { success: false, error: result.error };
    revalidatePath("/");
    return { success: true, debt: toPlain(result.debt) };
  } catch (error) {
    console.error("Error updating debt:", error);
    if (error instanceof z.ZodError) {
      return { success: false, error: error.errors[0].message };
    }
    return { success: false, error: "Error al actualizar la deuda" };
  }
}

export async function deleteDebt(id: string) {
  try {
    await withDb((db) => {
      db.debts = db.debts.filter((d) => d.id !== id);
    });
    revalidatePath("/");
    return { success: true };
  } catch (error) {
    console.error("Error deleting debt:", error);
    return { success: false, error: "Error al eliminar la deuda" };
  }
}

export async function addDebtPayment(debtId: string, data: { amount: number; description?: string }) {
  try {
    const parsed = PaymentSchema.parse(data);
    const result = await withDb((db) => {
      const d = db.debts.find((x) => x.id === debtId);
      if (!d) return { error: "Deuda no encontrada" as const };

      const remaining = outstandingOf(d);
      if (parsed.amount > remaining + 0.001) {
        return { error: "El pago no puede superar lo pendiente por cobrar" as const };
      }

      const payment: DebtPayment = {
        id: newId(),
        amount: round2(parsed.amount),
        description: parsed.description ?? null,
        createdAt: new Date().toISOString(),
      };
      d.payments.unshift(payment);
      d.isSettled = isSettled(d);
      return { debt: d };
    });
    if ("error" in result) return { success: false, error: result.error };
    revalidatePath("/");
    return { success: true, debt: toPlain(result.debt) };
  } catch (error) {
    console.error("Error adding debt payment:", error);
    if (error instanceof z.ZodError) {
      return { success: false, error: error.errors[0].message };
    }
    return { success: false, error: "Error al registrar el pago" };
  }
}

// Aplica un pago de deuda directamente como depósito en una meta — la única
// integración deliberada entre deudas y metas (todo lo demás se mantiene separado
// a propósito, ver CLAUDE.md). Ambos lados se actualizan en un solo withDb: registra
// el pago (marcado con appliedToGoalId/Title) y agrega el movimiento a la meta.
export async function applyDebtPaymentToGoal(
  debtId: string,
  goalId: string,
  data: { amount: number; description?: string }
) {
  try {
    const parsed = PaymentSchema.parse(data);
    const result = await withDb((db) => {
      const d = db.debts.find((x) => x.id === debtId);
      if (!d) return { error: "Deuda no encontrada" as const };
      const g = db.goals.find((x) => x.id === goalId);
      if (!g) return { error: "Meta no encontrada" as const };

      const remaining = outstandingOf(d);
      if (parsed.amount > remaining + 0.001) {
        return { error: "El pago no puede superar lo pendiente por cobrar" as const };
      }

      const payment: DebtPayment = {
        id: newId(),
        amount: round2(parsed.amount),
        description: parsed.description ?? null,
        createdAt: new Date().toISOString(),
        appliedToGoalId: g.id,
        appliedToGoalTitle: g.title,
      };
      d.payments.unshift(payment);
      d.isSettled = isSettled(d);

      const movement: Movement = {
        id: newId(),
        amount: round2(parsed.amount),
        type: "deposit",
        description: `Cobro de deuda: ${d.person}`,
        createdAt: new Date().toISOString(),
      };
      g.movements.unshift(movement);
      const newCurrent = round2(g.currentAmount + parsed.amount);
      g.currentAmount = newCurrent;
      g.isCompleted = isTargetReached(newCurrent, round2(g.targetAmount));

      return { debt: d };
    });
    if ("error" in result) return { success: false, error: result.error };
    revalidatePath("/");
    return { success: true, debt: toPlain(result.debt) };
  } catch (error) {
    console.error("Error applying debt payment to goal:", error);
    if (error instanceof z.ZodError) {
      return { success: false, error: error.errors[0].message };
    }
    return { success: false, error: "Error al aplicar el pago a la meta" };
  }
}

export async function deleteDebtPayment(debtId: string, paymentId: string) {
  try {
    const result = await withDb((db) => {
      const d = db.debts.find((x) => x.id === debtId);
      if (!d) return { error: "Deuda no encontrada" as const };
      const idx = d.payments.findIndex((p) => p.id === paymentId);
      if (idx === -1) return { error: "Pago no encontrado" as const };
      d.payments.splice(idx, 1);
      d.isSettled = isSettled(d);
      return { debt: d };
    });
    if ("error" in result) return { success: false, error: result.error };
    revalidatePath("/");
    return { success: true, debt: toPlain(result.debt) };
  } catch (error) {
    console.error("Error deleting debt payment:", error);
    return { success: false, error: "Error al eliminar el pago" };
  }
}
