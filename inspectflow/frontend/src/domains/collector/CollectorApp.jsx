/**
 * Collector domain shell — BL-120 (INT-IOT-v1)
 *
 * Role routing:
 *  Admin   → all tabs (Config, Tag Mappings, Run History, OOT Queue)
 *  Quality → Run History + OOT Queue
 *  Operator/Supervisor → OOT Queue only
 */

import React, { useState } from "react";
import CollectorConfigList from "./CollectorConfigList.jsx";
import CollectorRunHistory from "./CollectorRunHistory.jsx";
import OotQueue from "./OotQueue.jsx";

const TABS = [
  { key: "config", label: "Collector Config", roles: ["Admin"] },
  { key: "runs", label: "Run History", roles: ["Admin", "Quality"] },
  { key: "oot", label: "OOT Queue", roles: ["Admin", "Quality", "Operator", "Supervisor"] }
];

export default function CollectorApp({ role }) {
  const visibleTabs = TABS.filter((t) => t.roles.includes(role));
  const [activeTab, setActiveTab] = useState(visibleTabs[0]?.key ?? "oot");

  if (visibleTabs.length === 0) {
    return <p style={{ padding: "1rem", color: "#666" }}>No collector views available for your role.</p>;
  }

  return (
    <div style={{ fontFamily: "inherit" }}>
      <div style={{ borderBottom: "1px solid #ddd", marginBottom: "1rem", display: "flex", gap: "0.25rem" }}>
        {visibleTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: "0.5rem 1rem",
              border: "none",
              borderBottom: activeTab === tab.key ? "2px solid #0066cc" : "2px solid transparent",
              background: "none",
              cursor: "pointer",
              fontWeight: activeTab === tab.key ? "600" : "400",
              color: activeTab === tab.key ? "#0066cc" : "#333"
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "config" && <CollectorConfigList role={role} />}
      {activeTab === "runs" && <CollectorRunHistory role={role} />}
      {activeTab === "oot" && <OotQueue role={role} />}
    </div>
  );
}
