"use client";

import { useEffect, useState } from "react";
import { AlertCircle, X } from "lucide-react";
import "./MonthlyReminderBanner.css";

interface MonthlyReminderBannerProps {
  monthlyMet: boolean;
  monthRemaining: number;
  monthlyRate: number;
  formatSoles: (n: number) => string;
}

const DISMISS_KEY = "monthlyReminderDismissedFor";

// Clave estable por mes calendario local — se usa sólo para que "cerrar" no vuelva a
// molestar el resto del mes; en cuanto cambia de mes (o se cumple la meta) reaparece.
function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth()}`;
}

export default function MonthlyReminderBanner({
  monthlyMet,
  monthRemaining,
  monthlyRate,
  formatSoles,
}: MonthlyReminderBannerProps) {
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);

  useEffect(() => {
    try {
      setDismissedFor(localStorage.getItem(DISMISS_KEY));
    } catch {}
  }, []);

  if (monthlyMet || monthlyRate <= 0) return null;
  if (dismissedFor === currentMonthKey()) return null;

  function handleDismiss() {
    const key = currentMonthKey();
    try {
      localStorage.setItem(DISMISS_KEY, key);
    } catch {}
    setDismissedFor(key);
  }

  return (
    <div className="mrb-banner" role="status">
      <AlertCircle size={16} className="mrb-icon" aria-hidden="true" />
      <span className="mrb-text">
        Aún te faltan <strong>{formatSoles(monthRemaining)}</strong> para cumplir tu meta de ahorro de este mes.
      </span>
      <button className="mrb-close" onClick={handleDismiss} aria-label="Cerrar recordatorio">
        <X size={14} />
      </button>
    </div>
  );
}
