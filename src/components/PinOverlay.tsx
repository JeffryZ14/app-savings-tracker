"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, X, Check } from "lucide-react";
import { useModalA11y } from "@/lib/useModalA11y";
import "./PinOverlay.css";

export type PinOverlayMode = "locked" | "setup" | "manage" | null;

interface PinOverlayProps {
  mode: PinOverlayMode;
  onUnlock: (pin: string) => Promise<boolean>;
  onSetPin: (pin: string) => Promise<void>;
  onRemovePin: (pin: string) => Promise<boolean>;
  onClose: () => void;
}

type Step = "unlock" | "create" | "menu" | "change" | "remove";

function validPin(pin: string): boolean {
  return /^\d{4,8}$/.test(pin);
}

export default function PinOverlay({ mode, onUnlock, onSetPin, onRemovePin, onClose }: PinOverlayProps) {
  const [step, setStep] = useState<Step>("unlock");
  const [pin, setPinInput] = useState("");
  const [pin2, setPin2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // El candado ("locked") no debe cerrarse con Escape; los modos de configuración sí.
  useModalA11y(cardRef, mode !== null, mode === "locked" ? undefined : onClose);

  useEffect(() => {
    setPinInput("");
    setPin2("");
    setError(null);
    setBusy(false);
    if (mode === "locked") setStep("unlock");
    else if (mode === "setup") setStep("create");
    else if (mode === "manage") setStep("menu");
  }, [mode]);

  if (!mode) return null;

  async function handleUnlock() {
    setBusy(true);
    const ok = await onUnlock(pin);
    setBusy(false);
    if (!ok) {
      setError("PIN incorrecto");
      setPinInput("");
    }
  }

  async function handleCreate() {
    if (!validPin(pin)) {
      setError("El PIN debe tener 4 a 8 dígitos");
      return;
    }
    if (pin !== pin2) {
      setError("Los PIN no coinciden");
      return;
    }
    setBusy(true);
    await onSetPin(pin);
    setBusy(false);
    onClose();
  }

  async function handleRemove() {
    setBusy(true);
    const ok = await onRemovePin(pin);
    setBusy(false);
    if (!ok) {
      setError("PIN incorrecto");
      return;
    }
    onClose();
  }

  async function handleChange() {
    if (!validPin(pin2)) {
      setError("El nuevo PIN debe tener 4 a 8 dígitos");
      return;
    }
    setBusy(true);
    const ok = await onRemovePin(pin);
    if (!ok) {
      setBusy(false);
      setError("PIN actual incorrecto");
      return;
    }
    await onSetPin(pin2);
    setBusy(false);
    onClose();
  }

  return (
    <AnimatePresence>
      <motion.div
        className="pin-overlay"
        role="dialog"
        aria-modal="true"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div
          ref={cardRef}
          className="pin-card"
          initial={{ opacity: 0, y: 10, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
        >
          <div className="pin-card-icon"><Lock size={20} /></div>

          {step === "unlock" && (
            <>
              <h2 className="pin-title">App bloqueada</h2>
              <p className="pin-sub">Ingresa tu PIN para continuar</p>
              <input
                className="pin-input"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                placeholder="PIN"
                value={pin}
                onChange={(e) => setPinInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleUnlock()}
                autoFocus
                aria-label="PIN"
              />
              {error && <p className="pin-error">{error}</p>}
              <button className="pin-btn primary" onClick={handleUnlock} disabled={busy || !pin}>
                <Check size={14} /> Desbloquear
              </button>
            </>
          )}

          {step === "create" && (
            <>
              <h2 className="pin-title">Activar PIN</h2>
              <p className="pin-sub">Solo protege esta pantalla en este dispositivo — no reemplaza una cuenta real.</p>
              <input
                className="pin-input"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                placeholder="Nuevo PIN (4-8 dígitos)"
                value={pin}
                onChange={(e) => setPinInput(e.target.value)}
                autoFocus
                aria-label="Nuevo PIN"
              />
              <input
                className="pin-input"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                placeholder="Confirmar PIN"
                value={pin2}
                onChange={(e) => setPin2(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                aria-label="Confirmar PIN"
              />
              {error && <p className="pin-error">{error}</p>}
              <div className="pin-actions">
                <button className="pin-btn primary" onClick={handleCreate} disabled={busy}>
                  <Check size={14} /> Activar
                </button>
                <button className="pin-btn" onClick={onClose}>
                  <X size={14} /> Cancelar
                </button>
              </div>
            </>
          )}

          {step === "menu" && (
            <>
              <h2 className="pin-title">PIN de la app</h2>
              <p className="pin-sub">Configura el candado local de este dispositivo.</p>
              <div className="pin-actions">
                <button className="pin-btn" onClick={() => { setStep("change"); setError(null); }}>
                  Cambiar PIN
                </button>
                <button className="pin-btn danger" onClick={() => { setStep("remove"); setError(null); }}>
                  Quitar PIN
                </button>
                <button className="pin-btn" onClick={onClose}>
                  <X size={14} /> Cerrar
                </button>
              </div>
            </>
          )}

          {step === "remove" && (
            <>
              <h2 className="pin-title">Quitar PIN</h2>
              <input
                className="pin-input"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                placeholder="PIN actual"
                value={pin}
                onChange={(e) => setPinInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleRemove()}
                autoFocus
                aria-label="PIN actual"
              />
              {error && <p className="pin-error">{error}</p>}
              <div className="pin-actions">
                <button className="pin-btn danger" onClick={handleRemove} disabled={busy || !pin}>
                  <Check size={14} /> Quitar
                </button>
                <button className="pin-btn" onClick={() => setStep("menu")}>
                  <X size={14} /> Cancelar
                </button>
              </div>
            </>
          )}

          {step === "change" && (
            <>
              <h2 className="pin-title">Cambiar PIN</h2>
              <input
                className="pin-input"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                placeholder="PIN actual"
                value={pin}
                onChange={(e) => setPinInput(e.target.value)}
                autoFocus
                aria-label="PIN actual"
              />
              <input
                className="pin-input"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                placeholder="Nuevo PIN (4-8 dígitos)"
                value={pin2}
                onChange={(e) => setPin2(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleChange()}
                aria-label="Nuevo PIN"
              />
              {error && <p className="pin-error">{error}</p>}
              <div className="pin-actions">
                <button className="pin-btn primary" onClick={handleChange} disabled={busy}>
                  <Check size={14} /> Guardar
                </button>
                <button className="pin-btn" onClick={() => setStep("menu")}>
                  <X size={14} /> Cancelar
                </button>
              </div>
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
