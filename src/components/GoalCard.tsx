"use client";

import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Plus, ChevronDown, ChevronUp, X, Check, ArrowDownCircle, ArrowUpCircle, AlertTriangle, CheckCircle2, Trash2, TrendingUp } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { calculateProjection } from "@/lib/projection";
import "./GoalCard.css";

interface MovementData {
  id: string;
  amount: number;
  type: "deposit" | "withdrawal";
  description: string | null;
  createdAt: string;
}

interface GoalData {
  id: string;
  title: string;
  icon: string;
  targetAmount: number;
  currentAmount: number;
  targetDate: string | null;
  isCompleted: boolean;
  createdAt: string;
  allocationPct: number;
  allocationManual: boolean;
  movements: MovementData[];
}

interface MovementHistoryProps {
  items: MovementData[];
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
  editingId: string | null;
  editAmount: string;
  editKind: "deposit" | "withdrawal";
  editDesc: string;
  onEditClick: (movementId: string, current: MovementData) => void;
  onEditAmountChange: (v: string) => void;
  onEditKindChange: (v: "deposit" | "withdrawal") => void;
  onEditDescChange: (v: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDeleteClick: (movementId: string) => void;
}

interface GoalCardProps {
  goal: GoalData;
  monthlyRate: number;
  isAdding: boolean;
  isExpanded: boolean;
  isEditingTarget: boolean;
  isEditingAllocation: boolean;
  movementKind: "deposit" | "withdrawal";
  amountInput: string;
  tempTarget: string;
  tempTargetDate: string;
  tempAllocation: string;
  idx: number;
  onAddClick: (id: string) => void;
  onExpandClick: (id: string) => void;
  onDeleteClick: (id: string) => void;
  onEditTargetClick: (id: string, target: string) => void;
  onSaveTargetClick: (id: string) => void;
  onCancelTargetClick: () => void;
  onEditAllocationClick: (id: string, current: number) => void;
  onSaveAllocationClick: (id: string) => void;
  onCancelAllocationClick: () => void;
  onResetAllocationClick: (id: string) => void;
  onTempAllocationChange: (v: string) => void;
  onMovementKindChange: (kind: "deposit" | "withdrawal") => void;
  onAmountChange: (amount: string) => void;
  onQuickAmountClick: (amount: number) => void;
  onConfirmMovement: (id: string) => void;
  onCancelMovement: () => void;
  onTempTargetChange: (target: string) => void;
  onTempTargetDateChange: (date: string) => void;
  formatSoles: (n: number) => string;
  movementHistory: MovementHistoryProps;
  simulatedAmount?: number;
  simulatedLabel?: string | null;
  onClearSimulation?: () => void;
  portfolioCompletionMonth: number | null;
  portfolioCompletionLabel: string | null;
}

// Progress-ring geometry (SVG is rotated -90deg so the arc starts at 12 o'clock)
const RING_R = 52;
const RING_C = 2 * Math.PI * RING_R;
const MILESTONES = [25, 50, 75, 100];

export default function GoalCard(props: GoalCardProps) {
  const { goal: g, idx } = props;
  const prefersReduced = useReducedMotion();

  const pct = g.targetAmount > 0 ? Math.min(100, (g.currentAmount / g.targetAmount) * 100) : 0;
  const complete = g.targetAmount > 0 && g.currentAmount >= g.targetAmount;
  const remaining = g.targetAmount > 0 ? Math.max(0, g.targetAmount - g.currentAmount) : 0;
  const allocatedMonthly = props.monthlyRate * (g.allocationPct / 100);
  const projection = calculateProjection(g, allocatedMonthly);
  // Reemplaza el "onTrack" ingenuo (tasa constante) por la simulación en cascada del padre:
  // considera que al completar otras metas, el % liberado se reasigna a esta.
  const onTrack = projection?.mode === "target-date"
    ? props.portfolioCompletionMonth !== null && props.portfolioCompletionMonth <= (projection.monthsUntilTarget ?? Infinity)
    : false;

  const simulatedTotal = props.simulatedAmount ? g.currentAmount + props.simulatedAmount : null;
  const simulatedPct = simulatedTotal !== null && g.targetAmount > 0
    ? Math.min(100, (simulatedTotal / g.targetAmount) * 100)
    : null;
  const simulatedComplete = simulatedPct !== null && simulatedTotal! >= g.targetAmount;

  const allMovements = [...g.movements, ...props.movementHistory.items];

  const ringOffset = RING_C * (1 - pct / 100);
  const simOffset = simulatedPct !== null ? RING_C * (1 - simulatedPct / 100) : null;

  return (
    <motion.div
      className={"sd-card" + (complete ? " gc-card-complete" : "")}
      layout
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.3, delay: Math.min(idx * 0.04, 0.3) }}
    >
      <AnimatePresence>
        {complete && (
          <motion.div
            className="gc-celebrate"
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={prefersReduced ? { opacity: 1 } : { opacity: [0, 1, 0.75] }}
            exit={{ opacity: 0 }}
            transition={{ duration: prefersReduced ? 0 : 1.1, ease: "easeOut" }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {complete && (
          <motion.div
            className="sd-stamp"
            initial={{ opacity: 0, scale: 0.8, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={prefersReduced ? { duration: 0 } : { type: "spring", stiffness: 320, damping: 20 }}
          >
            <span className="sd-badge-complete">
              <CheckCircle2 size={12} /> Completado
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---- Compact header ------------------------------------------------ */}
      <div className="gc-head">
        <h2 className="gc-title">
          <span className="gc-title-icon">{g.icon}</span>
          <span>{g.title}</span>
        </h2>
        <button
          className="gc-delete"
          onClick={() => props.onDeleteClick(g.id)}
          aria-label={`Eliminar meta "${g.title}"`}
        >
          <Trash2 size={15} />
        </button>
      </div>

      {/* ---- Compact summary: ring + info --------------------------------- */}
      <div className="gc-body">
        {g.targetAmount > 0 ? (
          <div className="gc-ring-wrap">
            <svg className="gc-ring" viewBox="0 0 120 120" role="img" aria-label={`${pct.toFixed(0)}% completado`}>
              <circle className="gc-ring-track" cx="60" cy="60" r={RING_R} />
              {simOffset !== null && simulatedPct !== null && simulatedPct > pct && (
                <motion.circle
                  className="gc-ring-sim"
                  cx="60" cy="60" r={RING_R}
                  strokeDasharray={RING_C}
                  initial={{ strokeDashoffset: prefersReduced ? simOffset : RING_C }}
                  animate={{ strokeDashoffset: simOffset }}
                  transition={{ duration: prefersReduced ? 0 : 0.6, ease: [0.22, 1, 0.36, 1] }}
                />
              )}
              <motion.circle
                className={"gc-ring-arc" + (complete ? " complete" : "")}
                cx="60" cy="60" r={RING_R}
                strokeDasharray={RING_C}
                initial={{ strokeDashoffset: prefersReduced ? ringOffset : RING_C }}
                animate={{ strokeDashoffset: ringOffset }}
                transition={{ duration: prefersReduced ? 0 : 0.9, ease: [0.22, 1, 0.36, 1] }}
              />
              {MILESTONES.map((m) => {
                const rad = (m / 100) * 2 * Math.PI;
                const cx = 60 + RING_R * Math.cos(rad);
                const cy = 60 + RING_R * Math.sin(rad);
                const reached = pct >= m - 0.001;
                return (
                  <circle
                    key={m}
                    className={"gc-milestone" + (reached ? " reached" : "") + (complete ? " complete" : "")}
                    cx={cx} cy={cy} r={3}
                  />
                );
              })}
            </svg>
            <div className="gc-ring-center">
              <span className={"gc-ring-pct" + (complete ? " complete" : "")}>{pct.toFixed(0)}%</span>
              <span className="gc-ring-sub">{complete ? "Listo" : "Avance"}</span>
            </div>
          </div>
        ) : null}

        <div className="gc-info">
          <div className="gc-amounts">
            {props.formatSoles(g.currentAmount)}
            {g.targetAmount > 0 && (
              <span className="gc-amounts-of">
                {" "}de {props.formatSoles(g.targetAmount)}
              </span>
            )}
            {g.targetAmount > 0 && !props.isEditingTarget && (
              <button
                className="gc-chip-btn"
                onClick={() => props.onEditTargetClick(g.id, String(g.targetAmount))}
                aria-label={`Editar meta de ${g.title}`}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
                </svg>
              </button>
            )}
          </div>

          {g.targetAmount > 0 && (
            <div className={"gc-remaining" + (complete ? " done" : "")}>
              {complete ? "Meta cumplida" : `Falta ${props.formatSoles(remaining)}`}
            </div>
          )}

          {props.isEditingTarget && (
            <div className="sd-target-form">
              <input
                type="number"
                value={props.tempTarget}
                onChange={(e) => props.onTempTargetChange(e.target.value)}
                autoFocus
                aria-label={`Nuevo objetivo para ${g.title}`}
              />
              <input
                type="date"
                value={props.tempTargetDate}
                onChange={(e) => props.onTempTargetDateChange(e.target.value)}
                aria-label={`Fecha objetivo para ${g.title} (opcional)`}
              />
              <button className="sd-icon-btn" onClick={() => props.onSaveTargetClick(g.id)} aria-label="Guardar">
                <Check size={15} />
              </button>
              <button className="sd-icon-btn" onClick={() => props.onCancelTargetClick()} aria-label="Cancelar">
                <X size={15} />
              </button>
            </div>
          )}

          {/* ---- Allocation chip / editor -------------------------------- */}
          {g.targetAmount > 0 && !complete && (
            props.isEditingAllocation ? (
              <div className="sd-target-form">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={props.tempAllocation}
                  onChange={(e) => props.onTempAllocationChange(e.target.value)}
                  autoFocus
                  aria-label={`Porcentaje asignado a ${g.title}`}
                />
                <button className="sd-icon-btn" onClick={() => props.onSaveAllocationClick(g.id)} aria-label="Guardar">
                  <Check size={15} />
                </button>
                <button className="sd-icon-btn" onClick={() => props.onCancelAllocationClick()} aria-label="Cancelar">
                  <X size={15} />
                </button>
              </div>
            ) : (
              <div className="gc-alloc">
                <span
                  className={"gc-alloc-chip"
                    + (g.allocationPct === 0 && !g.allocationManual ? " warn" : g.allocationManual ? "" : " auto")}
                >
                  <span className="gc-alloc-num">{g.allocationPct.toFixed(0)}%</span>
                  del ahorro mensual{g.allocationManual ? "" : " (auto)"}
                </span>
                <button
                  className="gc-chip-btn"
                  onClick={() => props.onEditAllocationClick(g.id, g.allocationPct)}
                  aria-label={`Editar porcentaje asignado a ${g.title}`}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
                  </svg>
                </button>
                {g.allocationManual && (
                  <button
                    className="sd-link-btn"
                    style={{ padding: "0 4px", minHeight: "auto", fontSize: 11 }}
                    onClick={() => props.onResetAllocationClick(g.id)}
                    aria-label={`Volver a reparto automático para ${g.title}`}
                  >
                    deshacer
                  </button>
                )}
              </div>
            )
          )}

          {g.targetAmount > 0 && !complete && g.allocationPct === 0 && !g.allocationManual && !props.isEditingAllocation && (
            <div className="sd-alloc-warning">
              <AlertTriangle size={12} /> Sin presupuesto disponible: otras metas con % manual ya usan el 100%. Asignale un % manual o libera espacio en otra meta.
            </div>
          )}
        </div>
      </div>

      {/* ---- Simulation banner -------------------------------------------- */}
      {g.targetAmount > 0 && simulatedPct !== null && (
        <div className={"sd-sim-banner" + (simulatedComplete ? " complete" : "")}>
          <span>
            {simulatedComplete
              ? `¡Completarías esta meta si ${props.simulatedLabel ? `te paga ${props.simulatedLabel}` : "te pagan esta deuda"}! (${simulatedPct.toFixed(0)}%)`
              : `Si ${props.simulatedLabel ? `te paga ${props.simulatedLabel}` : "te pagan esta deuda"}, llegarías a ${simulatedPct.toFixed(0)}%`}
          </span>
          <button
            className="sd-history-icon-btn"
            onClick={() => props.onClearSimulation?.()}
            aria-label="Quitar simulación"
          >
            <X size={12} />
          </button>
        </div>
      )}

      {/* ---- Projection / ETA hero ---------------------------------------- */}
      {g.targetAmount > 0 && projection && (
        <div className="gc-projection">
          {projection.mode === "pace-only" && (
            props.portfolioCompletionMonth !== null ? (
              <>
                <span className="gc-eta-label"><TrendingUp size={12} /> Proyección estimada</span>
                <span className="gc-eta-value">
                  {props.portfolioCompletionLabel}
                  <span className="gc-eta-months">
                    ({props.portfolioCompletionMonth} {props.portfolioCompletionMonth === 1 ? "mes" : "meses"})
                  </span>
                </span>
                <span className="gc-proj-line muted">Con reasignación automática al completar otras metas</span>
              </>
            ) : (
              <div className="gc-proj-line behind">
                <AlertTriangle size={13} /> No alcanzarías esta meta en un plazo razonable con tu ahorro actual.
              </div>
            )
          )}
          {projection.mode === "target-date" && (
            <>
              <span className="gc-eta-label"><TrendingUp size={12} /> Meta</span>
              <span className="gc-eta-value">{projection.targetDateLabel}</span>
              <div className={"gc-proj-line " + (onTrack ? "on-track" : "behind")}>
                {onTrack ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
                {onTrack
                  ? `Vas al día — con reasignación automática llegarías ${props.portfolioCompletionLabel}`
                  : `Vas atrasado — necesitas ~${props.formatSoles(projection.requiredMonthly ?? 0)}/mes constante para llegar a tiempo${props.portfolioCompletionLabel ? ` (a tu ritmo actual llegarías ${props.portfolioCompletionLabel})` : ""}`}
              </div>
            </>
          )}
        </div>
      )}

      {/* ---- Actions ------------------------------------------------------ */}
      <div className="sd-actions">
        {!props.isAdding ? (
          <motion.button
            whileTap={{ scale: 0.95 }}
            className="sd-btn"
            onClick={() => props.onAddClick(g.id)}
          >
            <Plus size={13} /> Movimiento
          </motion.button>
        ) : null}
        <button
          className="sd-link-btn"
          onClick={() => props.onExpandClick(g.id)}
        >
          {props.isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          Historial{g.movements.length > 0 ? ` (${g.movements.length})` : ""}
        </button>
      </div>

      {/* ---- Add-movement form (revealed via the Movimiento button) ------- */}
      <AnimatePresence>
        {props.isAdding && (
          <motion.div
            className="sd-add-form"
            initial={{ height: 0, opacity: 0, marginTop: 0, paddingTop: 0 }}
            animate={{ height: "auto", opacity: 1, marginTop: 12, paddingTop: 12 }}
            exit={{ height: 0, opacity: 0, marginTop: 0, paddingTop: 0 }}
            transition={{ duration: prefersReduced ? 0 : 0.25 }}
          >
            <div className="sd-kind-toggle">
              <button
                type="button"
                className={"sd-kind-btn deposit" + (props.movementKind === "deposit" ? " active" : "")}
                onClick={() => props.onMovementKindChange("deposit")}
              >
                <ArrowDownCircle size={13} /> Dep&oacute;sito
              </button>
              <button
                type="button"
                className={"sd-kind-btn withdrawal" + (props.movementKind === "withdrawal" ? " active" : "")}
                onClick={() => props.onMovementKindChange("withdrawal")}
              >
                <ArrowUpCircle size={13} /> Retiro
              </button>
            </div>
            <input
              type="number"
              placeholder="Monto"
              value={props.amountInput}
              onChange={(e) => props.onAmountChange(e.target.value)}
              autoFocus
            />
            <div className="sd-quick-amounts">
              {[100, 500, props.monthlyRate].filter(v => v > 0).map(v => (
                <button key={v} className="sd-qty-btn" onClick={() => props.onQuickAmountClick(v)}>
                  {props.formatSoles(v)}
                </button>
              ))}
            </div>
            <div style={{display:'flex',gap:6,width:'100%'}}>
              <motion.button
                whileTap={{ scale: 0.97 }}
                className="sd-btn"
                style={{flex:1,justifyContent:'center'}}
                onClick={() => props.onConfirmMovement(g.id)}
              >
                <Check size={13} /> Confirmar
              </motion.button>
              <button className="sd-link-btn" onClick={() => props.onCancelMovement()}>
                <X size={13} /> Cancelar
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---- Detail layer: paginated movement history --------------------- */}
      <AnimatePresence>
        {props.isExpanded && (
          <motion.div
            className="sd-history"
            initial={{ height: 0, opacity: 0, marginTop: 0, paddingTop: 0 }}
            animate={{ height: "auto", opacity: 1, marginTop: 10, paddingTop: 8 }}
            exit={{ height: 0, opacity: 0, marginTop: 0, paddingTop: 0 }}
            transition={{ duration: prefersReduced ? 0 : 0.25 }}
          >
            {allMovements.length === 0 ? (
              <div className="sd-history-empty">Sin movimientos todav&iacute;a</div>
            ) : (
              allMovements.map((m) => {
                const isEditingThis = props.movementHistory.editingId === m.id;

                if (isEditingThis) {
                  return (
                    <div className="sd-movement-edit-form" key={m.id}>
                      <div className="sd-movement-edit-kind">
                        <button
                          type="button"
                          className={"deposit" + (props.movementHistory.editKind === "deposit" ? " active" : "")}
                          onClick={() => props.movementHistory.onEditKindChange("deposit")}
                        >
                          <ArrowDownCircle size={12} />
                        </button>
                        <button
                          type="button"
                          className={"withdrawal" + (props.movementHistory.editKind === "withdrawal" ? " active" : "")}
                          onClick={() => props.movementHistory.onEditKindChange("withdrawal")}
                        >
                          <ArrowUpCircle size={12} />
                        </button>
                      </div>
                      <input
                        type="number"
                        value={props.movementHistory.editAmount}
                        onChange={(e) => props.movementHistory.onEditAmountChange(e.target.value)}
                        aria-label="Monto del movimiento"
                        autoFocus
                      />
                      <input
                        type="text"
                        placeholder="Descripción (opcional)"
                        value={props.movementHistory.editDesc}
                        onChange={(e) => props.movementHistory.onEditDescChange(e.target.value)}
                        aria-label="Descripción del movimiento"
                      />
                      <button className="sd-icon-btn" onClick={props.movementHistory.onSaveEdit} aria-label="Guardar movimiento">
                        <Check size={14} />
                      </button>
                      <button className="sd-icon-btn" onClick={props.movementHistory.onCancelEdit} aria-label="Cancelar edición">
                        <X size={14} />
                      </button>
                    </div>
                  );
                }

                return (
                  <div className="sd-history-row" key={m.id}>
                    <div className="sd-history-left">
                      {m.type === "deposit" ? (
                        <ArrowDownCircle size={13} color="#0F5C41" />
                      ) : (
                        <ArrowUpCircle size={13} color="#A93226" />
                      )}
                      <span>{format(new Date(m.createdAt), "d MMM", { locale: es })}</span>
                      {m.description && (
                        <span className="sd-history-desc" title={m.description}>
                          &middot; {m.description === "Monto inicial" ? "Inicial" : m.description}
                        </span>
                      )}
                    </div>
                    <span className={"sd-history-amt " + m.type}>
                      {m.type === "deposit" ? "+" : "-"}{props.formatSoles(m.amount)}
                    </span>
                    <div className="sd-history-row-actions">
                      <button
                        className="sd-history-icon-btn"
                        onClick={() => props.movementHistory.onEditClick(m.id, m)}
                        aria-label="Editar movimiento"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
                        </svg>
                      </button>
                      <button
                        className="sd-history-icon-btn"
                        onClick={() => props.movementHistory.onDeleteClick(m.id)}
                        aria-label="Eliminar movimiento"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
            {props.movementHistory.hasMore && (
              <button
                className="sd-load-more-btn"
                onClick={props.movementHistory.onLoadMore}
                disabled={props.movementHistory.isLoadingMore}
              >
                {props.movementHistory.isLoadingMore ? "Cargando…" : "Cargar más"}
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
