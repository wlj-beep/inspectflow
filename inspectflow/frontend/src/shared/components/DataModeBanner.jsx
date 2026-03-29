import React from "react";

export default function DataModeBanner({
  dataStatus,
  loadingMessage = "Loading live data...",
  fallbackMessage = "Live data unavailable - showing current local state."
}) {
  if (dataStatus === "live") return null;
  const isLoading = dataStatus === "loading";
  return (
    <div
      className={isLoading ? "banner" : "banner warn"}
      role={isLoading ? "status" : "alert"}
      style={{ marginBottom: ".65rem" }}
    >
      {isLoading ? loadingMessage : fallbackMessage}
    </div>
  );
}
