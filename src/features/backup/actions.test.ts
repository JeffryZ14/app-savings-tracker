import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fs } from "fs";
import os from "os";
import path from "path";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "savings-backup-"));
  process.env.DATA_DIR = tmpDir;
  vi.resetModules();
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("exportBackup / importBackup", () => {
  it("un round-trip export→import preserva los datos", async () => {
    const goals = await import("@/features/goals/actions");
    const backup = await import("@/features/backup/actions");

    const g = await goals.createGoal({ title: "Viaje", targetAmount: 2000, initialAmount: 500 });
    await goals.addMovement(g.goal!.id, { amount: 300, type: "deposit" });

    const exported = await backup.exportBackup();
    expect(exported.success).toBe(true);
    expect(exported.data!.goals).toHaveLength(1);

    // Reemplaza todo por un respaldo distinto y verifica.
    const replacement = {
      goals: [],
      debts: [],
      monthlyRate: 999,
    };
    const imp = await backup.importBackup(replacement);
    expect(imp.success).toBe(true);
    const afterReplace = await goals.getGoals();
    expect(afterReplace.goals).toHaveLength(0);

    // Restaura el respaldo original.
    const restore = await backup.importBackup(exported.data);
    expect(restore.success).toBe(true);
    const restored = await goals.getGoals();
    expect(restored.goals).toHaveLength(1);
    expect(restored.goals![0].title).toBe("Viaje");
    expect(restored.goals![0].currentAmount).toBe(800);
  });

  it("rechaza un payload con formato inválido", async () => {
    const backup = await import("@/features/backup/actions");
    const res = await backup.importBackup({ nope: true });
    expect(res.success).toBe(false);
  });
});

describe("restoreGoal / restoreMovement (undo)", () => {
  it("restaura una meta eliminada con sus movimientos", async () => {
    const goals = await import("@/features/goals/actions");
    const g = await goals.createGoal({ title: "Fondo", targetAmount: 1000, initialAmount: 200 });
    const del = await goals.deleteGoal(g.goal!.id);
    expect(del.removed).toBeTruthy();
    expect((await goals.getGoals()).goals).toHaveLength(0);

    await goals.restoreGoal(del.removed!);
    const after = await goals.getGoals();
    expect(after.goals).toHaveLength(1);
    expect(after.goals![0].currentAmount).toBe(200);
  });

  it("restaura un movimiento eliminado y recalcula el saldo", async () => {
    const goals = await import("@/features/goals/actions");
    const g = await goals.createGoal({ title: "Meta", targetAmount: 1000 });
    const dep = await goals.addMovement(g.goal!.id, { amount: 400, type: "deposit" });
    const del = await goals.deleteMovement(g.goal!.id, dep.movement!.id);
    expect(del.currentAmount).toBe(0);

    const restored = await goals.restoreMovement(g.goal!.id, del.removed!);
    expect(restored.success).toBe(true);
    expect(restored.currentAmount).toBe(400);
  });
});
