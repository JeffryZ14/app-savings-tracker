"use client";

import { motion } from "framer-motion";
import { Check, Pencil, X } from "lucide-react";
import StatTile from "@/components/StatTile";

interface RateEditState {
  editing: boolean;
  value: string;
}

interface SummaryHeroProps {
  totalCurrentAll: number;
  totalCurrentTargeted: number;
  totalTarget: number;
  overallPct: number;
  currentMonthTotal: number;
  monthlyRate: number;
  monthRemaining: number;
  monthlyMet: boolean;
  totalReceivable: number;
  streak: number;
  rateEdit: RateEditState;
  onStartRateEdit: () => void;
  onRateValueChange: (v: string) => void;
  onSaveRate: () => void;
  onCancelRateEdit: () => void;
  formatSoles: (n: number) => string;
}

// Cabecera de la app: KPIs (saldo, mes, por cobrar, racha) + la barra de progreso general
// con el editor inline del ahorro mensual estimado. Extraído de page.tsx (era ~150 líneas
// inline) para mantener el componente principal enfocado en orquestar estado, no en marcado.
export default function SummaryHero({
  totalCurrentAll,
  totalCurrentTargeted,
  totalTarget,
  overallPct,
  currentMonthTotal,
  monthlyRate,
  monthRemaining,
  monthlyMet,
  totalReceivable,
  streak,
  rateEdit,
  onStartRateEdit,
  onRateValueChange,
  onSaveRate,
  onCancelRateEdit,
  formatSoles,
}: SummaryHeroProps) {
  return (
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
            <button className="sd-rate-btn" onClick={onStartRateEdit}>
              Ahorro mensual: {formatSoles(monthlyRate)}
              <Pencil size={13} />
            </button>
          ) : (
            <span className="sd-rate-form2">
              <input
                type="number"
                className="sd-rate-input"
                value={rateEdit.value}
                onChange={(e) => onRateValueChange(e.target.value)}
                autoFocus
                aria-label="Ahorro mensual estimado"
              />
              <button className="sd-icon-btn" onClick={onSaveRate} aria-label="Guardar">
                <Check size={15} />
              </button>
              <button className="sd-icon-btn" onClick={onCancelRateEdit} aria-label="Cancelar">
                <X size={15} />
              </button>
            </span>
          )}
        </div>
      </div>
    </motion.section>
  );
}
