"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";
import { Plus, X, Check } from "lucide-react";

import {
  getGoals,
  createGoal,
  deleteGoal,
  addMovement,
  updateGoal,
  updateMovement,
  deleteMovement,
  getMovements,
  getMonthlySummary,
  getMonthlyRate,
  updateMonthlyRate,
} from "@/features/goals/actions";
import { getDebts, deleteDebt, deleteDebtPayment } from "@/features/debts/actions";
import GoalCard from "@/components/GoalCard";
import DebtsSection, { type DebtData, type SimulationTargetGoal } from "@/components/DebtsSection";
import ThemeToggle from "@/components/ThemeToggle";
import DeleteConfirmModal, { type DeleteTarget } from "@/components/DeleteConfirmModal";
import Toast from "@/components/Toast";
import Skeleton from "@/components/Skeleton";

function formatSoles(n: number) {
  const r = Math.round(n);
  return "S/ " + r.toLocaleString("es-PE");
}

const MONTH_LABELS = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

interface MovementData {
  id: string;
  amount: number;
  type: "deposit" | "withdrawal";
  description: string | null;
  createdAt: string;
}

interface GoalData {
  id: string; title: string; icon: string; targetAmount: number;
  currentAmount: number; targetDate: string | null; isCompleted: boolean; createdAt: string;
  allocationPct: number; allocationManual: boolean;
  movements: MovementData[];
}

interface MonthRow {
  year: number; month: number; total: number;
}

interface MonthlyTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: MonthRow & { label: string } }>;
  monthlyRate: number;
}

function MonthlyTooltip({ active, payload, monthlyRate }: MonthlyTooltipProps) {
  if (!active || !payload || !payload.length) return null;
  const row = payload[0].payload;
  const met = row.total >= monthlyRate;
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        boxShadow: "var(--shadow-sm)",
        padding: "8px 11px",
        fontFamily: "var(--font-mono)",
        fontSize: 12,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 2, color: "var(--text)" }}>{row.label}</div>
      <div style={{ color: met ? "var(--brand)" : "var(--negative)" }}>{formatSoles(row.total)}</div>
    </div>
  );
}

export default function SavingsLedger() {
  const [goals, setGoals] = useState<GoalData[]>([]);
  const [debts, setDebts] = useState<DebtData[]>([]);
  const [totalReceivable, setTotalReceivable] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [monthlyRate, setMonthlyRate] = useState(1421);
  const [currentMonthTotal, setCurrentMonthTotal] = useState(0);
  const [monthHistory, setMonthHistory] = useState<MonthRow[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [movementKind, setMovementKind] = useState<"deposit" | "withdrawal">("deposit");
  const [amountInput, setAmountInput] = useState("");
  const [editingTarget, setEditingTarget] = useState<string | null>(null);
  const [tempTarget, setTempTarget] = useState("");
  const [editingAllocation, setEditingAllocation] = useState<string | null>(null);
  const [tempAllocation, setTempAllocation] = useState("");
  // Simulación "¿y si me pagan esta deuda?" — solo visual, nunca se persiste ni cambia currentAmount real.
  const [simulation, setSimulation] = useState<{ debtId: string; goalId: string } | null>(null);
  const [showNewGoal, setShowNewGoal] = useState(false);
  const [newGoalName, setNewGoalName] = useState("");
  const [newGoalTarget, setNewGoalTarget] = useState("");
  const [editingRate, setEditingRate] = useState(false);
  const [tempRate, setTempRate] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [newGoalTargetDate, setNewGoalTargetDate] = useState("");
  const [newGoalInitial, setNewGoalInitial] = useState("");
  const [tempTargetDate, setTempTargetDate] = useState("");
  const [editingMovement, setEditingMovement] = useState<{ goalId: string; movementId: string } | null>(null);
  const [movementEditAmount, setMovementEditAmount] = useState("");
  const [movementEditKind, setMovementEditKind] = useState<"deposit" | "withdrawal">("deposit");
  const [movementEditDesc, setMovementEditDesc] = useState("");
  const [movementPages, setMovementPages] = useState<Record<string, MovementData[]>>({});
  const [movementHasMore, setMovementHasMore] = useState<Record<string, boolean>>({});
  const [loadingMoreFor, setLoadingMoreFor] = useState<string | null>(null);
  const movementPagesRef = useRef<Record<string, MovementData[]>>({});

  useEffect(() => {
    movementPagesRef.current = movementPages;
  }, [movementPages]);

  useEffect(() => {
    if (!errorMsg) return;
    const t = setTimeout(() => setErrorMsg(null), 5000);
    return () => clearTimeout(t);
  }, [errorMsg]);

  const loadData = useCallback(async () => {
    const [gRes, mRes, rRes, dRes] = await Promise.all([
      getGoals(),
      getMonthlySummary(),
      getMonthlyRate(),
      getDebts(),
    ]);
    if (gRes.success && gRes.goals) {
      setGoals(gRes.goals as GoalData[]);
      const hasMoreSeed: Record<string, boolean> = {};
      for (const g of gRes.goals) {
        hasMoreSeed[g.id] = g.movements.length === 10;
      }

      // Re-fetch previously loaded extra pages per goal so "cargar más" state survives a reload.
      const previousPages = movementPagesRef.current;
      const restoredPages: Record<string, MovementData[]> = {};
      await Promise.all(
        gRes.goals.map(async (g) => {
          const previousCount = previousPages[g.id]?.length ?? 0;
          if (previousCount === 0) return;
          const res = await getMovements(g.id, 10, previousCount);
          if (res.success && res.movements) {
            restoredPages[g.id] = res.movements as MovementData[];
            hasMoreSeed[g.id] = res.hasMore ?? hasMoreSeed[g.id];
          }
        })
      );

      setMovementHasMore(hasMoreSeed);
      setMovementPages(restoredPages);
    } else if (!gRes.success) {
      setErrorMsg(gRes.error ?? "Error al cargar las metas");
    }
    if (mRes.success) {
      setCurrentMonthTotal(mRes.currentMonth ?? 0);
      setMonthHistory(mRes.months ?? []);
    } else if (!mRes.success) {
      setErrorMsg(mRes.error ?? "Error al cargar el resumen mensual");
    }
    if (rRes.success) {
      setMonthlyRate(rRes.monthlyRate ?? 1421);
    }
    if (dRes.success && dRes.debts) {
      setDebts(dRes.debts as DebtData[]);
      setTotalReceivable(dRes.totalReceivable ?? 0);
    } else if (!dRes.success) {
      setErrorMsg(dRes.error ?? "Error al cargar las deudas");
    }
  }, []);

  useEffect(() => {
    loadData().then(() => {
      setLoaded(true);
      setIsLoading(false);
    });
  }, [loadData]);

  // Prefiere el valor local si existe; si no, se queda con el que trajo loadData del server.
  useEffect(() => {
    if (!loaded) return;
    try {
      const saved = localStorage.getItem("monthlyRate");
      const n = saved !== null ? Number(saved) : NaN;
      if (Number.isFinite(n) && n > 0) setMonthlyRate(n);
    } catch {}
  }, [loaded]);

  // Persiste sólo ante cambio explícito del usuario — nunca en el montaje, para no
  // reescribir db.json en cada carga ni clobberear la tasa persistida por una carrera.
  function handleSaveRate() {
    const v = parseFloat(tempRate);
    if (isNaN(v) || v <= 0) return;
    setMonthlyRate(v);
    setEditingRate(false);
    try {
      localStorage.setItem("monthlyRate", String(v));
    } catch {}
    updateMonthlyRate(v).catch(() => {});
  }

  const simulatedDebt = simulation ? debts.find((d) => d.id === simulation.debtId) : null;

  const totalCurrentAll = goals.reduce((s, g) => s + g.currentAmount, 0);
  const targeted = goals.filter((g) => g.targetAmount > 0);
  const totalCurrentTargeted = targeted.reduce((s, g) => s + g.currentAmount, 0);
  const totalTarget = targeted.reduce((s, g) => s + g.targetAmount, 0);
  const overallPct = totalTarget > 0 ? Math.min(100, (totalCurrentTargeted / totalTarget) * 100) : 0;
  const monthlyMet = currentMonthTotal >= monthlyRate;
  const monthRemaining = Math.max(0, monthlyRate - currentMonthTotal);

  const chartData = monthHistory
    .slice(0, 6)
    .reverse()
    .map((m) => ({ ...m, label: MONTH_LABELS[m.month] }));

  async function handleAddMovement(id: string) {
    const amt = parseFloat(amountInput);
    if (!amt || amt <= 0) return;
    const res = await addMovement(id, { amount: amt, type: movementKind });
    if (res.success) {
      setAmountInput("");
      setAddingTo(null);
      await loadData();
    } else {
      setErrorMsg(res.error ?? "Error al registrar el movimiento");
    }
  }

  async function handleEditTarget(id: string) {
    const val = parseFloat(tempTarget);
    if (isNaN(val) || val < 0) return;
    const res = await updateGoal(id, { targetAmount: val, targetDate: tempTargetDate || null });
    if (res.success) {
      setEditingTarget(null);
      setTempTargetDate("");
      await loadData();
    } else {
      setErrorMsg(res.error ?? "Error al actualizar el objetivo");
    }
  }

  async function handleSaveAllocation(id: string) {
    const raw = parseFloat(tempAllocation);
    if (isNaN(raw) || raw < 0 || raw > 100) return;
    const val = Math.round(raw);
    const res = await updateGoal(id, { allocationPct: val });
    if (res.success) {
      setEditingAllocation(null);
      await loadData();
    } else {
      setErrorMsg(res.error ?? "Error al actualizar el porcentaje asignado");
    }
  }

  async function handleResetAllocation(id: string) {
    const res = await updateGoal(id, { allocationPct: null });
    if (res.success) {
      await loadData();
    } else {
      setErrorMsg(res.error ?? "Error al actualizar el porcentaje asignado");
    }
  }

  async function handleCreateGoal() {
    const name = newGoalName.trim();
    if (!name) return;
    const targetVal = parseFloat(newGoalTarget);
    const initialVal = parseFloat(newGoalInitial);
    const res = await createGoal({
      title: name,
      icon: "⭐",
      targetAmount: !isNaN(targetVal) && targetVal > 0 ? targetVal : 0,
      targetDate: newGoalTargetDate || undefined,
      initialAmount: !isNaN(initialVal) && initialVal > 0 ? initialVal : undefined,
    });
    if (res.success) {
      setShowNewGoal(false);
      setNewGoalName("");
      setNewGoalTarget("");
      setNewGoalTargetDate("");
      setNewGoalInitial("");
      await loadData();
    } else {
      setErrorMsg(res.error ?? "Error al crear la meta");
    }
  }

  async function handleConfirmDelete(target: DeleteTarget) {
    if (target.kind === "goal") {
      const res = await deleteGoal(target.id);
      if (res.success) {
        setDeleteTarget(null);
        await loadData();
      } else {
        setErrorMsg(res.error ?? "Error al eliminar la meta");
      }
    } else if (target.kind === "movement") {
      const res = await deleteMovement(target.goalId, target.movementId);
      if (res.success) {
        setDeleteTarget(null);
        await loadData();
      } else {
        setErrorMsg(res.error ?? "Error al eliminar el movimiento");
      }
    } else if (target.kind === "debt") {
      const res = await deleteDebt(target.id);
      if (res.success) {
        setDeleteTarget(null);
        await loadData();
      } else {
        setErrorMsg(res.error ?? "Error al eliminar la deuda");
      }
    } else if (target.kind === "debt-payment") {
      const res = await deleteDebtPayment(target.debtId, target.paymentId);
      if (res.success) {
        setDeleteTarget(null);
        await loadData();
      } else {
        setErrorMsg(res.error ?? "Error al eliminar el pago");
      }
    }
  }

  function handleEditMovementClick(goalId: string, movement: MovementData) {
    setEditingMovement({ goalId, movementId: movement.id });
    setMovementEditAmount(String(movement.amount));
    setMovementEditKind(movement.type);
    setMovementEditDesc(movement.description ?? "");
  }

  function handleCancelMovementEdit() {
    setEditingMovement(null);
    setMovementEditAmount("");
    setMovementEditDesc("");
  }

  async function handleSaveMovementEdit() {
    if (!editingMovement) return;
    const amt = parseFloat(movementEditAmount);
    if (!amt || amt <= 0) return;
    const res = await updateMovement(editingMovement.goalId, editingMovement.movementId, {
      amount: amt,
      type: movementEditKind,
      description: movementEditDesc.trim() || undefined,
    });
    if (res.success) {
      handleCancelMovementEdit();
      await loadData();
    } else {
      setErrorMsg(res.error ?? "Error al actualizar el movimiento");
    }
  }

  async function handleLoadMoreMovements(goalId: string) {
    setLoadingMoreFor(goalId);
    const offset = 10 + (movementPages[goalId]?.length ?? 0);
    const res = await getMovements(goalId, offset, 10);
    if (res.success && res.movements) {
      setMovementPages((p) => ({ ...p, [goalId]: [...(p[goalId] ?? []), ...res.movements as MovementData[]] }));
      setMovementHasMore((p) => ({ ...p, [goalId]: res.hasMore ?? false }));
    } else {
      setErrorMsg(res.error ?? "Error al cargar más movimientos");
    }
    setLoadingMoreFor(null);
  }

  return (
    <main className="sd-root">
      <style>{`
        .sd-root {
          --radius: 14px;
          --radius-sm: 10px;
          min-height: 100vh;
          padding: 0 0 64px 0;
          font-family: var(--font-ui);
          color: var(--text);
        }
        .sd-root * { box-sizing: border-box; }
        .sd-mono { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
        .sd-root button { font-family: inherit; }
        .sd-root button:focus-visible,
        .sd-root input:focus-visible {
          outline: 2px solid var(--brand-strong);
          outline-offset: 2px;
        }

        .sd-wrap { max-width: 1080px; margin: 0 auto; padding: 0 clamp(16px, 4vw, 28px); }

        /* Top bar */
        .sd-topbar {
          position: sticky;
          top: 0;
          z-index: 40;
          background: color-mix(in srgb, var(--bg) 88%, transparent);
          backdrop-filter: saturate(140%) blur(10px);
          border-bottom: 1px solid var(--border);
        }
        .sd-topbar-inner {
          max-width: 1080px;
          margin: 0 auto;
          padding: 12px clamp(16px, 4vw, 28px);
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .sd-brandmark { display: flex; align-items: center; gap: 9px; }
        .sd-brandmark-dot {
          width: 26px; height: 26px; border-radius: 8px;
          background: var(--brand); color: #fff;
          display: grid; place-items: center;
          font-family: var(--font-display); font-weight: 800; font-size: 15px;
        }
        .sd-brandmark-text {
          margin: 0;
          font-family: var(--font-display); font-weight: 700;
          font-size: 15px; letter-spacing: -0.01em;
        }
        .sd-theme-toggle {
          width: 38px; height: 38px; border-radius: 10px;
          border: 1px solid var(--border); background: var(--surface);
          color: var(--text); cursor: pointer;
          display: grid; place-items: center;
          transition: background 0.15s ease, border-color 0.15s ease;
        }
        .sd-theme-toggle:hover { background: var(--surface-2); border-color: var(--muted); }

        /* Hero */
        .sd-hero {
          margin-top: clamp(18px, 4vw, 28px);
          border-radius: var(--radius);
          padding: clamp(22px, 4vw, 32px);
          background:
            radial-gradient(120% 140% at 100% 0%, color-mix(in srgb, var(--brand-strong) 55%, var(--brand)) 0%, var(--brand) 55%);
          color: #F3EFE6;
          position: relative;
          overflow: hidden;
          box-shadow: var(--shadow);
        }
        .sd-hero-eyebrow {
          font-family: var(--font-mono);
          font-size: 11px; letter-spacing: 2.5px; text-transform: uppercase;
          opacity: 0.72; margin-bottom: 14px;
        }
        .sd-hero-label {
          font-size: 12.5px; letter-spacing: 0.04em; text-transform: uppercase;
          opacity: 0.8; font-weight: 500;
        }
        .sd-hero-amount {
          font-family: var(--font-mono); font-variant-numeric: tabular-nums;
          font-size: clamp(34px, 9vw, 52px); font-weight: 600;
          line-height: 1.05; margin-top: 4px; letter-spacing: -0.02em;
          color: #FFFFFF;
        }
        .sd-hero-meta {
          display: flex; flex-wrap: wrap; gap: 8px 20px;
          margin-top: 18px; align-items: center;
        }
        .sd-hero-chip {
          font-family: var(--font-mono); font-size: 12px;
          background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.18);
          padding: 5px 10px; border-radius: 999px;
        }
        .sd-hero-progress { margin-top: 20px; }
        .sd-hero-track {
          height: 7px; border-radius: 999px;
          background: rgba(255,255,255,0.18); overflow: hidden;
        }
        .sd-hero-fill { height: 100%; border-radius: 999px; background: var(--gold); }
        .sd-hero-caption {
          display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px;
          margin-top: 10px; font-family: var(--font-mono); font-size: 11.5px; opacity: 0.85;
        }
        .sd-rate-edit {
          background: none; border: none; color: var(--gold);
          text-decoration: underline; text-underline-offset: 2px;
          cursor: pointer; font-family: var(--font-mono); font-size: 11.5px;
          padding: 2px 0; min-height: 28px;
        }
        .sd-rate-form { display: inline-flex; gap: 6px; align-items: center; }
        .sd-rate-form input {
          width: 100px; font-family: var(--font-mono); font-size: 13px;
          padding: 6px 8px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.4);
          background: rgba(255,255,255,0.12); color: #fff;
        }

        /* Section heading */
        .sd-section-head {
          display: flex; align-items: baseline; justify-content: space-between;
          gap: 12px; margin: clamp(26px, 5vw, 38px) 0 4px;
        }
        .sd-section-title {
          font-family: var(--font-display); font-weight: 700;
          font-size: clamp(18px, 3vw, 22px); letter-spacing: -0.01em;
        }
        .sd-section-sub {
          font-family: var(--font-mono); font-size: 12px; color: var(--muted);
        }

        /* Monthly card */
        .sd-monthly-card {
          margin-top: 14px;
          padding: 18px clamp(16px, 3vw, 22px);
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          box-shadow: var(--shadow-sm);
        }
        .sd-monthly-head {
          display: flex; justify-content: space-between; align-items: center;
          flex-wrap: wrap; gap: 10px;
        }
        .sd-monthly-badge {
          width: 40px; height: 40px; border-radius: 12px;
          display: grid; place-items: center; font-size: 20px;
          background: var(--brand-soft);
        }
        .sd-monthly-label {
          font-size: 12px; font-weight: 600; letter-spacing: 0.06em;
          text-transform: uppercase; color: var(--muted);
        }
        .sd-monthly-sub {
          font-family: var(--font-mono); font-size: 14px; color: var(--text);
          margin-top: 3px; font-weight: 500;
        }
        .sd-monthly-sub .muted { color: var(--muted); font-weight: 400; }
        .sd-chart-wrap { margin-top: 16px; height: 130px; }

        /* Goals grid */
        .sd-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 18px;
          margin-top: 14px;
        }
        .sd-card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 20px;
          position: relative;
          box-shadow: var(--shadow-sm);
          transition: box-shadow 0.2s ease, transform 0.2s ease, border-color 0.2s ease;
        }
        .sd-card:hover { box-shadow: var(--shadow); border-color: color-mix(in srgb, var(--brand) 24%, var(--border)); }
        .sd-card-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
        .sd-card-name {
          font-family: var(--font-display); font-weight: 700; font-size: 16px;
          margin: 0 0 12px; padding-right: 58px; word-break: break-word; letter-spacing: -0.01em;
        }
        .sd-card-amounts {
          font-family: var(--font-mono); font-variant-numeric: tabular-nums;
          font-size: 22px; font-weight: 600; display: flex; align-items: baseline;
          gap: 5px; flex-wrap: wrap; letter-spacing: -0.01em;
        }
        .sd-card-of { font-family: var(--font-mono); font-size: 13px; font-weight: 400; color: var(--muted); }
        .sd-edit-btn {
          background: none; border: none; cursor: pointer; color: var(--muted);
          padding: 6px; display: inline-flex; min-width: 28px; min-height: 28px;
          align-items: center; justify-content: center; border-radius: 8px;
        }
        .sd-edit-btn:hover { background: var(--surface-2); color: var(--text); }
        .sd-target-form { display: inline-flex; gap: 6px; align-items: center; margin-top: 8px; flex-wrap: wrap; }
        .sd-target-form input {
          width: 110px; font-family: var(--font-mono); font-size: 13px;
          padding: 7px 8px; border-radius: 8px; border: 1px solid var(--border);
          background: var(--surface-2); color: var(--text);
        }
        .sd-target-form input[type="date"] { width: 150px; }
        .sd-icon-btn {
          background: none; border: none; cursor: pointer; color: var(--brand);
          display: inline-flex; align-items: center; justify-content: center;
          min-width: 32px; min-height: 32px; border-radius: 8px;
        }
        .sd-icon-btn:hover { background: var(--brand-soft); }
        .sd-bar-track {
          height: 9px; border-radius: 999px;
          background: var(--surface-2); border: 1px solid var(--border);
          margin-top: 14px; overflow: hidden; position: relative;
        }
        .sd-bar-fill { height: 100%; border-radius: 999px; background: var(--brand); }
        .sd-bar-fill.complete { background: var(--gold); }
        .sd-bar-fill-ghost {
          position: absolute; top: 0; height: 100%; border-radius: 999px;
          background: repeating-linear-gradient(
            135deg,
            color-mix(in srgb, var(--gold) 55%, transparent) 0 6px,
            color-mix(in srgb, var(--gold) 30%, transparent) 6px 12px
          );
        }
        .sd-pct { font-family: var(--font-mono); font-size: 11.5px; color: var(--muted); margin-top: 8px; }
        .sd-projection { font-size: 12.5px; color: var(--muted); margin-top: 7px; }
        .sd-projection-track { font-family: var(--font-mono); font-size: 12px; margin-top: 6px; display: flex; align-items: center; gap: 5px; }
        .sd-projection-track.on-track { color: var(--brand); }
        .sd-projection-track.behind { color: var(--negative); }
        .sd-sim-banner {
          display: flex; align-items: center; justify-content: space-between; gap: 8px;
          margin-top: 8px; padding: 7px 10px; border-radius: 9px;
          background: color-mix(in srgb, var(--gold) 12%, transparent);
          border: 1px dashed color-mix(in srgb, var(--gold) 45%, transparent);
          font-size: 12px; color: var(--text);
        }
        .sd-sim-banner.complete { font-weight: 600; }

        .sd-stamp { position: absolute; top: 14px; right: 12px; pointer-events: none; }
        .sd-badge-complete {
          display: inline-flex; align-items: center; gap: 5px;
          font-family: var(--font-mono); font-size: 10.5px; font-weight: 600;
          letter-spacing: 0.06em; text-transform: uppercase;
          color: var(--gold); background: color-mix(in srgb, var(--gold) 14%, transparent);
          border: 1px solid color-mix(in srgb, var(--gold) 45%, transparent);
          padding: 4px 9px; border-radius: 999px;
        }

        .sd-actions { margin-top: 16px; display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
        .sd-btn {
          font-family: var(--font-ui); font-size: 13px; font-weight: 500;
          background: var(--brand); color: #fff; border: none;
          padding: 10px 15px; min-height: 40px; border-radius: 10px; cursor: pointer;
          display: inline-flex; align-items: center; justify-content: center; gap: 6px;
          transition: background 0.15s ease, transform 0.1s ease;
        }
        .sd-btn:hover { background: var(--brand-strong); }
        .sd-btn:active { transform: translateY(1px); }
        .sd-btn-sm {
          font-family: var(--font-ui); font-size: 12px; background: var(--surface);
          border: 1px solid var(--border); color: var(--text);
          padding: 7px 11px; min-height: 34px; border-radius: 9px; cursor: pointer;
          display: inline-flex; align-items: center; gap: 5px;
        }
        .sd-btn-sm:hover { background: var(--surface-2); }
        .sd-link-btn {
          font-family: var(--font-ui); font-size: 12.5px; background: none; border: none;
          color: var(--muted); cursor: pointer; display: inline-flex; align-items: center;
          gap: 4px; padding: 7px 6px; min-height: 34px; border-radius: 8px;
        }
        .sd-link-btn:hover { background: var(--surface-2); color: var(--text); }
        .sd-link-btn.danger { color: var(--negative); }
        .sd-link-btn.danger:hover { background: var(--negative-soft); }

        .sd-add-form {
          margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--border);
          display: flex; gap: 10px; flex-wrap: wrap; align-items: center; overflow: hidden;
        }
        .sd-kind-toggle {
          display: flex; width: 100%; border: 1px solid var(--border);
          border-radius: 10px; overflow: hidden; background: var(--surface-2);
          padding: 3px; gap: 3px;
        }
        .sd-kind-btn {
          flex: 1; font-family: var(--font-ui); font-size: 12.5px; font-weight: 500;
          padding: 8px 6px; min-height: 36px; background: transparent; border: none;
          border-radius: 7px; cursor: pointer; color: var(--muted);
          display: inline-flex; align-items: center; justify-content: center; gap: 5px;
          transition: background 0.15s ease, color 0.15s ease;
        }
        .sd-kind-btn.active.deposit { background: var(--brand); color: #fff; }
        .sd-kind-btn.active.withdrawal { background: var(--negative); color: #fff; }
        .sd-add-form input {
          font-family: var(--font-mono); font-size: 15px; padding: 10px 11px; min-height: 40px;
          border: 1px solid var(--border); border-radius: 10px;
          background: var(--surface-2); color: var(--text);
        }
        .sd-add-form input[type="number"] { width: 100%; }
        .sd-quick-amounts { display:flex; gap:6px; flex-wrap:wrap; width:100%; }
        .sd-qty-btn {
          font-family: var(--font-mono); font-size: 12px; background: var(--surface-2);
          border: 1px solid var(--border); border-radius: 999px; padding: 6px 12px;
          min-height: 32px; cursor: pointer; color: var(--text);
        }
        .sd-qty-btn:hover { border-color: var(--brand); color: var(--brand); }

        .sd-history { margin-top: 12px; border-top: 1px solid var(--border); padding-top: 10px; overflow: hidden; }
        .sd-history-row {
          display: flex; justify-content: space-between; align-items: center; gap: 8px;
          font-family: var(--font-mono); font-size: 12.5px; padding: 7px 0; color: var(--text);
          border-bottom: 1px solid color-mix(in srgb, var(--border) 55%, transparent);
        }
        .sd-history-row:last-child { border-bottom: none; }
        .sd-history-left { display: flex; align-items: center; gap: 7px; min-width: 0; }
        .sd-history-desc { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--muted); }
        .sd-history-amt { font-weight: 600; }
        .sd-history-amt.deposit { color: var(--brand); }
        .sd-history-amt.withdrawal { color: var(--negative); }
        .sd-history-empty { font-family: var(--font-mono); font-size: 12.5px; color: var(--muted); font-style: italic; padding: 4px 0; }
        .sd-history-row-actions { display: flex; gap: 2px; flex-shrink: 0; }
        .sd-history-icon-btn {
          background: none; border: none; cursor: pointer; color: var(--muted);
          padding: 5px; display: inline-flex; align-items: center; justify-content: center;
          min-width: 26px; min-height: 26px; border-radius: 7px;
        }
        .sd-history-icon-btn:hover { background: var(--surface-2); color: var(--text); }
        .sd-movement-edit-form { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; padding: 8px 0; width: 100%; }
        .sd-movement-edit-form input[type="number"] {
          width: 96px; font-family: var(--font-mono); font-size: 12px; padding: 7px 8px;
          border-radius: 8px; border: 1px solid var(--border); background: var(--surface-2); color: var(--text);
        }
        .sd-movement-edit-form input[type="text"] {
          flex: 1; min-width: 100px; font-family: var(--font-ui); font-size: 12.5px; padding: 7px 8px;
          border-radius: 8px; border: 1px solid var(--border); background: var(--surface-2); color: var(--text);
        }
        .sd-movement-edit-kind { display: flex; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
        .sd-movement-edit-kind button {
          font-family: var(--font-mono); font-size: 11px; padding: 7px 9px; background: transparent;
          border: none; cursor: pointer; color: var(--muted); display: inline-flex; align-items: center; justify-content: center;
        }
        .sd-movement-edit-kind button.active.deposit { background: var(--brand); color: #fff; }
        .sd-movement-edit-kind button.active.withdrawal { background: var(--negative); color: #fff; }
        .sd-load-more-btn {
          font-family: var(--font-ui); font-size: 12px; background: var(--surface-2);
          border: 1px solid var(--border); border-radius: 9px; color: var(--muted);
          padding: 8px 10px; min-height: 34px; cursor: pointer; width: 100%; margin-top: 8px;
        }
        .sd-load-more-btn:hover { color: var(--text); }
        .sd-load-more-btn:disabled { opacity: 0.6; cursor: default; }

        .sd-empty-state { grid-column: 1 / -1; padding: 44px 20px; text-align: center; }
        .sd-empty-text { font-size: 15px; color: var(--muted); line-height: 1.6; margin: 0; }
        .sd-newgoal-area {
          border: 1.5px dashed var(--border); border-radius: var(--radius);
          display: flex; align-items: center; justify-content: center;
          min-height: 140px; background: var(--surface-2); padding: 20px;
          transition: border-color 0.2s ease;
        }
        .sd-newgoal-area:hover { border-color: var(--brand); }
        .sd-newgoal-form { display: flex; flex-direction: column; gap: 9px; width: 100%; }
        .sd-newgoal-form input {
          font-family: var(--font-ui); font-size: 14px; padding: 10px 11px; min-height: 40px;
          border: 1px solid var(--border); border-radius: 10px; background: var(--surface); color: var(--text);
        }
        .sd-newgoal-form-actions { display: flex; gap: 8px; }

        /* Toast */
        .sd-toast {
          position: fixed; left: 50%; bottom: 22px; transform: translateX(-50%);
          background: var(--negative); color: #fff; font-size: 13px;
          padding: 12px 16px; border-radius: 12px; box-shadow: var(--shadow);
          z-index: 60; max-width: calc(100vw - 32px); border: none; cursor: pointer;
          display: flex; align-items: center; gap: 12px; min-height: 46px;
        }
        .sd-toast:hover { filter: brightness(0.96); }
        .sd-toast:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
        .sd-toast-text { flex: 1; }
        .sd-toast-close { display: flex; align-items: center; justify-content: center; flex-shrink: 0; }

        /* Modal */
        .sd-modal-overlay {
          position: fixed; inset: 0; background: rgba(10, 16, 14, 0.5);
          display: flex; align-items: center; justify-content: center; z-index: 100; padding: 20px;
          backdrop-filter: blur(2px);
        }
        .sd-modal {
          background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
          padding: 26px; max-width: 360px; box-shadow: var(--shadow);
        }
        .sd-modal-title { font-family: var(--font-display); font-weight: 700; font-size: 19px; margin: 0 0 10px; color: var(--text); }
        .sd-modal-text { font-size: 14px; line-height: 1.55; color: var(--muted); margin: 0 0 22px; }
        .sd-modal-actions { display: flex; gap: 8px; flex-wrap: wrap; }
        .sd-modal-actions .sd-btn { flex: 1; min-width: 110px; }

        /* Skeleton */
        .sd-skeleton { padding: 0 0 64px 0; }
        .sd-skeleton-el { background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius); }
        .sd-skeleton-hero { height: 200px; margin-top: 20px; }
        .sd-skeleton-card { height: 130px; margin-top: 16px; }
        .sd-skeleton-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 18px; margin-top: 16px; }
        .sd-skeleton-card-sm { height: 210px; }
        @keyframes sd-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.55; } }
        .sd-skeleton-el { animation: sd-pulse 1.4s ease-in-out infinite; }

        @media (max-width: 600px) { .sd-grid { grid-template-columns: 1fr; } }
        @media (max-width: 480px) { .sd-monthly-head { flex-direction: column; align-items: flex-start; } }
        @media (prefers-reduced-motion: reduce) {
          .sd-skeleton-el { animation: none; }
          * { scroll-behavior: auto; }
        }
      `}</style>

      <Toast message={errorMsg} onClose={() => setErrorMsg(null)} />

      <DeleteConfirmModal
        target={deleteTarget}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <div className="sd-topbar">
        <div className="sd-topbar-inner">
          <div className="sd-brandmark">
            <span className="sd-brandmark-dot">A</span>
            <h1 className="sd-brandmark-text">Mis Metas de Ahorro</h1>
          </div>
          <ThemeToggle />
        </div>
      </div>

      {isLoading && <div className="sd-wrap"><Skeleton /></div>}

      <div className="sd-wrap" style={{ display: isLoading ? "none" : "block" }}>
        <motion.div
          className="sd-hero"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <p className="sd-hero-eyebrow">Libreta de Ahorros</p>
          <p className="sd-hero-label">Saldo total</p>
          <div className="sd-hero-amount">{formatSoles(totalCurrentAll)}</div>

          <div className="sd-hero-meta">
            {totalTarget > 0 && (
              <span className="sd-hero-chip">{overallPct.toFixed(1)}% de tus metas</span>
            )}
            {totalReceivable > 0 && (
              <span className="sd-hero-chip">Por cobrar {formatSoles(totalReceivable)}</span>
            )}
          </div>

          <div className="sd-hero-progress">
            <div className="sd-hero-track">
              <motion.div
                className="sd-hero-fill"
                initial={{ width: 0 }}
                animate={{ width: overallPct + "%" }}
                transition={{ duration: 0.7, ease: "easeOut" }}
              />
            </div>
            <div className="sd-hero-caption">
              <span>
                {formatSoles(totalCurrentTargeted)} de {formatSoles(totalTarget)}
              </span>
              {!editingRate ? (
                <button className="sd-rate-edit" onClick={() => { setEditingRate(true); setTempRate(String(monthlyRate)); }}>
                  ahorro mensual: {formatSoles(monthlyRate)}
                </button>
              ) : (
                <span className="sd-rate-form">
                  <input
                    type="number"
                    value={tempRate}
                    onChange={(e) => setTempRate(e.target.value)}
                    autoFocus
                    aria-label="Ahorro mensual estimado"
                  />
                  <button className="sd-icon-btn" style={{ color: "var(--gold)" }} onClick={handleSaveRate} aria-label="Guardar">
                    <Check size={15} />
                  </button>
                  <button className="sd-icon-btn" style={{ color: "var(--gold)" }} onClick={() => setEditingRate(false)} aria-label="Cancelar">
                    <X size={15} />
                  </button>
                </span>
              )}
            </div>
          </div>
        </motion.div>

        <motion.div
          className="sd-monthly-card"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          <div className="sd-monthly-head">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span className="sd-monthly-badge">{monthlyMet ? '✅' : '⏳'}</span>
              <div>
                <p className="sd-monthly-label">Ahorro Mensual</p>
                <p className="sd-monthly-sub">
                  {formatSoles(currentMonthTotal)} <span className="muted">de {formatSoles(monthlyRate)}</span>
                  {!monthlyMet && monthRemaining > 0 && (
                    <span className="muted"> · faltan {formatSoles(monthRemaining)}</span>
                  )}
                </p>
              </div>
            </div>
          </div>

          {chartData.length > 0 && (
            <div className="sd-chart-wrap" role="img" aria-label={`Gráfico de ahorros mensuales. Últimos 6 meses. Meta mensual: ${formatSoles(monthlyRate)}. Mes actual: ${formatSoles(currentMonthTotal)}`}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="0" />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontFamily: "var(--font-mono)", fontSize: 11, fill: "var(--muted)" }}
                  />
                  <YAxis hide />
                  <Tooltip content={<MonthlyTooltip monthlyRate={monthlyRate} />} cursor={{ fill: "var(--brand-soft)" }} />
                  {monthlyRate > 0 && (
                    <ReferenceLine y={monthlyRate} stroke="var(--gold)" strokeDasharray="4 4" strokeWidth={1} />
                  )}
                  <Bar dataKey="total" fill="var(--brand)" radius={[5, 5, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </motion.div>

        <div className="sd-section-head">
          <h2 className="sd-section-title">Metas de ahorro</h2>
          {goals.length > 0 && <span className="sd-section-sub">{goals.length} {goals.length === 1 ? "meta" : "metas"}</span>}
        </div>

        <div className="sd-grid">
          {goals.length === 0 && (
            <motion.div
              className="sd-empty-state"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <p className="sd-empty-text">
                Aún no tienes metas creadas. Empieza por crear tu primera meta de ahorro.
              </p>
            </motion.div>
          )}
          <AnimatePresence mode="popLayout">
            {goals.map((g, idx) => {
              const isAdding = addingTo === g.id;
              const isEditingTarget = editingTarget === g.id;
              const isEditingAllocation = editingAllocation === g.id;
              const isExpanded = !!expanded[g.id];

              return (
                <GoalCard
                  key={g.id}
                  goal={g}
                  monthlyRate={monthlyRate}
                  isAdding={isAdding}
                  isExpanded={isExpanded}
                  isEditingTarget={isEditingTarget}
                  isEditingAllocation={isEditingAllocation}
                  movementKind={movementKind}
                  amountInput={amountInput}
                  tempTarget={tempTarget}
                  tempTargetDate={tempTargetDate}
                  tempAllocation={tempAllocation}
                  idx={idx}
                  onAddClick={(id) => {
                    setAddingTo(id);
                    setAmountInput("");
                    setMovementKind("deposit");
                  }}
                  onExpandClick={(id) => setExpanded((p) => ({ ...p, [id]: !p[id] }))}
                  onDeleteClick={(id) => setDeleteTarget({ kind: "goal", id, title: g.title })}
                  onEditTargetClick={(id, target) => {
                    setEditingTarget(id);
                    setTempTarget(target);
                    setTempTargetDate(g.targetDate ? g.targetDate.slice(0, 10) : "");
                  }}
                  onSaveTargetClick={handleEditTarget}
                  onCancelTargetClick={() => setEditingTarget(null)}
                  onEditAllocationClick={(id, current) => {
                    setEditingAllocation(id);
                    setTempAllocation(String(current));
                  }}
                  onSaveAllocationClick={handleSaveAllocation}
                  onCancelAllocationClick={() => setEditingAllocation(null)}
                  onResetAllocationClick={handleResetAllocation}
                  onTempAllocationChange={setTempAllocation}
                  onMovementKindChange={setMovementKind}
                  onAmountChange={setAmountInput}
                  onQuickAmountClick={(amount) => setAmountInput(String(amount))}
                  onConfirmMovement={handleAddMovement}
                  onCancelMovement={() => setAddingTo(null)}
                  onTempTargetChange={setTempTarget}
                  onTempTargetDateChange={setTempTargetDate}
                  formatSoles={formatSoles}
                  simulatedAmount={simulation?.goalId === g.id ? simulatedDebt?.outstanding : undefined}
                  simulatedLabel={simulation?.goalId === g.id ? simulatedDebt?.person : undefined}
                  onClearSimulation={() => setSimulation(null)}
                  movementHistory={{
                    items: movementPages[g.id] ?? [],
                    hasMore: movementHasMore[g.id] ?? false,
                    isLoadingMore: loadingMoreFor === g.id,
                    onLoadMore: () => handleLoadMoreMovements(g.id),
                    editingId: editingMovement?.goalId === g.id ? editingMovement.movementId : null,
                    editAmount: movementEditAmount,
                    editKind: movementEditKind,
                    editDesc: movementEditDesc,
                    onEditClick: (movementId, current) => handleEditMovementClick(g.id, current),
                    onEditAmountChange: setMovementEditAmount,
                    onEditKindChange: setMovementEditKind,
                    onEditDescChange: setMovementEditDesc,
                    onSaveEdit: handleSaveMovementEdit,
                    onCancelEdit: handleCancelMovementEdit,
                    onDeleteClick: (movementId) => setDeleteTarget({ kind: "movement", goalId: g.id, movementId }),
                  }}
                />
              );
            })}
          </AnimatePresence>

          <div className="sd-newgoal-area">
            {!showNewGoal ? (
              <motion.button whileTap={{ scale: 0.96 }} className="sd-btn" onClick={() => setShowNewGoal(true)}>
                <Plus size={15} /> Nueva meta
              </motion.button>
            ) : (
              <motion.div
                className="sd-newgoal-form"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
              >
                <input
                  type="text"
                  placeholder="Nombre de la meta"
                  value={newGoalName}
                  onChange={(e) => setNewGoalName(e.target.value)}
                  autoFocus
                  aria-label="Nombre de la nueva meta"
                />
                <input
                  type="number"
                  placeholder="Monto objetivo (opcional)"
                  value={newGoalTarget}
                  onChange={(e) => setNewGoalTarget(e.target.value)}
                  aria-label="Monto objetivo"
                />
                <input
                  type="number"
                  placeholder="Monto ya ahorrado (opcional)"
                  value={newGoalInitial}
                  onChange={(e) => setNewGoalInitial(e.target.value)}
                  aria-label="Monto ya ahorrado"
                />
                <input
                  type="date"
                  value={newGoalTargetDate}
                  onChange={(e) => setNewGoalTargetDate(e.target.value)}
                  aria-label="Fecha objetivo (opcional)"
                />
                <div className="sd-newgoal-form-actions">
                  <button className="sd-btn" onClick={handleCreateGoal}>
                    <Check size={14} /> Crear
                  </button>
                  <button className="sd-link-btn" onClick={() => {
                    setShowNewGoal(false);
                    setNewGoalTargetDate("");
                    setNewGoalInitial("");
                  }}>
                    <X size={14} /> Cancelar
                  </button>
                </div>
              </motion.div>
            )}
          </div>
        </div>

        <DebtsSection
          debts={debts}
          totalReceivable={totalReceivable}
          formatSoles={formatSoles}
          onChanged={loadData}
          onError={setErrorMsg}
          onRequestDelete={setDeleteTarget}
          goals={goals.map((g): SimulationTargetGoal => ({
            id: g.id, title: g.title, icon: g.icon, targetAmount: g.targetAmount, isCompleted: g.isCompleted,
          }))}
          simulation={simulation}
          onSimulate={(debtId, goalId) => setSimulation({ debtId, goalId })}
          onClearSimulation={() => setSimulation(null)}
        />
      </div>
    </main>
  );
}
