import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "fs";
import os from "os";
import path from "path";

// Los Server Actions llaman revalidatePath; fuera de Next lo mockeamos a no-op.
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

// El store lee DATA_DIR al importarse, así que fijamos un directorio temporal ANTES de
// importar dinámicamente las actions dentro de cada test.
let tmpDir: string;

async function loadActions() {
  return import("@/features/goals/actions");
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "savings-test-"));
  process.env.DATA_DIR = tmpDir;
  vi.resetModules();
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("createGoal + addMovement (recálculo de saldo)", () => {
  it("un depósito sube currentAmount y completa la meta al alcanzar el objetivo", async () => {
    const { createGoal, addMovement, getGoals } = await loadActions();
    const created = await createGoal({ title: "Viaje", targetAmount: 1000 });
    expect(created.success).toBe(true);
    const id = created.goal!.id;

    const dep = await addMovement(id, { amount: 1000, type: "deposit" });
    expect(dep.success).toBe(true);
    expect(dep.currentAmount).toBe(1000);

    const goals = await getGoals();
    const g = goals.goals!.find((x) => x.id === id)!;
    expect(g.currentAmount).toBe(1000);
    expect(g.isCompleted).toBe(true);
  });

  it("rechaza un retiro mayor al saldo disponible", async () => {
    const { createGoal, addMovement } = await loadActions();
    const created = await createGoal({ title: "Fondo", targetAmount: 500, initialAmount: 100 });
    const id = created.goal!.id;
    const res = await addMovement(id, { amount: 200, type: "withdrawal" });
    expect(res.success).toBe(false);
  });

  it("el monto inicial se marca como semilla y no cuenta en el resumen mensual", async () => {
    const { createGoal, getMonthlySummary } = await loadActions();
    await createGoal({ title: "Ahorro previo", targetAmount: 5000, initialAmount: 2000 });
    const summary = await getMonthlySummary();
    expect(summary.success).toBe(true);
    expect(summary.currentMonth).toBe(0);
  });
});

describe("updateMovement / deleteMovement (reversa del saldo)", () => {
  it("editar un movimiento revierte el anterior y aplica el nuevo", async () => {
    const { createGoal, addMovement, updateMovement } = await loadActions();
    const created = await createGoal({ title: "Meta", targetAmount: 1000 });
    const id = created.goal!.id;
    const dep = await addMovement(id, { amount: 300, type: "deposit" });
    const movId = dep.movement!.id;

    const upd = await updateMovement(id, movId, { amount: 500, type: "deposit" });
    expect(upd.success).toBe(true);
    expect(upd.currentAmount).toBe(500);
  });

  it("no permite que editar deje el saldo negativo", async () => {
    const { createGoal, addMovement, updateMovement } = await loadActions();
    const created = await createGoal({ title: "Meta", targetAmount: 1000 });
    const id = created.goal!.id;
    const dep = await addMovement(id, { amount: 300, type: "deposit" });
    const movId = dep.movement!.id;

    const upd = await updateMovement(id, movId, { amount: 300, type: "withdrawal" });
    expect(upd.success).toBe(false);
  });

  it("eliminar un depósito baja el saldo", async () => {
    const { createGoal, addMovement, deleteMovement } = await loadActions();
    const created = await createGoal({ title: "Meta", targetAmount: 1000, initialAmount: 400 });
    const id = created.goal!.id;
    const dep = await addMovement(id, { amount: 200, type: "deposit" });
    const del = await deleteMovement(id, dep.movement!.id);
    expect(del.success).toBe(true);
    expect(del.currentAmount).toBe(400);
  });
});

describe("updateGoal (asignación %)", () => {
  it("rechaza un % manual que haría pasar la suma de 100", async () => {
    const { createGoal, updateGoal } = await loadActions();
    const a = await createGoal({ title: "A", targetAmount: 1000 });
    const b = await createGoal({ title: "B", targetAmount: 1000 });
    await updateGoal(a.goal!.id, { allocationPct: 70 });
    const res = await updateGoal(b.goal!.id, { allocationPct: 40 });
    expect(res.success).toBe(false);
  });

  it("rechaza un % no entero o fuera de rango", async () => {
    const { createGoal, updateGoal } = await loadActions();
    const a = await createGoal({ title: "A", targetAmount: 1000 });
    expect((await updateGoal(a.goal!.id, { allocationPct: 33.5 })).success).toBe(false);
    expect((await updateGoal(a.goal!.id, { allocationPct: 120 })).success).toBe(false);
  });
});
