"use client";

export default function Skeleton() {
  return (
    <div className="sd-skeleton">
      <div className="sd-skeleton-el sd-skeleton-hero" />
      <div className="sd-skeleton-el sd-skeleton-card" />
      <div className="sd-skeleton-grid">
        {[0, 1, 2].map((i) => (
          <div key={i} className="sd-skeleton-el sd-skeleton-card-sm" />
        ))}
      </div>
    </div>
  );
}
