"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Check, X } from "lucide-react";

export type DeleteTarget =
  | { kind: "goal"; id: string; title: string }
  | { kind: "movement"; goalId: string; movementId: string };

interface DeleteConfirmModalProps {
  target: DeleteTarget | null;
  onConfirm: (target: DeleteTarget) => void;
  onCancel: () => void;
}

const COPY: Record<DeleteTarget["kind"], { title: string; text: string }> = {
  goal: {
    title: "¿Eliminar meta?",
    text: "Se eliminará la meta y todo su historial de movimientos. Esta acción no se puede deshacer.",
  },
  movement: {
    title: "¿Eliminar movimiento?",
    text: "Se eliminará este movimiento y se recalculará el saldo de la meta. Esta acción no se puede deshacer.",
  },
};

export default function DeleteConfirmModal({ target, onConfirm, onCancel }: DeleteConfirmModalProps) {
  return (
    <AnimatePresence>
      {target && (
        <motion.div
          className="sd-modal-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onCancel}
        >
          <motion.div
            className="sd-modal"
            initial={{ opacity: 0, scale: 0.95, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="sd-modal-title">{COPY[target.kind].title}</h2>
            <p className="sd-modal-text">{COPY[target.kind].text}</p>
            <div className="sd-modal-actions">
              <button className="sd-btn" onClick={() => onConfirm(target)}>
                <Check size={13} /> Eliminar
              </button>
              <button className="sd-link-btn" onClick={onCancel}>
                <X size={13} /> Cancelar
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
