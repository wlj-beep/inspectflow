import React from "react";

export default function TypeBadge({ type, small }) {
  const style = small ? { fontSize: ".58rem", padding: ".08rem .3rem" } : {};
  if (type === "Go/No-Go")
    return (
      <span className="tbadge tbadge-gng" style={style}>
        Go/No-Go
      </span>
    );
  if (type === "Attribute")
    return (
      <span className="tbadge tbadge-attr" style={style}>
        Attribute
      </span>
    );
  return (
    <span className="tbadge tbadge-var" style={style}>
      Variable
    </span>
  );
}
