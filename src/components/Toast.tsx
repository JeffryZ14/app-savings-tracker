"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

interface ToastProps {
  message: string | null;
  onClose: () => void;
}

export default function Toast({ message, onClose }: ToastProps) {
  return (
    <AnimatePresence>
      {message && (
        <motion.button
          className="sd-toast"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          onClick={onClose}
          role="alert"
          type="button"
          aria-label={`Error: ${message}. Presiona para cerrar.`}
        >
          <span className="sd-toast-text">{message}</span>
          <span className="sd-toast-close" aria-hidden="true">
            <X size={14} />
          </span>
        </motion.button>
      )}
    </AnimatePresence>
  );
}
