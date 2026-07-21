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
import GoalCard from "@/components/GoalCard";
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
        background: "var(--paper)",
        border: "1px solid var(--paper-line)",
        boxShadow: "2px 2px 0 rgba(30,42,56,0.1)",
        padding: "8px 10px",
        fontFamily: "'IBM Plex Mono',monospace",
        fontSize: 12,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 2 }}>{row.label}</div>
      <div style={{ color: met ? "#0F5C41" : "#A93226" }}>{formatSoles(row.total)}</div>
    </div>
  );
}

export default function SavingsLedger() {
  const [goals, setGoals] = useState<GoalData[]>([]);
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
  const [showNewGoal, setShowNewGoal] = useState(false);
  const [newGoalName, setNewGoalName] = useState("");
  const [newGoalTarget, setNewGoalTarget] = useState("");
  const [editingRate, setEditingRate] = useState(false);
  const [tempRate, setTempRate] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [newGoalTargetDate, setNewGoalTargetDate] = useState("");
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
    const [gRes, mRes, rRes] = await Promise.all([getGoals(), getMonthlySummary(), getMonthlyRate()]);
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
  }, []);

  useEffect(() => {
    loadData().then(() => {
      setLoaded(true);
      setIsLoading(false);
    });
  }, [loadData]);

  useEffect(() => {
    if (!loaded) return;
    try {
      const saved = localStorage.getItem("monthlyRate");
      if (saved) setMonthlyRate(Number(saved));
    } catch {}
  }, [loaded]);

  useEffect(() => {
    try {
      localStorage.setItem("monthlyRate", String(monthlyRate));
    } catch {}
    updateMonthlyRate(monthlyRate).catch(() => {});
  }, [monthlyRate]);

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

  async function handleCreateGoal() {
    const name = newGoalName.trim();
    if (!name) return;
    const targetVal = parseFloat(newGoalTarget);
    const res = await createGoal({
      title: name,
      icon: "⭐",
      targetAmount: !isNaN(targetVal) && targetVal > 0 ? targetVal : 0,
      targetDate: newGoalTargetDate || undefined,
    });
    if (res.success) {
      setShowNewGoal(false);
      setNewGoalName("");
      setNewGoalTarget("");
      setNewGoalTargetDate("");
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
    } else {
      const res = await deleteMovement(target.goalId, target.movementId);
      if (res.success) {
        setDeleteTarget(null);
        await loadData();
      } else {
        setErrorMsg(res.error ?? "Error al eliminar el movimiento");
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
          --paper: #F0E9D6;
          --paper-line: #C9BC9C;
          --ink: #1E2A38;
          --cover: #0F5C41;
          --stamp: #A93226;
          --gold: #8A6A24;
          --gold-light: #FFD700;
          font-family: 'Source Serif 4', serif;
          color: var(--ink);
          background: var(--paper);
          background-image: linear-gradient(var(--paper) 39px, var(--paper-line) 40px);
          background-size: 100% 40px;
          min-height: 100vh;
          padding: 0 0 48px 0;
        }
        .sd-root * { box-sizing: border-box; }
        .sd-root button:focus-visible,
        .sd-root input:focus-visible {
          outline: 2px solid var(--cover);
          outline-offset: 2px;
        }
        .sd-cover {
          background: var(--cover);
          color: var(--paper);
          padding: clamp(20px, 5vw, 28px) clamp(18px, 5vw, 28px) 24px;
          position: relative;
          overflow: hidden;
        }
        .sd-cover::after {
          content: "";
          position: absolute;
          inset: 6px;
          border: 1px solid rgba(240,233,214,0.35);
          pointer-events: none;
        }
        .sd-eyebrow {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 11px;
          letter-spacing: 2.5px;
          text-transform: uppercase;
          opacity: 0.75;
          margin: 0 0 6px;
        }
        .sd-title {
          font-family: 'Special Elite', cursive;
          font-size: clamp(22px, 5vw, 30px);
          margin: 0 0 4px;
          letter-spacing: 1px;
        }
        .sd-subtitle {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 12px;
          opacity: 0.85;
          margin: 0 0 20px;
        }
        .sd-balance-row {
          display: flex;
          align-items: baseline;
          gap: 10px;
          flex-wrap: wrap;
        }
        .sd-balance-label {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 11px;
          letter-spacing: 2px;
          text-transform: uppercase;
          opacity: 0.75;
        }
        .sd-balance-amount {
          font-family: 'IBM Plex Mono', monospace;
          font-size: clamp(28px, 8vw, 40px);
          font-weight: 600;
          color: var(--gold-light);
        }
        .sd-progress-wrap {
          margin-top: 16px;
        }
        .sd-progress-track {
          height: 8px;
          background: rgba(240,233,214,0.2);
          overflow: hidden;
        }
        .sd-progress-fill {
          height: 100%;
          background: #E8C468;
        }
        .sd-progress-caption {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 11.5px;
          opacity: 0.85;
          margin-top: 8px;
          display: flex;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 8px;
        }
        .sd-rate-edit {
          background: none;
          border: none;
          color: var(--gold-light);
          text-decoration: underline dotted;
          cursor: pointer;
          font-family: 'IBM Plex Mono', monospace;
          font-size: 11.5px;
          padding: 4px 0;
          min-height: 32px;
        }
        .sd-rate-form {
          display: inline-flex;
          gap: 6px;
          align-items: center;
        }
        .sd-rate-form input {
          width: 90px;
          font-family: 'IBM Plex Mono', monospace;
          font-size: 13px;
          padding: 6px 6px;
          border: 1px solid var(--paper-line);
        }
        .sd-monthly-card {
          margin: 20px clamp(14px, 4vw, 28px) 0;
          padding: 14px clamp(14px, 4vw, 20px);
          background: var(--paper);
          border: 1px solid var(--paper-line);
          box-shadow: 2px 2px 0 rgba(30,42,56,0.06);
        }
        .sd-monthly-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 10px;
        }
        .sd-monthly-label {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 1px;
          text-transform: uppercase;
          color: var(--ink);
        }
        .sd-monthly-sub {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 13px;
          color: #6b6455;
          margin-top: 2px;
        }
        .sd-chart-wrap {
          margin-top: 14px;
          height: 120px;
        }
        .sd-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
          gap: 20px;
          padding: clamp(14px, 4vw, 28px);
        }
        .sd-card {
          background: var(--paper);
          border: 1px solid var(--paper-line);
          padding: 18px 18px 16px;
          position: relative;
          box-shadow: 2px 2px 0 rgba(30,42,56,0.06);
        }
        .sd-card-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 8px;
        }
        .sd-card-name {
          font-family: 'Special Elite', cursive;
          font-size: 15px;
          margin: 0 0 10px;
          padding-right: 60px;
          word-break: break-word;
        }
        .sd-card-amounts {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 20px;
          font-weight: 600;
          display: flex;
          align-items: baseline;
          gap: 4px;
          flex-wrap: wrap;
        }
        .sd-card-of {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 13px;
          font-weight: 400;
          color: #6b6455;
        }
        .sd-edit-btn {
          background: none;
          border: none;
          cursor: pointer;
          color: #6b6455;
          padding: 6px;
          display: inline-flex;
          min-width: 28px;
          min-height: 28px;
          align-items: center;
          justify-content: center;
        }
        .sd-target-form {
          display: inline-flex;
          gap: 6px;
          align-items: center;
          margin-top: 6px;
        }
        .sd-target-form {
          flex-wrap: wrap;
        }
        .sd-target-form input {
          width: 100px;
          font-family: 'IBM Plex Mono', monospace;
          font-size: 13px;
          padding: 6px 7px;
          border: 1px solid var(--paper-line);
        }
        .sd-target-form input[type="date"] {
          width: 140px;
        }
        .sd-icon-btn {
          background: none;
          border: none;
          cursor: pointer;
          color: var(--cover);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 32px;
          min-height: 32px;
        }
        .sd-bar-track {
          height: 10px;
          background: rgba(30,42,56,0.08);
          margin-top: 12px;
          overflow: hidden;
          position: relative;
        }
        .sd-bar-fill {
          height: 100%;
          background: var(--cover);
        }
        .sd-bar-fill.complete { background: var(--gold); }
        .sd-pct {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 11px;
          color: #6b6455;
          margin-top: 6px;
        }
        .sd-projection {
          font-family: 'Source Serif 4', serif;
          font-style: italic;
          font-size: 12px;
          color: #6b6455;
          margin-top: 6px;
        }
        .sd-stamp {
          position: absolute;
          top: 10px;
          right: 8px;
          width: 78px;
          height: 78px;
          pointer-events: none;
        }
        .sd-stamp-ring {
          width: 100%;
          height: 100%;
          border: 2.5px solid var(--stamp);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0.82;
          mix-blend-mode: multiply;
        }
        .sd-stamp-ring::before {
          content: "";
          position: absolute;
          inset: 5px;
          border: 1px solid var(--stamp);
          border-radius: 50%;
        }
        .sd-stamp-ring span {
          font-family: 'Special Elite', cursive;
          font-size: 9.5px;
          color: var(--stamp);
          letter-spacing: 0.5px;
          text-align: center;
          line-height: 1.2;
          padding: 0 6px;
        }
        .sd-actions {
          margin-top: 14px;
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
          align-items: center;
        }
        .sd-btn {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 12px;
          background: var(--cover);
          color: var(--paper);
          border: none;
          padding: 9px 14px;
          min-height: 38px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
        }
        .sd-btn-sm {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 11px;
          background: none;
          border: 1px solid var(--paper-line);
          color: var(--ink);
          padding: 6px 10px;
          min-height: 34px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }
        .sd-link-btn {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 11.5px;
          background: none;
          border: none;
          color: var(--ink);
          cursor: pointer;
          text-decoration: underline dotted;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 6px 2px;
          min-height: 32px;
        }
        .sd-link-btn.danger { color: var(--stamp); }
        .sd-add-form {
          margin-top: 12px;
          padding-top: 12px;
          border-top: 1px dashed var(--paper-line);
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          align-items: center;
          overflow: hidden;
        }
        .sd-kind-toggle {
          display: flex;
          width: 100%;
          border: 1px solid var(--paper-line);
        }
        .sd-kind-btn {
          flex: 1;
          font-family: 'IBM Plex Mono', monospace;
          font-size: 11.5px;
          padding: 8px 6px;
          min-height: 36px;
          background: transparent;
          border: none;
          cursor: pointer;
          color: var(--ink);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
        }
        .sd-kind-btn.active.deposit { background: var(--cover); color: var(--paper); }
        .sd-kind-btn.active.withdrawal { background: var(--stamp); color: var(--paper); }
        .sd-add-form input {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 14px;
          padding: 8px 9px;
          min-height: 38px;
          border: 1px solid var(--paper-line);
          background: #fff;
        }
        .sd-add-form input[type="number"] { width: 100%; }
        .sd-quick-amounts { display:flex; gap:4px; flex-wrap:wrap; width:100%; }
        .sd-qty-btn {
          font-family:'IBM Plex Mono',monospace; font-size:11px; background:rgba(30,42,56,0.04);
          border:1px solid var(--paper-line); padding:6px 9px; min-height:32px; cursor:pointer; color:var(--ink);
        }
        .sd-history {
          margin-top: 10px;
          border-top: 1px dashed var(--paper-line);
          padding-top: 8px;
          overflow: hidden;
        }
        .sd-history-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
          font-family: 'IBM Plex Mono', monospace;
          font-size: 12px;
          padding: 5px 0;
          color: #4a4436;
        }
        .sd-history-left {
          display: flex;
          align-items: center;
          gap: 6px;
          min-width: 0;
        }
        .sd-history-desc {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: #6b6455;
        }
        .sd-history-amt.deposit { color: var(--cover); }
        .sd-history-amt.withdrawal { color: var(--stamp); }
        .sd-history-empty {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 12px;
          color: #948c78;
          font-style: italic;
        }
        .sd-history-row-actions {
          display: flex;
          gap: 2px;
          flex-shrink: 0;
        }
        .sd-history-icon-btn {
          background: none;
          border: none;
          cursor: pointer;
          color: #948c78;
          padding: 4px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 24px;
          min-height: 24px;
        }
        .sd-movement-edit-form {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          align-items: center;
          padding: 6px 0;
          width: 100%;
        }
        .sd-movement-edit-form input[type="number"] {
          width: 90px;
          font-family: 'IBM Plex Mono', monospace;
          font-size: 12px;
          padding: 6px 7px;
          border: 1px solid var(--paper-line);
        }
        .sd-movement-edit-form input[type="text"] {
          flex: 1;
          min-width: 100px;
          font-family: 'IBM Plex Mono', monospace;
          font-size: 12px;
          padding: 6px 7px;
          border: 1px solid var(--paper-line);
        }
        .sd-movement-edit-kind {
          display: flex;
          border: 1px solid var(--paper-line);
        }
        .sd-movement-edit-kind button {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 11px;
          padding: 6px 8px;
          background: transparent;
          border: none;
          cursor: pointer;
          color: var(--ink);
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .sd-movement-edit-kind button.active.deposit { background: var(--cover); color: var(--paper); }
        .sd-movement-edit-kind button.active.withdrawal { background: var(--stamp); color: var(--paper); }
        .sd-load-more-btn {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 11px;
          background: none;
          border: 1px dashed var(--paper-line);
          color: var(--ink);
          padding: 6px 10px;
          min-height: 32px;
          cursor: pointer;
          width: 100%;
          margin-top: 6px;
        }
        .sd-load-more-btn:disabled {
          opacity: 0.6;
          cursor: default;
        }
        .sd-projection-track {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 12px;
          margin-top: 6px;
          display: flex;
          align-items: center;
          gap: 5px;
        }
        .sd-projection-track.on-track { color: var(--cover); }
        .sd-projection-track.behind { color: var(--stamp); }
        .sd-empty-state {
          grid-column: 1 / -1;
          padding: 40px 20px;
          text-align: center;
        }
        .sd-empty-text {
          font-family: 'Source Serif 4', serif;
          font-size: 16px;
          color: #6b6455;
          line-height: 1.6;
          margin: 0;
        }
        .sd-newgoal-area {
          border: 2px dashed var(--paper-line);
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 130px;
          background: transparent;
          padding: 18px;
        }
        .sd-newgoal-form {
          display: flex;
          flex-direction: column;
          gap: 8px;
          width: 100%;
        }
        .sd-newgoal-form input {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 14px;
          padding: 9px 10px;
          min-height: 38px;
          border: 1px solid var(--paper-line);
        }
        .sd-newgoal-form-actions {
          display: flex;
          gap: 8px;
        }

        @media (max-width: 600px) {
          .sd-grid { grid-template-columns: 1fr; }
        }
        @media (max-width: 480px) {
          .sd-monthly-head { flex-direction: column; align-items: flex-start; }
        }
        .sd-toast {
          position: fixed;
          left: 50%;
          bottom: 20px;
          transform: translateX(-50%);
          background: var(--stamp);
          color: var(--paper);
          font-family: 'IBM Plex Mono', monospace;
          font-size: 12.5px;
          padding: 10px 16px;
          box-shadow: 2px 2px 0 rgba(30,42,56,0.2);
          z-index: 50;
          max-width: calc(100vw - 32px);
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 12px;
          min-height: 44px;
        }
        .sd-toast:hover {
          background: #9d3a2f;
        }
        .sd-toast:focus-visible {
          outline: 2px solid var(--paper);
          outline-offset: 2px;
        }
        .sd-toast-text {
          flex: 1;
        }
        .sd-toast-close {
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .sd-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(30, 42, 56, 0.4);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 100;
          padding: 20px;
        }
        .sd-modal {
          background: var(--paper);
          border: 1px solid var(--paper-line);
          padding: 24px;
          max-width: 340px;
          box-shadow: 4px 4px 0 rgba(30, 42, 56, 0.15);
        }
        .sd-modal-title {
          font-family: 'Special Elite', cursive;
          font-size: 18px;
          margin: 0 0 12px;
          color: var(--stamp);
        }
        .sd-modal-text {
          font-family: 'Source Serif 4', serif;
          font-size: 14px;
          line-height: 1.5;
          color: var(--ink);
          margin: 0 0 20px;
        }
        .sd-modal-actions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .sd-modal-actions .sd-btn {
          flex: 1;
          min-width: 100px;
        }
        .sd-skeleton {
          padding: 0 0 48px 0;
        }
        .sd-skeleton-cover {
          height: 200px;
          background: rgba(15, 92, 65, 0.1);
          margin-bottom: 20px;
        }
        .sd-skeleton-card {
          height: 140px;
          background: rgba(15, 92, 65, 0.1);
          margin: 20px clamp(14px, 4vw, 28px) 0;
          border: 1px solid rgba(15, 92, 65, 0.15);
        }
        .sd-skeleton-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
          gap: 20px;
          padding: clamp(14px, 4vw, 28px);
        }
        .sd-skeleton-card-sm {
          height: 200px;
          background: rgba(15, 92, 65, 0.1);
          border: 1px solid rgba(15, 92, 65, 0.15);
        }
      `}</style>

      <Toast message={errorMsg} onClose={() => setErrorMsg(null)} />

      <DeleteConfirmModal
        target={deleteTarget}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {isLoading && <Skeleton />}

      <div style={{ display: isLoading ? "none" : "block" }}>
        <motion.div
          className="sd-cover"
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <p className="sd-eyebrow">Libreta de Ahorros</p>
        <h1 className="sd-title">Mis Metas de Ahorro</h1>
        <p className="sd-subtitle">Jeffry &middot; Lima, Per&uacute;</p>

        <div className="sd-balance-row">
          <span className="sd-balance-label">Saldo total</span>
        </div>
        <div className="sd-balance-amount">{formatSoles(totalCurrentAll)}</div>

        <div className="sd-progress-wrap">
          <div className="sd-progress-track">
            <motion.div
              className="sd-progress-fill"
              initial={{ width: 0 }}
              animate={{ width: overallPct + "%" }}
              transition={{ duration: 0.7, ease: "easeOut" }}
            />
          </div>
          <div className="sd-progress-caption">
            <span>
              {overallPct.toFixed(1)}% de tus metas con objetivo &middot; {formatSoles(totalCurrentTargeted)} de{" "}
              {formatSoles(totalTarget)}
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
                <button className="sd-icon-btn" onClick={() => { const v = parseFloat(tempRate); if (!isNaN(v) && v > 0) { setMonthlyRate(v); setEditingRate(false); } }} aria-label="Guardar">
                  <Check size={14} color="#E8C468" />
                </button>
                <button className="sd-icon-btn" onClick={() => setEditingRate(false)} aria-label="Cancelar">
                  <X size={14} color="#E8C468" />
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
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <span style={{fontSize:24,lineHeight:1}}>{monthlyMet ? '✅' : '⏳'}</span>
            <div>
              <p className="sd-monthly-label">Ahorro Mensual</p>
              <p className="sd-monthly-sub">
                {formatSoles(currentMonthTotal)} de {formatSoles(monthlyRate)}
                {!monthlyMet && monthRemaining > 0 && (
                  <span> &middot; faltan {formatSoles(monthRemaining)}</span>
                )}
              </p>
            </div>
          </div>
        </div>

        {chartData.length > 0 && (
          <div className="sd-chart-wrap" role="img" aria-label={`Gráfico de ahorros mensuales. Últimos 6 meses. Meta mensual: ${formatSoles(monthlyRate)}. Mes actual: ${formatSoles(currentMonthTotal)}`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="rgba(30,42,56,0.12)" strokeDasharray="0" />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontFamily: "IBM Plex Mono", fontSize: 11, fill: "#6b6455" }}
                />
                <YAxis hide />
                <Tooltip content={<MonthlyTooltip monthlyRate={monthlyRate} />} cursor={{ fill: "rgba(30,42,56,0.05)" }} />
                {monthlyRate > 0 && (
                  <ReferenceLine y={monthlyRate} stroke="#8A6A24" strokeDasharray="4 4" strokeWidth={1} />
                )}
                <Bar dataKey="total" fill="#0F5C41" radius={[4, 4, 0, 0]} maxBarSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </motion.div>

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
            const isExpanded = !!expanded[g.id];

            return (
              <GoalCard
                key={g.id}
                goal={g}
                monthlyRate={monthlyRate}
                isAdding={isAdding}
                isExpanded={isExpanded}
                isEditingTarget={isEditingTarget}
                movementKind={movementKind}
                amountInput={amountInput}
                tempTarget={tempTarget}
                tempTargetDate={tempTargetDate}
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
                onMovementKindChange={setMovementKind}
                onAmountChange={setAmountInput}
                onQuickAmountClick={(amount) => setAmountInput(String(amount))}
                onConfirmMovement={handleAddMovement}
                onCancelMovement={() => setAddingTo(null)}
                onTempTargetChange={setTempTarget}
                onTempTargetDateChange={setTempTargetDate}
                formatSoles={formatSoles}
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
              <Plus size={14} /> Nueva meta
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
                type="date"
                value={newGoalTargetDate}
                onChange={(e) => setNewGoalTargetDate(e.target.value)}
                aria-label="Fecha objetivo (opcional)"
              />
              <div className="sd-newgoal-form-actions">
                <button className="sd-btn" onClick={handleCreateGoal}>
                  <Check size={13} /> Crear
                </button>
                <button className="sd-link-btn" onClick={() => {
                  setShowNewGoal(false);
                  setNewGoalTargetDate("");
                }}>
                  <X size={13} /> Cancelar
                </button>
              </div>
            </motion.div>
          )}
        </div>
      </div>
      </div>
    </main>
  );
}
