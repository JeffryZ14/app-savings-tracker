"use client";

import { motion } from "framer-motion";

export default function Skeleton() {
  return (
    <div className="sd-skeleton">
      <motion.div
        className="sd-skeleton-cover"
        animate={{ opacity: [0.6, 0.8, 0.6] }}
        transition={{ duration: 2, repeat: Infinity }}
      />
      <motion.div
        className="sd-skeleton-card"
        animate={{ opacity: [0.6, 0.8, 0.6] }}
        transition={{ duration: 2, repeat: Infinity, delay: 0.1 }}
      />
      <div className="sd-skeleton-grid">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="sd-skeleton-card-sm"
            animate={{ opacity: [0.6, 0.8, 0.6] }}
            transition={{ duration: 2, repeat: Infinity, delay: 0.1 + i * 0.05 }}
          />
        ))}
      </div>
    </div>
  );
}
