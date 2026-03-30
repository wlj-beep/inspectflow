import React from "react";

const h = React.createElement;

function normalizePageSize(pageSize) {
  const parsed = Number(pageSize);
  if (!Number.isFinite(parsed) || parsed <= 0) return 25;
  return Math.max(1, Math.floor(parsed));
}

function normalizePage(page) {
  const parsed = Number(page);
  if (!Number.isFinite(parsed) || parsed <= 0) return 1;
  return Math.floor(parsed);
}

export function paginateRows(rows, page, pageSize) {
  const totalRows = Array.isArray(rows) ? rows.length : 0;
  const safePageSize = normalizePageSize(pageSize);
  const totalPages = totalRows === 0 ? 0 : Math.ceil(totalRows / safePageSize);
  const requestedPage = normalizePage(page);
  const clampedPage = totalPages === 0 ? 0 : Math.min(Math.max(requestedPage, 1), totalPages);
  const start = clampedPage === 0 ? 0 : (clampedPage - 1) * safePageSize;
  const pageRows = totalRows === 0 ? [] : rows.slice(start, start + safePageSize);

  return {
    pageRows,
    totalPages,
    clampedPage,
    totalRows
  };
}

function Button({ children, disabled, onClick, ariaLabel }) {
  return h(
    "button",
    {
      type: "button",
      disabled,
      onClick,
      "aria-label": ariaLabel
    },
    children
  );
}

export function PaginationControls({
  page,
  totalPages,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [25, 50, 100]
}) {
  const safePage = normalizePage(page);
  const safeTotalPages = Math.max(0, Number(totalPages) || 0);
  const safePageSize = normalizePageSize(pageSize);
  const canGoBack = safePage > 1 && safeTotalPages > 0;
  const canGoForward = safeTotalPages > 0 && safePage < safeTotalPages;

  const handlePageChange = (nextPage) => {
    if (typeof onPageChange === "function") {
      onPageChange(nextPage);
    }
  };

  const handlePageSizeChange = (event) => {
    if (typeof onPageSizeChange === "function") {
      onPageSizeChange(Number(event.target.value));
    }
  };

  return h(
    "nav",
    { "aria-label": "Pagination", className: "pagination-controls" },
    h(
      "div",
      { className: "pagination-controls__summary", "aria-live": "polite" },
      `Page ${safeTotalPages === 0 ? 0 : Math.min(safePage, safeTotalPages)} of ${safeTotalPages}`
    ),
    h(
      "div",
      { className: "pagination-controls__actions" },
      h(Button, {
        ariaLabel: "Go to first page",
        disabled: !canGoBack,
        onClick: () => handlePageChange(1),
        children: "First"
      }),
      h(Button, {
        ariaLabel: "Go to previous page",
        disabled: !canGoBack,
        onClick: () => handlePageChange(Math.max(1, safePage - 1)),
        children: "Previous"
      }),
      h(Button, {
        ariaLabel: "Go to next page",
        disabled: !canGoForward,
        onClick: () => handlePageChange(Math.min(safeTotalPages, safePage + 1)),
        children: "Next"
      }),
      h(Button, {
        ariaLabel: "Go to last page",
        disabled: !canGoForward,
        onClick: () => handlePageChange(safeTotalPages),
        children: "Last"
      })
    ),
    h(
      "label",
      { className: "pagination-controls__size" },
      h("span", null, "Rows per page"),
      h(
        "select",
        {
          value: safePageSize,
          onChange: handlePageSizeChange,
          "aria-label": "Rows per page"
        },
        pageSizeOptions.map((option) => {
          const value = normalizePageSize(option);
          return h("option", { key: value, value }, String(value));
        })
      )
    )
  );
}
