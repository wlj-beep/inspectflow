import React from "react";

function TrustIndicatorCard({ item }) {
  return (
    <article
      className={`trust-card trust-card-${item.tone || "neutral"}`}
      data-testid={`trust-card-${item.key}`}
      aria-label={`${item.label}: ${item.value}. ${item.detail}`}
    >
      <div className="trust-card__label">{item.label}</div>
      <div className="trust-card__value">{item.value}</div>
      <div className="trust-card__detail">{item.detail}</div>
    </article>
  );
}

export function TrustIndicators({ items = [], loading = false, sourceLabel = "" }) {
  if (!loading && (!Array.isArray(items) || items.length === 0)) return null;

  return (
    <section
      className="trust-strip"
      aria-label="System trust indicators"
      data-testid="trust-strip"
    >
      <div className="trust-strip__intro">
        <div className="trust-strip__eyebrow">Customer confidence</div>
        <div className="trust-strip__title">System trust at a glance</div>
        <div className="trust-strip__meta">
          {loading ? "Refreshing live confidence signals..." : sourceLabel}
        </div>
      </div>
      <div className="trust-strip__grid">
        {loading ? (
          <div className="trust-card trust-card-loading" data-testid="trust-card-loading" aria-hidden="true">
            <div className="trust-card__label">Loading</div>
            <div className="trust-card__value">...</div>
            <div className="trust-card__detail">Gathering trust signals.</div>
          </div>
        ) : items.map((item) => <TrustIndicatorCard key={item.key} item={item} />)}
      </div>
    </section>
  );
}
