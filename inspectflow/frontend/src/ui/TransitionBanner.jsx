import React from "react";

export function TransitionBanner({ state }) {
  if(!state || state.status==="idle") return null;
  const toneClass=state.status==="loading" ? "transition-loading" : state.status==="success" ? "transition-success" : "transition-error";
  const label=state.status==="loading" ? "Working" : state.status==="success" ? "Done" : "Error";
  const role=state.status==="error" ? "alert" : "status";
  const live=state.status==="error" ? "assertive" : "polite";
  return (
    <div className={`transition-banner ${toneClass}`} role={role} aria-live={live} data-testid="transition-banner">
      <span className="transition-label">{label}</span>
      <span>{state.message}</span>
    </div>
  );
}
