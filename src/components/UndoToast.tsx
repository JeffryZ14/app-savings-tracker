"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RotateCcw, X } from "lucide-react";
import "./UndoToast.css";

export interface UndoState {
  message: string;
  onUndo: () => void | Promise<void>;
}

interface UndoToastProps {
  undo: UndoState | null;
  onDismiss: () => void;
  /** Segundos antes de auto-cerrar (la ventana para deshacer). */
  timeoutSeconds?: number;
}

export default function UndoToast({ undo, onDismiss, timeoutSeconds = 6 }: UndoToastProps) {
  const [busy, setBusy] = useState(false);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => onDismissRef.current(), timeoutSeconds * 1000);
    return () => clearTimeout(t);
  }, [undo, timeoutSeconds]);

  async function handleUndo() {
    if (!undo) return;
    setBusy(true);
    try {
      await undo.onUndo();
    } finally {
      setBusy(false);
      onDismiss();
    }
  }

  return (
    <AnimatePresence>
      {undo && (
        <motion.div
          className="undo-toast"
          role="status"
          aria-live="polite"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ duration: 0.2 }}
        >
          <span className="undo-msg">{undo.message}</span>
          <button className="undo-action" onClick={handleUndo} disabled={busy}>
            <RotateCcw size={14} /> {busy ? "Restaurando…" : "Deshacer"}
          </button>
          <button className="undo-close" onClick={onDismiss} aria-label="Cerrar">
            <X size={14} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
