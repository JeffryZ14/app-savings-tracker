"use client";

import "./CategoryFilter.css";

interface CategoryFilterProps {
  categories: string[];
  value: string | null;
  onChange: (category: string | null) => void;
}

export default function CategoryFilter({ categories, value, onChange }: CategoryFilterProps) {
  if (categories.length === 0) return null;

  return (
    <div className="catf-row" role="group" aria-label="Filtrar metas por categoría">
      <button
        type="button"
        className={"catf-chip" + (value === null ? " active" : "")}
        onClick={() => onChange(null)}
      >
        Todas
      </button>
      {categories.map((c) => (
        <button
          key={c}
          type="button"
          className={"catf-chip" + (value === c ? " active" : "")}
          onClick={() => onChange(c)}
        >
          {c}
        </button>
      ))}
    </div>
  );
}
