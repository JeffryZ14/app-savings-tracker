"use client";

import { motion } from "framer-motion";
import { Plus, Check, X } from "lucide-react";

export interface NewGoalFormState {
  show: boolean;
  name: string;
  target: string;
  date: string;
  initial: string;
  category: string;
}

interface NewGoalFormProps {
  state: NewGoalFormState;
  categoryOptions: string[];
  onShow: () => void;
  onCancel: () => void;
  onCreate: () => void;
  onNameChange: (v: string) => void;
  onTargetChange: (v: string) => void;
  onInitialChange: (v: string) => void;
  onDateChange: (v: string) => void;
  onCategoryChange: (v: string) => void;
}

// Botón "Nueva meta" + formulario de alta, extraído de page.tsx.
export default function NewGoalForm({
  state,
  categoryOptions,
  onShow,
  onCancel,
  onCreate,
  onNameChange,
  onTargetChange,
  onInitialChange,
  onDateChange,
  onCategoryChange,
}: NewGoalFormProps) {
  if (!state.show) {
    return (
      <motion.button whileTap={{ scale: 0.96 }} className="sd-btn" onClick={onShow}>
        <Plus size={15} /> Nueva meta
      </motion.button>
    );
  }

  return (
    <motion.div
      className="sd-newgoal-form"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <input
        type="text"
        placeholder="Nombre de la meta"
        value={state.name}
        onChange={(e) => onNameChange(e.target.value)}
        autoFocus
        aria-label="Nombre de la nueva meta"
      />
      <input
        type="number"
        placeholder="Monto objetivo (opcional)"
        value={state.target}
        onChange={(e) => onTargetChange(e.target.value)}
        aria-label="Monto objetivo"
      />
      <input
        type="number"
        placeholder="Monto ya ahorrado (opcional)"
        value={state.initial}
        onChange={(e) => onInitialChange(e.target.value)}
        aria-label="Monto ya ahorrado"
      />
      <input
        type="date"
        value={state.date}
        onChange={(e) => onDateChange(e.target.value)}
        aria-label="Fecha objetivo (opcional)"
      />
      <input
        type="text"
        list="newgoal-category-options"
        placeholder="Categoría (opcional)"
        value={state.category}
        onChange={(e) => onCategoryChange(e.target.value)}
        aria-label="Categoría de la meta (opcional)"
      />
      <datalist id="newgoal-category-options">
        {categoryOptions.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <div className="sd-newgoal-form-actions">
        <button className="sd-btn" onClick={onCreate}>
          <Check size={14} /> Crear
        </button>
        <button className="sd-link-btn" onClick={onCancel}>
          <X size={14} /> Cancelar
        </button>
      </div>
    </motion.div>
  );
}
