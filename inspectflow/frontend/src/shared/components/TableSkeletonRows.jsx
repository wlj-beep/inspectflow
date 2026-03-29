import React from "react";

export default function TableSkeletonRows({ columns, rows = 4 }) {
  return (
    <>
      {Array.from({ length: rows }, (_, rowIdx) => (
        <tr key={`sk-${rowIdx}`} aria-hidden="true">
          {Array.from({ length: columns }, (_, colIdx) => (
            <td key={`sk-${rowIdx}-${colIdx}`}>
              <span
                className={`skeleton-line ${colIdx % 3 === 0 ? "lg" : colIdx % 3 === 1 ? "md" : "sm"}`}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
