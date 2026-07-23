"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
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
import { Plus, X, Check, Pencil, Lock } from "lucide-react";
import { usePinLock } from "@/lib/usePinLock";
import PinOverlay, { type PinOverlayMode } from "@/components/PinOverlay";

import "./savings.css";
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
import { simulatePortfolio } from "@/lib/projection";
import GoalCard from "@/components/GoalCard";
import StatTile from "@/components/StatTile";
import AllocationDonut from "@/components/AllocationDonut";
import InsightsPanel from "@/components/InsightsPanel";
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

type MovementKind = "deposit" | "withdrawal";

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
  const pinLock = usePinLock();
  const [pinModalMode, setPinModalMode] = useState<PinOverlayMode>(null);
  const [goals, setGoals] = useState<GoalData[]>([]);
  const [debts, setDebts] = useState<DebtData[]>([]);
  const [totalReceivable, setTotalReceivable] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [monthlyRate, setMonthlyRate] = useState(1421);
  const [currentMonthTotal, setCurrentMonthTotal] = useState(0);
  const [monthHistory, setMonthHistory] = useState<MonthRow[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  // Formularios transitorios de edición, agrupados uno por formulario (antes eran
  // ~19 useState sueltos). Cada objeto reúne los campos que siempre cambian juntos.
  //
  // "Agregar movimiento" a una meta (goalId = meta abierta, o null si ninguna).
  const [addForm, setAddForm] = useState<{ goalId: string | null; kind: MovementKind; amount: string }>({
    goalId: null, kind: "deposit", amount: "",
  });
  // Edición del monto/fecha objetivo de una meta (id = meta en edición, o null).
  const [targetEdit, setTargetEdit] = useState<{ id: string | null; amount: string; date: string }>({
    id: null, amount: "", date: "",
  });
  // Edición del % de asignación mensual de una meta.
  const [allocEdit, setAllocEdit] = useState<{ id: string | null; value: string }>({
    id: null, value: "",
  });
  // Edición del ahorro mensual estimado (rate) en el hero.
  const [rateEdit, setRateEdit] = useState<{ editing: boolean; value: string }>({
    editing: false, value: "",
  });
  // Formulario "nueva meta".
  const [newGoal, setNewGoal] = useState<{ show: boolean; name: string; target: string; date: string; initial: string }>({
    show: false, name: "", target: "", date: "", initial: "",
  });
  // Edición de un movimiento ya registrado (null = ninguno en edición).
  const [movementEdit, setMovementEdit] = useState<
    { goalId: string; movementId: string; amount: string; kind: MovementKind; desc: string } | null
  >(null);
  // Simulación "¿y si me pagan esta deuda?" — solo visual, nunca se persiste ni cambia currentAmount real.
  const [simulation, setSimulation] = useState<{ debtId: string; goalId: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [isLoading, setIsLoading] = useState(true);
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
    const v = parseFloat(rateEdit.value);
    if (isNaN(v) || v <= 0) return;
    setMonthlyRate(v);
    setRateEdit((s) => ({ ...s, editing: false }));
    try {
      localStorage.setItem("monthlyRate", String(v));
    } catch {}
    updateMonthlyRate(v).catch(() => {});
  }

  const simulatedDebt = simulation ? debts.find((d) => d.id === simulation.debtId) : null;

  // Proyección de cascada: al completarse una meta, su % liberado se reasigna a las demás
  // (misma regla que `computeAllocations` en el server) — así el estimado de cada meta
  // refleja que se acelera cuando otra meta termina antes, no una tasa constante para siempre.
  const portfolioProjection = useMemo(
    () => simulatePortfolio(
      goals.map((g) => ({
        id: g.id,
        currentAmount: g.currentAmount,
        targetAmount: g.targetAmount,
        isCompleted: g.isCompleted,
        allocationPct: g.allocationPct,
        allocationManual: g.allocationManual,
      })),
      monthlyRate
    ),
    [goals, monthlyRate]
  );

  const totalCurrentAll = goals.reduce((s, g) => s + g.currentAmount, 0);
  const targeted = goals.filter((g) => g.targetAmount > 0);
  const totalCurrentTargeted = targeted.reduce((s, g) => s + g.currentAmount, 0);
  const totalTarget = targeted.reduce((s, g) => s + g.targetAmount, 0);
  const overallPct = totalTarget > 0 ? Math.min(100, (totalCurrentTargeted / totalTarget) * 100) : 0;
  const monthlyMet = currentMonthTotal >= monthlyRate;
  const monthRemaining = Math.max(0, monthlyRate - currentMonthTotal);

  // Racha: meses consecutivos cumpliendo la meta mensual, mirando hacia atrás
  // desde el mes actual (solo cuenta el mes en curso si ya está cumplido).
  const streak = useMemo(() => {
    if (monthlyRate <= 0) return 0;
    let count = 0;
    for (let i = monthlyMet ? 0 : 1; i < monthHistory.length; i++) {
      if (monthHistory[i].total >= monthlyRate) count++;
      else break;
    }
    return count;
  }, [monthHistory, monthlyRate, monthlyMet]);

  const chartData = monthHistory
    .slice(0, 12)
    .reverse()
    .map((m) => ({ ...m, label: MONTH_LABELS[m.month] }));

  async function handleAddMovement(id: string) {
    const amt = parseFloat(addForm.amount);
    if (!amt || amt <= 0) return;
    const res = await addMovement(id, { amount: amt, type: addForm.kind });
    if (res.success) {
      setAddForm((s) => ({ ...s, goalId: null, amount: "" }));
      await loadData();
    } else {
      setErrorMsg(res.error ?? "Error al registrar el movimiento");
    }
  }

  async function handleEditTarget(id: string) {
    const val = parseFloat(targetEdit.amount);
    if (isNaN(val) || val < 0) return;
    const res = await updateGoal(id, { targetAmount: val, targetDate: targetEdit.date || null });
    if (res.success) {
      setTargetEdit((s) => ({ ...s, id: null, date: "" }));
      await loadData();
    } else {
      setErrorMsg(res.error ?? "Error al actualizar el objetivo");
    }
  }

  async function handleSaveAllocation(id: string) {
    const raw = parseFloat(allocEdit.value);
    if (isNaN(raw) || raw < 0 || raw > 100) return;
    const val = Math.round(raw);
    const res = await updateGoal(id, { allocationPct: val });
    if (res.success) {
      setAllocEdit((s) => ({ ...s, id: null }));
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
    const name = newGoal.name.trim();
    if (!name) return;
    const targetVal = parseFloat(newGoal.target);
    const initialVal = parseFloat(newGoal.initial);
    const res = await createGoal({
      title: name,
      icon: "⭐",
      targetAmount: !isNaN(targetVal) && targetVal > 0 ? targetVal : 0,
      targetDate: newGoal.date || undefined,
      initialAmount: !isNaN(initialVal) && initialVal > 0 ? initialVal : undefined,
    });
    if (res.success) {
      setNewGoal({ show: false, name: "", target: "", date: "", initial: "" });
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
    setMovementEdit({
      goalId,
      movementId: movement.id,
      amount: String(movement.amount),
      kind: movement.type,
      desc: movement.description ?? "",
    });
  }

  function handleCancelMovementEdit() {
    setMovementEdit(null);
  }

  async function handleSaveMovementEdit() {
    if (!movementEdit) return;
    const amt = parseFloat(movementEdit.amount);
    if (!amt || amt <= 0) return;
    const res = await updateMovement(movementEdit.goalId, movementEdit.movementId, {
      amount: amt,
      type: movementEdit.kind,
      description: movementEdit.desc.trim() || undefined,
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
      <PinOverlay
        mode={pinLock.locked ? "locked" : pinModalMode}
        onUnlock={pinLock.unlock}
        onSetPin={pinLock.setPin}
        onRemovePin={pinLock.removePin}
        onClose={() => setPinModalMode(null)}
      />

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
          <button
            className="pin-trigger"
            onClick={() => setPinModalMode(pinLock.hasPin ? "manage" : "setup")}
            aria-label={pinLock.hasPin ? "Configurar PIN" : "Activar PIN"}
            title={pinLock.hasPin ? "PIN activado" : "Activar PIN local"}
          >
            <Lock size={15} />
          </button>
          <ThemeToggle />
        </div>
      </div>

      {(isLoading || !pinLock.ready) && <div className="sd-wrap"><Skeleton /></div>}

      <div className="sd-wrap" style={{ display: isLoading || !pinLock.ready ? "none" : "block" }}>
        <motion.section
          className="sd-resumen"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="sd-kpis">
            <StatTile
              label="Saldo total"
              value={formatSoles(totalCurrentAll)}
              accent="brand"
              sub={totalTarget > 0 ? `${overallPct.toFixed(0)}% de tus metas` : "Sin objetivo definido"}
            />
            <StatTile
              label="Este mes"
              value={formatSoles(currentMonthTotal)}
              accent={monthlyMet ? "brand" : "gold"}
              sub={
                monthlyMet
                  ? `Meta cumplida · ${formatSoles(monthlyRate)}`
                  : `de ${formatSoles(monthlyRate)} · faltan ${formatSoles(monthRemaining)}`
              }
            />
            <StatTile
              label="Por cobrar"
              value={totalReceivable > 0 ? formatSoles(totalReceivable) : "—"}
              accent="neutral"
              sub={totalReceivable > 0 ? "Deudas a tu favor" : "Nada pendiente"}
            />
            <StatTile
              label="Racha"
              value={streak > 0 ? `${streak} ${streak === 1 ? "mes" : "meses"}` : "—"}
              accent="gold"
              sub={
                streak >= 2
                  ? "🔥 meses seguidos"
                  : streak === 1
                  ? "¡vas empezando!"
                  : "Cumple tu meta mensual"
              }
            />
          </div>

          <div className="sd-progress-band">
            <div className="sd-pb-top">
              <span className="sd-pb-title">Progreso hacia tus metas</span>
              <span className="sd-pb-amounts sd-mono">
                {formatSoles(totalCurrentTargeted)} de {formatSoles(totalTarget)}
              </span>
            </div>
            <div className="sd-pb-track">
              <motion.div
                className={"sd-pb-fill" + (overallPct >= 100 ? " complete" : "")}
                initial={{ width: 0 }}
                animate={{ width: overallPct + "%" }}
                transition={{ duration: 0.7, ease: "easeOut" }}
              />
            </div>
            <div className="sd-pb-foot">
              <span className="sd-pb-pct sd-mono">{overallPct.toFixed(1)}%</span>
              {!rateEdit.editing ? (
                <button
                  className="sd-rate-btn"
                  onClick={() => setRateEdit({ editing: true, value: String(monthlyRate) })}
                >
                  Ahorro mensual: {formatSoles(monthlyRate)}
                  <Pencil size={13} />
                </button>
              ) : (
                <span className="sd-rate-form2">
                  <input
                    type="number"
                    className="sd-rate-input"
                    value={rateEdit.value}
                    onChange={(e) => setRateEdit((s) => ({ ...s, value: e.target.value }))}
                    autoFocus
                    aria-label="Ahorro mensual estimado"
                  />
                  <button className="sd-icon-btn" onClick={handleSaveRate} aria-label="Guardar">
                    <Check size={15} />
                  </button>
                  <button className="sd-icon-btn" onClick={() => setRateEdit((s) => ({ ...s, editing: false }))} aria-label="Cancelar">
                    <X size={15} />
                  </button>
                </span>
              )}
            </div>
          </div>
        </motion.section>

        <motion.div
          className="sd-dashgrid"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          <AllocationDonut goals={goals} monthlyRate={monthlyRate} formatSoles={formatSoles} />

          <div className="sd-trend-card">
            <div className="sd-trend-head">
              <span className="sd-trend-title">Tendencia mensual</span>
              <span className="sd-trend-sub sd-mono">Meta {formatSoles(monthlyRate)}</span>
            </div>
            {chartData.length > 0 ? (
              <div className="sd-trend-chart" role="img" aria-label={`Gráfico de ahorros mensuales. Meta mensual: ${formatSoles(monthlyRate)}. Mes actual: ${formatSoles(currentMonthTotal)}`}>
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
                    <Bar dataKey="total" fill="var(--brand)" radius={[5, 5, 0, 0]} maxBarSize={30} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="sd-trend-empty">Aún no hay historial mensual.</p>
            )}
          </div>
        </motion.div>

        <motion.div
          style={{ marginTop: "var(--sp-4)" }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15 }}
        >
          <InsightsPanel monthHistory={monthHistory} formatSoles={formatSoles} />
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
              const isAdding = addForm.goalId === g.id;
              const isEditingTarget = targetEdit.id === g.id;
              const isEditingAllocation = allocEdit.id === g.id;
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
                  movementKind={addForm.kind}
                  amountInput={addForm.amount}
                  tempTarget={targetEdit.amount}
                  tempTargetDate={targetEdit.date}
                  tempAllocation={allocEdit.value}
                  idx={idx}
                  onAddClick={(id) => setAddForm({ goalId: id, kind: "deposit", amount: "" })}
                  onExpandClick={(id) => setExpanded((p) => ({ ...p, [id]: !p[id] }))}
                  onDeleteClick={(id) => setDeleteTarget({ kind: "goal", id, title: g.title })}
                  onEditTargetClick={(id, target) =>
                    setTargetEdit({ id, amount: target, date: g.targetDate ? g.targetDate.slice(0, 10) : "" })
                  }
                  onSaveTargetClick={handleEditTarget}
                  onCancelTargetClick={() => setTargetEdit((s) => ({ ...s, id: null }))}
                  onEditAllocationClick={(id, current) => setAllocEdit({ id, value: String(current) })}
                  onSaveAllocationClick={handleSaveAllocation}
                  onCancelAllocationClick={() => setAllocEdit((s) => ({ ...s, id: null }))}
                  onResetAllocationClick={handleResetAllocation}
                  onTempAllocationChange={(v) => setAllocEdit((s) => ({ ...s, value: v }))}
                  onMovementKindChange={(k) => setAddForm((s) => ({ ...s, kind: k }))}
                  onAmountChange={(v) => setAddForm((s) => ({ ...s, amount: v }))}
                  onQuickAmountClick={(amount) => setAddForm((s) => ({ ...s, amount: String(amount) }))}
                  onConfirmMovement={handleAddMovement}
                  onCancelMovement={() => setAddForm((s) => ({ ...s, goalId: null }))}
                  onTempTargetChange={(v) => setTargetEdit((s) => ({ ...s, amount: v }))}
                  onTempTargetDateChange={(v) => setTargetEdit((s) => ({ ...s, date: v }))}
                  formatSoles={formatSoles}
                  simulatedAmount={simulation?.goalId === g.id ? simulatedDebt?.outstanding : undefined}
                  simulatedLabel={simulation?.goalId === g.id ? simulatedDebt?.person : undefined}
                  onClearSimulation={() => setSimulation(null)}
                  portfolioCompletionMonth={portfolioProjection.get(g.id)?.completionMonth ?? null}
                  portfolioCompletionLabel={portfolioProjection.get(g.id)?.completionLabel ?? null}
                  movementHistory={{
                    items: movementPages[g.id] ?? [],
                    hasMore: movementHasMore[g.id] ?? false,
                    isLoadingMore: loadingMoreFor === g.id,
                    onLoadMore: () => handleLoadMoreMovements(g.id),
                    editingId: movementEdit?.goalId === g.id ? movementEdit.movementId : null,
                    editAmount: movementEdit?.amount ?? "",
                    editKind: movementEdit?.kind ?? "deposit",
                    editDesc: movementEdit?.desc ?? "",
                    onEditClick: (movementId, current) => handleEditMovementClick(g.id, current),
                    onEditAmountChange: (v) => setMovementEdit((s) => (s ? { ...s, amount: v } : s)),
                    onEditKindChange: (k) => setMovementEdit((s) => (s ? { ...s, kind: k } : s)),
                    onEditDescChange: (v) => setMovementEdit((s) => (s ? { ...s, desc: v } : s)),
                    onSaveEdit: handleSaveMovementEdit,
                    onCancelEdit: handleCancelMovementEdit,
                    onDeleteClick: (movementId) => setDeleteTarget({ kind: "movement", goalId: g.id, movementId }),
                  }}
                />
              );
            })}
          </AnimatePresence>

          <div className="sd-newgoal-area">
            {!newGoal.show ? (
              <motion.button whileTap={{ scale: 0.96 }} className="sd-btn" onClick={() => setNewGoal((s) => ({ ...s, show: true }))}>
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
                  value={newGoal.name}
                  onChange={(e) => setNewGoal((s) => ({ ...s, name: e.target.value }))}
                  autoFocus
                  aria-label="Nombre de la nueva meta"
                />
                <input
                  type="number"
                  placeholder="Monto objetivo (opcional)"
                  value={newGoal.target}
                  onChange={(e) => setNewGoal((s) => ({ ...s, target: e.target.value }))}
                  aria-label="Monto objetivo"
                />
                <input
                  type="number"
                  placeholder="Monto ya ahorrado (opcional)"
                  value={newGoal.initial}
                  onChange={(e) => setNewGoal((s) => ({ ...s, initial: e.target.value }))}
                  aria-label="Monto ya ahorrado"
                />
                <input
                  type="date"
                  value={newGoal.date}
                  onChange={(e) => setNewGoal((s) => ({ ...s, date: e.target.value }))}
                  aria-label="Fecha objetivo (opcional)"
                />
                <div className="sd-newgoal-form-actions">
                  <button className="sd-btn" onClick={handleCreateGoal}>
                    <Check size={14} /> Crear
                  </button>
                  <button className="sd-link-btn" onClick={() => setNewGoal((s) => ({ ...s, show: false, date: "", initial: "" }))}>
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
