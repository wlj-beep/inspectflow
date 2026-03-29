import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { formatCompactNumber } from "./jobflowUtils.js";
import { ANALYTICS_RULE_OPTIONS } from "./domainConfig.js";
import { fmtTs } from "../../shared/utils/jobflowCore.ts";

export default function AdminAnalyticsSpc({
  spcFilters,
  setSpcFilters,
  spcState,
  spcRuleSortKey,
  setSpcRuleSortKey,
  spcRuleSortDir,
  setSpcRuleSortDir,
  spcRulePageSize,
  setSpcRulePageSize,
  spcRulePage,
  setSpcRulePage,
  spcPointSortKey,
  setSpcPointSortKey,
  spcPointSortDir,
  setSpcPointSortDir,
  spcPointPageSize,
  setSpcPointPageSize,
  spcPointPage,
  setSpcPointPage,
  loadSpc,
  exportSpcSummary,
  exportRuleFindings,
  exportSpcPoints,
  spc,
  spcCharacteristic,
  spcStatistics,
  spcRuleFindings,
  spcPoints,
  spcRuleTotalPages,
  spcPointTotalPages,
  pagedSpcRuleFindings,
  pagedSpcPoints,
  safeSpcRulePage,
  safeSpcPointPage,
  sortedSpcRuleFindings,
  sortedSpcPoints,
  toggleSort,
  sortIcon,
  dimensions,
  currentDimension,
  tab,
}) {
  return (
            <div style={{ display: "grid", gap: "1rem" }}>
              <div className="card" style={{ marginBottom: 0 }}>
                <div
                  className="card-head"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "1rem"
                  }}
                >
                  <div className="card-title">SPC Analysis</div>
                  <div className="gap1">
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={loadSpc}
                      disabled={spcState.loading || !spcFilters.dimensionId}
                    >
                      {spcState.loading ? "Loading…" : "Refresh"}
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={exportSpcSummary}
                      disabled={!spc}
                    >
                      Export Summary CSV
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={exportSpcPoints}
                      disabled={!spcPoints.length}
                    >
                      Export Points CSV
                    </button>
                  </div>
                </div>
                <div className="card-body">
                  <div className="row3">
                    <div className="field">
                      <label>Characteristic</label>
                      <select
                        value={spcFilters.dimensionId}
                        onChange={(e) =>
                          setSpcFilters((prev) => ({ ...prev, dimensionId: e.target.value }))
                        }
                      >
                        <option value="">Select characteristic…</option>
                        {dimensions.map((dim) => (
                          <option key={String(dim.id)} value={String(dim.id)}>
                            {dim.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label>Operation ID</label>
                      <input
                        value={spcFilters.operationId}
                        onChange={(e) =>
                          setSpcFilters((prev) => ({ ...prev, operationId: e.target.value }))
                        }
                        placeholder="Optional"
                      />
                    </div>
                    <div className="field">
                      <label>Job ID</label>
                      <input
                        value={spcFilters.jobId}
                        onChange={(e) =>
                          setSpcFilters((prev) => ({ ...prev, jobId: e.target.value }))
                        }
                        placeholder="Optional"
                      />
                    </div>
                  </div>
                  <div className="row3 mt1">
                    <div className="field">
                      <label>Work Center</label>
                      <input
                        value={spcFilters.workCenterId}
                        onChange={(e) =>
                          setSpcFilters((prev) => ({ ...prev, workCenterId: e.target.value }))
                        }
                        placeholder="Optional"
                      />
                    </div>
                    <div className="field">
                      <label>Tool ID</label>
                      <input
                        value={spcFilters.toolId}
                        onChange={(e) =>
                          setSpcFilters((prev) => ({ ...prev, toolId: e.target.value }))
                        }
                        placeholder="Optional"
                      />
                    </div>
                    <div className="field">
                      <label>Rule Set</label>
                      <input
                        value={spcFilters.rules}
                        onChange={(e) =>
                          setSpcFilters((prev) => ({ ...prev, rules: e.target.value }))
                        }
                        placeholder={ANALYTICS_RULE_OPTIONS.join(",")}
                      />
                    </div>
                  </div>
                  <div className="row3 mt1">
                    <div className="field">
                      <label>Start Date</label>
                      <input
                        type="date"
                        value={spcFilters.dateFrom}
                        onChange={(e) =>
                          setSpcFilters((prev) => ({ ...prev, dateFrom: e.target.value }))
                        }
                      />
                    </div>
                    <div className="field">
                      <label>End Date</label>
                      <input
                        type="date"
                        value={spcFilters.dateTo}
                        onChange={(e) =>
                          setSpcFilters((prev) => ({ ...prev, dateTo: e.target.value }))
                        }
                      />
                    </div>
                    <div className="field">
                      <label>Sample Limit</label>
                      <input
                        type="number"
                        min="1"
                        max="5000"
                        value={spcFilters.limit}
                        onChange={(e) =>
                          setSpcFilters((prev) => ({ ...prev, limit: e.target.value }))
                        }
                      />
                    </div>
                  </div>
                  <div className="gap1 mt2">
                    <button
                      className="btn btn-primary"
                      onClick={loadSpc}
                      disabled={spcState.loading || !spcFilters.dimensionId}
                    >
                      {spcState.loading ? "Loading…" : "Load SPC"}
                    </button>
                    <span
                      className="text-muted"
                      style={{ fontSize: ".74rem", alignSelf: "center" }}
                    >
                      {currentDimension
                        ? `${currentDimension.partNumber} · Op ${currentDimension.operationKey} · ${currentDimension.dimensionName}`
                        : "Select a characteristic to begin."}
                    </span>
                  </div>
                  {spcState.error && <p className="err-text mt1">{spcState.error}</p>}
                  {!spc && !spcState.loading ? (
                    <div className="empty-state" style={{ padding: "1.25rem", marginTop: "1rem" }}>
                      Load SPC analytics to see control limits, capability metrics, and point-level
                      rule hits.
                    </div>
                  ) : null}
                </div>
              </div>

              {spc ? (
                <>
                  <div className="card" style={{ marginBottom: 0 }}>
                    <div
                      className="card-head"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "1rem"
                      }}
                    >
                      <div className="card-title">Characteristic Summary</div>
                      <div className="text-muted" style={{ fontSize: ".7rem" }}>
                        Sample size {formatCompactNumber(spc.sampleSize)} · Rules{" "}
                        {Array.isArray(spc.rulesEvaluated) ? spc.rulesEvaluated.join(", ") : "n/a"}
                      </div>
                    </div>
                    <div className="card-body">
                      <div className="row3">
                        {[
                          ["Mean", formatCompactNumber(spcStatistics?.mean)],
                          ["Min", formatCompactNumber(spcStatistics?.min)],
                          ["Max", formatCompactNumber(spcStatistics?.max)],
                          ["Std Dev", formatCompactNumber(spcStatistics?.sampleStdDev)],
                          ["Cp", formatCompactNumber(spcStatistics?.cp)],
                          ["Cpk", formatCompactNumber(spcStatistics?.cpk)],
                          ["Pp", formatCompactNumber(spcStatistics?.pp)],
                          ["Ppk", formatCompactNumber(spcStatistics?.ppk)],
                          [
                            "LSL / USL",
                            `${formatCompactNumber(spcCharacteristic?.lsl)} / ${formatCompactNumber(spcCharacteristic?.usl)}`
                          ]
                        ].map(([label, value]) => (
                          <div
                            key={label}
                            style={{
                              border: "1px solid var(--border2)",
                              borderRadius: "3px",
                              background: "var(--panel)",
                              padding: ".75rem"
                            }}
                          >
                            <div className="section-label" style={{ marginBottom: ".35rem" }}>
                              {label}
                            </div>
                            <div
                              style={{
                                fontFamily: "var(--mono)",
                                fontSize: "1rem",
                                color: "var(--accent2)"
                              }}
                            >
                              {value}
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="row2 mt1">
                        {[
                          ["CL", spcStatistics?.controlLimits?.cl],
                          ["UCL", spcStatistics?.controlLimits?.ucl],
                          ["LCL", spcStatistics?.controlLimits?.lcl]
                        ].map(([label, value]) => (
                          <div
                            key={label}
                            style={{
                              border: "1px solid var(--border2)",
                              borderRadius: "3px",
                              background: "var(--panel)",
                              padding: ".75rem"
                            }}
                          >
                            <div className="section-label" style={{ marginBottom: ".35rem" }}>
                              {label}
                            </div>
                            <div
                              style={{
                                fontFamily: "var(--mono)",
                                fontSize: "1rem",
                                color: "var(--text)"
                              }}
                            >
                              {formatCompactNumber(value)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="row2" style={{ alignItems: "start" }}>
                    <div className="card" style={{ marginBottom: 0 }}>
                      <div
                        className="card-head"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: "1rem"
                        }}
                      >
                        <div className="card-title">Rule Findings</div>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={exportRuleFindings}
                          disabled={!spcRuleFindings.length}
                        >
                          Export CSV
                        </button>
                      </div>
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th
                              onClick={() =>
                                toggleSort(
                                  spcRuleSortKey,
                                  setSpcRuleSortKey,
                                  setSpcRuleSortDir,
                                  "rule"
                                )
                              }
                              style={{ cursor: "pointer" }}
                            >
                              Rule {sortIcon(spcRuleSortKey, spcRuleSortDir, "rule")}
                            </th>
                            <th
                              onClick={() =>
                                toggleSort(
                                  spcRuleSortKey,
                                  setSpcRuleSortKey,
                                  setSpcRuleSortDir,
                                  "hits"
                                )
                              }
                              style={{ cursor: "pointer" }}
                            >
                              Hits {sortIcon(spcRuleSortKey, spcRuleSortDir, "hits")}
                            </th>
                            <th>Points</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pagedSpcRuleFindings.length === 0 ? (
                            <tr>
                              <td colSpan={3}>
                                <div className="empty-state">No rule findings.</div>
                              </td>
                            </tr>
                          ) : (
                            pagedSpcRuleFindings.map((row) => (
                              <tr key={row.rule}>
                                <td>{row.rule}</td>
                                <td className="mono">{formatCompactNumber(row.count)}</td>
                                <td className="mono">
                                  {(row.violatingPointIndices || []).join(", ") || "—"}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                      <div
                        className="card-body"
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: ".65rem",
                          flexWrap: "wrap"
                        }}
                      >
                        <div className="text-muted">
                          Showing{" "}
                          {sortedSpcRuleFindings.length === 0
                            ? 0
                            : (safeSpcRulePage - 1) * spcRulePageSize + 1}
                          -
                          {Math.min(
                            sortedSpcRuleFindings.length,
                            safeSpcRulePage * spcRulePageSize
                          )}{" "}
                          of {sortedSpcRuleFindings.length}
                        </div>
                        <div className="gap1">
                          <select
                            value={String(spcRulePageSize)}
                            onChange={(e) =>
                              setSpcRulePageSize(Math.max(1, Number(e.target.value) || 25))
                            }
                          >
                            <option value="25">25 / page</option>
                            <option value="50">50 / page</option>
                            <option value="100">100 / page</option>
                          </select>
                          <button
                            className="btn btn-ghost btn-sm"
                            disabled={safeSpcRulePage <= 1}
                            onClick={() => setSpcRulePage((p) => Math.max(1, p - 1))}
                          >
                            Prev
                          </button>
                          <span className="text-muted mono">
                            Page {safeSpcRulePage}/{spcRuleTotalPages}
                          </span>
                          <button
                            className="btn btn-ghost btn-sm"
                            disabled={safeSpcRulePage >= spcRuleTotalPages}
                            onClick={() =>
                              setSpcRulePage((p) => Math.min(spcRuleTotalPages, p + 1))
                            }
                          >
                            Next
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="card" style={{ marginBottom: 0 }}>
                      <div
                        className="card-head"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: "1rem"
                        }}
                      >
                        <div className="card-title">Point Drilldown</div>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={exportSpcPoints}
                          disabled={!spcPoints.length}
                        >
                          Export CSV
                        </button>
                      </div>
                      <div style={{ overflowX: "auto" }}>
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th
                                onClick={() =>
                                  toggleSort(
                                    spcPointSortKey,
                                    setSpcPointSortKey,
                                    setSpcPointSortDir,
                                    "index"
                                  )
                                }
                                style={{ cursor: "pointer" }}
                              >
                                # {sortIcon(spcPointSortKey, spcPointSortDir, "index")}
                              </th>
                              <th
                                onClick={() =>
                                  toggleSort(
                                    spcPointSortKey,
                                    setSpcPointSortKey,
                                    setSpcPointSortDir,
                                    "record"
                                  )
                                }
                                style={{ cursor: "pointer" }}
                              >
                                Record {sortIcon(spcPointSortKey, spcPointSortDir, "record")}
                              </th>
                              <th
                                onClick={() =>
                                  toggleSort(
                                    spcPointSortKey,
                                    setSpcPointSortKey,
                                    setSpcPointSortDir,
                                    "timestamp"
                                  )
                                }
                                style={{ cursor: "pointer" }}
                              >
                                Timestamp {sortIcon(spcPointSortKey, spcPointSortDir, "timestamp")}
                              </th>
                              <th
                                onClick={() =>
                                  toggleSort(
                                    spcPointSortKey,
                                    setSpcPointSortKey,
                                    setSpcPointSortDir,
                                    "value"
                                  )
                                }
                                style={{ cursor: "pointer" }}
                              >
                                Value {sortIcon(spcPointSortKey, spcPointSortDir, "value")}
                              </th>
                              <th
                                onClick={() =>
                                  toggleSort(
                                    spcPointSortKey,
                                    setSpcPointSortKey,
                                    setSpcPointSortDir,
                                    "control"
                                  )
                                }
                                style={{ cursor: "pointer" }}
                              >
                                Control {sortIcon(spcPointSortKey, spcPointSortDir, "control")}
                              </th>
                              <th>Rules</th>
                            </tr>
                          </thead>
                          <tbody>
                            {pagedSpcPoints.length === 0 ? (
                              <tr>
                                <td colSpan={6}>
                                  <div className="empty-state">
                                    No points returned for the current filters.
                                  </div>
                                </td>
                              </tr>
                            ) : (
                              pagedSpcPoints.map((point) => (
                                <tr key={`${point.index}-${point.recordId}-${point.pieceNumber}`}>
                                  <td className="mono">{point.index + 1}</td>
                                  <td className="mono">{point.recordId}</td>
                                  <td className="mono" style={{ fontSize: ".72rem" }}>
                                    {fmtTs(point.timestamp)}
                                  </td>
                                  <td className="mono">{formatCompactNumber(point.value, 4)}</td>
                                  <td>
                                    {point.isOutOfControl ? (
                                      <span className="badge badge-oot">OOC</span>
                                    ) : (
                                      <span className="badge badge-ok">OK</span>
                                    )}
                                  </td>
                                  <td className="mono" style={{ fontSize: ".7rem" }}>
                                    {(point.ruleHits || []).join(", ") || "—"}
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                        <div
                          className="card-body"
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: ".65rem",
                            flexWrap: "wrap"
                          }}
                        >
                          <div className="text-muted">
                            Showing{" "}
                            {sortedSpcPoints.length === 0
                              ? 0
                              : (safeSpcPointPage - 1) * spcPointPageSize + 1}
                            -{Math.min(sortedSpcPoints.length, safeSpcPointPage * spcPointPageSize)}{" "}
                            of {sortedSpcPoints.length}
                          </div>
                          <div className="gap1">
                            <select
                              value={String(spcPointPageSize)}
                              onChange={(e) =>
                                setSpcPointPageSize(Math.max(1, Number(e.target.value) || 25))
                              }
                            >
                              <option value="25">25 / page</option>
                              <option value="50">50 / page</option>
                              <option value="100">100 / page</option>
                            </select>
                            <button
                              className="btn btn-ghost btn-sm"
                              disabled={safeSpcPointPage <= 1}
                              onClick={() => setSpcPointPage((p) => Math.max(1, p - 1))}
                            >
                              Prev
                            </button>
                            <span className="text-muted mono">
                              Page {safeSpcPointPage}/{spcPointTotalPages}
                            </span>
                            <button
                              className="btn btn-ghost btn-sm"
                              disabled={safeSpcPointPage >= spcPointTotalPages}
                              onClick={() =>
                                setSpcPointPage((p) => Math.min(spcPointTotalPages, p + 1))
                              }
                            >
                              Next
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              ) : null}
            </div>
  );
}
