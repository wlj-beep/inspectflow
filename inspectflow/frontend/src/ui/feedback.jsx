function joinClassNames(...parts) {
  return parts.filter(Boolean).join(" ");
}

export function TableSkeleton({ rows = 6, columns = 6, className = "", ariaLabel = "Loading table" }) {
  const safeRows = Math.max(1, Number(rows) || 1);
  const safeColumns = Math.max(1, Number(columns) || 1);

  return (
    <div
      className={joinClassNames("table-skeleton", className)}
      aria-label={ariaLabel}
      aria-busy="true"
      role="status"
      aria-live="polite"
      style={{ "--table-skeleton-columns": safeColumns }}
    >
      <div className="table-skeleton__shine" aria-hidden="true" />
      <div className="table-skeleton__table" role="presentation">
        {Array.from({ length: safeRows }).map((_, rowIndex) => (
          <div className="table-skeleton__row" key={`row-${rowIndex}`}>
            {Array.from({ length: safeColumns }).map((__, colIndex) => (
              <div className="table-skeleton__cell" key={`cell-${rowIndex}-${colIndex}`}>
                <span className="table-skeleton__pulse" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  className = "",
  children
}) {
  const hasAction = actionLabel && typeof onAction === "function";
  return (
    <section className={joinClassNames("empty-state", className)} aria-label={title || "Empty state"}>
      <div className="empty-state__eyebrow">InspectFlow</div>
      {title ? <h3 className="empty-state__title">{title}</h3> : null}
      {description ? <p className="empty-state__description">{description}</p> : null}
      {children ? <div className="empty-state__content">{children}</div> : null}
      {hasAction ? (
        <button type="button" className="empty-state__action" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </section>
  );
}

export function Breadcrumbs({ items = [], className = "", "aria-label": ariaLabel = "Breadcrumb" }) {
  const crumbs = Array.isArray(items) ? items.filter(Boolean) : [];

  if (crumbs.length === 0) return null;

  return (
    <nav className={joinClassNames("breadcrumbs", className)} aria-label={ariaLabel}>
      <ol className="breadcrumbs__list">
        {crumbs.map((item, index) => (
          <li className="breadcrumbs__item" key={`${item}-${index}`}>
            {index > 0 ? <span className="breadcrumbs__separator" aria-hidden="true">/</span> : null}
            <span className="breadcrumbs__label">{item}</span>
          </li>
        ))}
      </ol>
    </nav>
  );
}
