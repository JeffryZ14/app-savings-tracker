"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Plus, ChevronDown, ChevronUp, X, Check, ArrowDownCircle, ArrowUpCircle, AlertTriangle, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { calculateProjection } from "@/lib/projection";

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

export default function GoalCard(props: GoalCardProps) {
  const { goal: g, idx } = props;
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

  return (
    <motion.div
      className="sd-card"
      layout
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.3, delay: Math.min(idx * 0.04, 0.3) }}
    >
      <AnimatePresence>
        {complete && (
          <motion.div
            className="sd-stamp"
            initial={{ opacity: 0, scale: 0.8, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ type: "spring", stiffness: 320, damping: 20 }}
          >
            <span className="sd-badge-complete">
              <CheckCircle2 size={12} /> Completado
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="sd-card-head">
        <h2 className="sd-card-name">
          {g.icon} {g.title}
        </h2>
      </div>

      <div className="sd-card-amounts">
        {props.formatSoles(g.currentAmount)}
        {g.targetAmount > 0 && (
          <span className="sd-card-of">
            {" "}de {props.formatSoles(g.targetAmount)}
          </span>
        )}
        {g.targetAmount > 0 && !props.isEditingTarget && (
          <button
            className="sd-edit-btn"
            onClick={() => props.onEditTargetClick(g.id, String(g.targetAmount))}
            aria-label={`Editar meta de ${g.title}`}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
            </svg>
          </button>
        )}
      </div>

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
          <div className="sd-pct">
            Asignación: {g.allocationPct.toFixed(0)}% del ahorro mensual{g.allocationManual ? "" : " (auto)"}
            {" "}
            <button
              className="sd-edit-btn"
              style={{ display: "inline-flex", verticalAlign: "middle" }}
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
                style={{ display: "inline-flex", padding: "0 4px", minHeight: "auto", fontSize: 11 }}
                onClick={() => props.onResetAllocationClick(g.id)}
                aria-label={`Volver a reparto automático para ${g.title}`}
              >
                deshacer
              </button>
            )}
            {g.allocationPct === 0 && !g.allocationManual && (
              <div className="sd-alloc-warning">
                <AlertTriangle size={12} /> Sin presupuesto disponible: otras metas con % manual ya usan el 100%. Asignale un % manual o libera espacio en otra meta.
              </div>
            )}
          </div>
        )
      )}

      {g.targetAmount > 0 && (
        <>
          <div className="sd-bar-track">
            <motion.div
              className={"sd-bar-fill" + (complete ? " complete" : "")}
              initial={{ width: 0 }}
              animate={{ width: pct + "%" }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            />
            {simulatedPct !== null && simulatedPct > pct && (
              <motion.div
                className="sd-bar-fill-ghost"
                initial={{ width: pct + "%" }}
                animate={{ left: pct + "%", width: (simulatedPct - pct) + "%" }}
                transition={{ duration: 0.4, ease: "easeOut" }}
              />
            )}
          </div>
          <div className="sd-pct">
            {pct.toFixed(1)}%{!complete ? ` — falta ${props.formatSoles(remaining)}` : " — meta cumplida"}
          </div>
          {simulatedPct !== null && (
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
          {projection && projection.mode === "pace-only" && (
            props.portfolioCompletionMonth !== null ? (
              <div className="sd-projection">
                Estimado con reasignación automática al completar otras metas: {props.portfolioCompletionLabel} ({props.portfolioCompletionMonth} {props.portfolioCompletionMonth === 1 ? "mes" : "meses"})
              </div>
            ) : (
              <div className="sd-projection-track behind">
                <AlertTriangle size={13} /> No alcanzarías esta meta en un plazo razonable con tu ahorro actual.
              </div>
            )
          )}
          {projection && projection.mode === "target-date" && (
            <>
              <div className="sd-projection">
                Meta: {projection.targetDateLabel}
              </div>
              <div className={"sd-projection-track " + (onTrack ? "on-track" : "behind")}>
                {onTrack ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
                {onTrack
                  ? `Vas al día — con reasignación automática llegarías ${props.portfolioCompletionLabel}`
                  : `Vas atrasado — necesitas ~${props.formatSoles(projection.requiredMonthly ?? 0)}/mes constante para llegar a tiempo${props.portfolioCompletionLabel ? ` (a tu ritmo actual llegarías ${props.portfolioCompletionLabel})` : ""}`}
              </div>
            </>
          )}
        </>
      )}

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
        <button
          className="sd-link-btn danger"
          onClick={() => props.onDeleteClick(g.id)}
          aria-label={`Eliminar meta "${g.title}"`}
        >
          <X size={12} /> Eliminar
        </button>
      </div>

      <AnimatePresence>
        {props.isAdding && (
          <motion.div
            className="sd-add-form"
            initial={{ height: 0, opacity: 0, marginTop: 0, paddingTop: 0 }}
            animate={{ height: "auto", opacity: 1, marginTop: 12, paddingTop: 12 }}
            exit={{ height: 0, opacity: 0, marginTop: 0, paddingTop: 0 }}
            transition={{ duration: 0.25 }}
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

      <AnimatePresence>
        {props.isExpanded && (
          <motion.div
            className="sd-history"
            initial={{ height: 0, opacity: 0, marginTop: 0, paddingTop: 0 }}
            animate={{ height: "auto", opacity: 1, marginTop: 10, paddingTop: 8 }}
            exit={{ height: 0, opacity: 0, marginTop: 0, paddingTop: 0 }}
            transition={{ duration: 0.25 }}
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
