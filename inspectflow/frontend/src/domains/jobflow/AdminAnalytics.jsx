import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { api } from "../../api/index.js";
import {
  downloadCsv,
  flattenAnalyticsDimensions,
  formatCompactNumber,
  formatDateInputValue,
  formatPercent,
  readUrlEnumParam,
  readUrlIntParam,
  readUrlQueryParam,
  rowsToCsv,
  writeUrlQueryParams
} from "./jobflowUtils.js";
import { ANALYTICS_RULE_OPTIONS } from "./domainConfig.js";
import { fmtTs } from "../../shared/utils/jobflowCore.ts";
import AdminAnalyticsSpc from "./AdminAnalyticsSpc.jsx";

export default function AdminAnalytics({ parts, currentRole, canViewAdmin }) {
  const [tab, setTab] = useState(() =>
    readUrlEnumParam("anaTab", ["workforce", "spc"], "workforce")
  );
  const dimensions = useMemo(() => flattenAnalyticsDimensions(parts), [parts]);
  const [workforceFilters, setWorkforceFilters] = useState(() => ({
    dateFrom: readUrlQueryParam("anaWfFrom", ""),
    dateTo: readUrlQueryParam("anaWfTo", ""),
    limit: String(readUrlIntParam("anaWfLimit", 10, { min: 1, max: 50 }))
  }));
  const [workforceState, setWorkforceState] = useState({
    loading: false,
    error: "",
    data: null
  });
  const [spcFilters, setSpcFilters] = useState(() => ({
    dimensionId: readUrlQueryParam("anaSpcDim", ""),
    operationId: readUrlQueryParam("anaSpcOp", ""),
    jobId: readUrlQueryParam("anaSpcJob", ""),
    workCenterId: readUrlQueryParam("anaSpcWc", ""),
    toolId: readUrlQueryParam("anaSpcTool", ""),
    dateFrom: readUrlQueryParam("anaSpcFrom", ""),
    dateTo: readUrlQueryParam("anaSpcTo", ""),
    limit: String(readUrlIntParam("anaSpcLimit", 120, { min: 1, max: 5000 })),
    rules: readUrlQueryParam("anaSpcRules", ANALYTICS_RULE_OPTIONS.join(","))
  }));
  const [spcState, setSpcState] = useState({
    loading: false,
    error: "",
    data: null
  });
  const [operatorSortKey, setOperatorSortKey] = useState(() =>
    readUrlEnumParam("anaOpSort", ["operator", "records", "pieces", "fpy", "oot"], "pieces")
  );
  const [operatorSortDir, setOperatorSortDir] = useState(() =>
    readUrlEnumParam("anaOpDir", ["asc", "desc"], "desc")
  );
  const [operatorPageSize, setOperatorPageSize] = useState(() =>
    readUrlIntParam("anaOpPageSize", 25, { min: 1, max: 1000 })
  );
  const [operatorPage, setOperatorPage] = useState(() =>
    readUrlIntParam("anaOpPage", 1, { min: 1, max: 100000 })
  );
  const [workCenterSortKey, setWorkCenterSortKey] = useState(() =>
    readUrlEnumParam("anaWcSort", ["workCenter", "records", "pieces", "fpy", "oot"], "pieces")
  );
  const [workCenterSortDir, setWorkCenterSortDir] = useState(() =>
    readUrlEnumParam("anaWcDir", ["asc", "desc"], "desc")
  );
  const [workCenterPageSize, setWorkCenterPageSize] = useState(() =>
    readUrlIntParam("anaWcPageSize", 25, { min: 1, max: 1000 })
  );
  const [workCenterPage, setWorkCenterPage] = useState(() =>
    readUrlIntParam("anaWcPage", 1, { min: 1, max: 100000 })
  );
  const [jobSortKey, setJobSortKey] = useState(() =>
    readUrlEnumParam("anaJobSort", ["job", "part", "pieces", "fpy"], "pieces")
  );
  const [jobSortDir, setJobSortDir] = useState(() =>
    readUrlEnumParam("anaJobDir", ["asc", "desc"], "desc")
  );
  const [jobPageSize, setJobPageSize] = useState(() =>
    readUrlIntParam("anaJobPageSize", 25, { min: 1, max: 1000 })
  );
  const [jobPage, setJobPage] = useState(() =>
    readUrlIntParam("anaJobPage", 1, { min: 1, max: 100000 })
  );
  const [spcRuleSortKey, setSpcRuleSortKey] = useState(() =>
    readUrlEnumParam("anaSpcRuleSort", ["rule", "hits"], "hits")
  );
  const [spcRuleSortDir, setSpcRuleSortDir] = useState(() =>
    readUrlEnumParam("anaSpcRuleDir", ["asc", "desc"], "desc")
  );
  const [spcRulePageSize, setSpcRulePageSize] = useState(() =>
    readUrlIntParam("anaSpcRulePageSize", 25, { min: 1, max: 1000 })
  );
  const [spcRulePage, setSpcRulePage] = useState(() =>
    readUrlIntParam("anaSpcRulePage", 1, { min: 1, max: 100000 })
  );
  const [spcPointSortKey, setSpcPointSortKey] = useState(() =>
    readUrlEnumParam(
      "anaSpcPointSort",
      ["index", "record", "timestamp", "value", "control"],
      "timestamp"
    )
  );
  const [spcPointSortDir, setSpcPointSortDir] = useState(() =>
    readUrlEnumParam("anaSpcPointDir", ["asc", "desc"], "desc")
  );
  const [spcPointPageSize, setSpcPointPageSize] = useState(() =>
    readUrlIntParam("anaSpcPointPageSize", 25, { min: 1, max: 1000 })
  );
  const [spcPointPage, setSpcPointPage] = useState(() =>
    readUrlIntParam("anaSpcPointPage", 1, { min: 1, max: 100000 })
  );
  const pageResetReadyRef = useRef(false);
  const workCenterPageResetReadyRef = useRef(false);
  const jobPageResetReadyRef = useRef(false);
  const spcRulePageResetReadyRef = useRef(false);
  const spcPointPageResetReadyRef = useRef(false);

  useEffect(() => {
    writeUrlQueryParams({
      anaTab: tab,
      anaOpSort: operatorSortKey,
      anaOpDir: operatorSortDir,
      anaOpPageSize: operatorPageSize,
      anaOpPage: operatorPage,
      anaWcSort: workCenterSortKey,
      anaWcDir: workCenterSortDir,
      anaWcPageSize: workCenterPageSize,
      anaWcPage: workCenterPage,
      anaJobSort: jobSortKey,
      anaJobDir: jobSortDir,
      anaJobPageSize: jobPageSize,
      anaJobPage: jobPage,
      anaSpcRuleSort: spcRuleSortKey,
      anaSpcRuleDir: spcRuleSortDir,
      anaSpcRulePageSize: spcRulePageSize,
      anaSpcRulePage: spcRulePage,
      anaSpcPointSort: spcPointSortKey,
      anaSpcPointDir: spcPointSortDir,
      anaSpcPointPageSize: spcPointPageSize,
      anaSpcPointPage: spcPointPage,
      anaWfFrom: workforceFilters.dateFrom,
      anaWfTo: workforceFilters.dateTo,
      anaWfLimit: workforceFilters.limit,
      anaSpcDim: spcFilters.dimensionId,
      anaSpcOp: spcFilters.operationId,
      anaSpcJob: spcFilters.jobId,
      anaSpcWc: spcFilters.workCenterId,
      anaSpcTool: spcFilters.toolId,
      anaSpcFrom: spcFilters.dateFrom,
      anaSpcTo: spcFilters.dateTo,
      anaSpcLimit: spcFilters.limit,
      anaSpcRules: spcFilters.rules
    });
  }, [
    tab,
    operatorSortKey,
    operatorSortDir,
    operatorPageSize,
    operatorPage,
    workCenterSortKey,
    workCenterSortDir,
    workCenterPageSize,
    workCenterPage,
    jobSortKey,
    jobSortDir,
    jobPageSize,
    jobPage,
    spcRuleSortKey,
    spcRuleSortDir,
    spcRulePageSize,
    spcRulePage,
    spcPointSortKey,
    spcPointSortDir,
    spcPointPageSize,
    spcPointPage,
    workforceFilters.dateFrom,
    workforceFilters.dateTo,
    workforceFilters.limit,
    spcFilters.dimensionId,
    spcFilters.operationId,
    spcFilters.jobId,
    spcFilters.workCenterId,
    spcFilters.toolId,
    spcFilters.dateFrom,
    spcFilters.dateTo,
    spcFilters.limit,
    spcFilters.rules
  ]);

  useEffect(() => {
    if (!dimensions.length) return;
    setSpcFilters((prev) => {
      const hasSelection =
        prev.dimensionId && dimensions.some((dim) => String(dim.id) === String(prev.dimensionId));
      if (hasSelection) return prev;
      return {
        ...prev,
        dimensionId: String(dimensions[0].id)
      };
    });
  }, [dimensions]);

  async function loadWorkforce() {
    if (!canViewAdmin) return;
    setWorkforceState((prev) => ({ ...prev, loading: true, error: "" }));
    try {
      const result = await api.analytics.workforcePerformance(
        {
          dateFrom: workforceFilters.dateFrom || undefined,
          dateTo: workforceFilters.dateTo || undefined,
          limit: workforceFilters.limit || undefined
        },
        currentRole
      );
      setWorkforceState({
        loading: false,
        error: "",
        data: result
      });
    } catch (err) {
      setWorkforceState((prev) => ({
        ...prev,
        loading: false,
        error: err?.message || "Unable to load workforce analytics."
      }));
    }
  }

  async function loadSpc() {
    if (!canViewAdmin) return;
    if (!spcFilters.dimensionId) {
      setSpcState((prev) => ({
        ...prev,
        error: "Select a characteristic before loading SPC analytics."
      }));
      return;
    }
    setSpcState((prev) => ({ ...prev, loading: true, error: "" }));
    try {
      const result = await api.analytics.spcAnalysis(
        {
          dimensionId: spcFilters.dimensionId,
          operationId: spcFilters.operationId || undefined,
          jobId: spcFilters.jobId || undefined,
          workCenterId: spcFilters.workCenterId || undefined,
          toolId: spcFilters.toolId || undefined,
          dateFrom: spcFilters.dateFrom || undefined,
          dateTo: spcFilters.dateTo || undefined,
          limit: spcFilters.limit || undefined,
          rules: spcFilters.rules || undefined
        },
        currentRole
      );
      setSpcState({
        loading: false,
        error: "",
        data: result
      });
    } catch (err) {
      setSpcState((prev) => ({
        ...prev,
        loading: false,
        error: err?.message || "Unable to load SPC analytics."
      }));
    }
  }

  useEffect(() => {
    if (tab !== "workforce") return;
    if (workforceState.data || workforceState.loading) return;
    loadWorkforce().catch((err) => { console.error("[inspectflow] loadWorkforce:", err?.message || err); });
  }, [tab, workforceState.data, workforceState.loading]);

  useEffect(() => {
    if (tab !== "spc") return;
    if (!spcFilters.dimensionId || spcState.data || spcState.loading) return;
    loadSpc().catch((err) => { console.error("[inspectflow] loadSpc:", err?.message || err); });
  }, [tab, spcFilters.dimensionId, spcState.data, spcState.loading]);

  const workforce = workforceState.data;
  const spc = spcState.data;
  const workforceTotals = workforce?.summary || {};
  const workforceRates = workforce?.rates || {};
  const workforceLatestBuild = workforce?.freshness?.latestBuild || null;
  const jobStatusCounts = workforce?.production?.jobStatusCounts || {};
  const operatorRows = workforce?.breakdowns?.byOperator || [];
  const workCenterRows = workforce?.breakdowns?.byWorkCenter || [];
  const jobRows = workforce?.breakdowns?.byJob || [];
  const dailyTrendRows = workforce?.breakdowns?.dailyTrend || [];
  const spcCharacteristic = spc?.characteristic || null;
  const spcStatistics = spc?.statistics || null;
  const spcRuleFindings = spc?.ruleFindings || [];
  const spcPoints = spc?.points || [];
  const currentDimension =
    dimensions.find((dim) => String(dim.id) === String(spcFilters.dimensionId)) || null;
  const sortedOperatorRows = useMemo(() => {
    const dir = operatorSortDir === "asc" ? 1 : -1;
    return [...operatorRows].sort((a, b) => {
      const av =
        operatorSortKey === "operator"
          ? String(a.operatorName || "")
          : operatorSortKey === "records"
            ? Number(a.totals?.recordsSubmitted || 0)
            : operatorSortKey === "fpy"
              ? Number(a.rates?.firstPassYield || 0)
              : operatorSortKey === "oot"
                ? Number(a.rates?.ootRate || 0)
                : Number(a.totals?.totalPieces || 0);
      const bv =
        operatorSortKey === "operator"
          ? String(b.operatorName || "")
          : operatorSortKey === "records"
            ? Number(b.totals?.recordsSubmitted || 0)
            : operatorSortKey === "fpy"
              ? Number(b.rates?.firstPassYield || 0)
              : operatorSortKey === "oot"
                ? Number(b.rates?.ootRate || 0)
                : Number(b.totals?.totalPieces || 0);
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [operatorRows, operatorSortKey, operatorSortDir]);
  const operatorTotalPages = Math.max(
    1,
    Math.ceil(sortedOperatorRows.length / Math.max(1, operatorPageSize))
  );
  const safeOperatorPage = Math.min(Math.max(1, operatorPage), operatorTotalPages);
  const pagedOperatorRows = sortedOperatorRows.slice(
    (safeOperatorPage - 1) * operatorPageSize,
    safeOperatorPage * operatorPageSize
  );
  const sortedWorkCenterRows = useMemo(() => {
    const dir = workCenterSortDir === "asc" ? 1 : -1;
    return [...workCenterRows].sort((a, b) => {
      const av =
        workCenterSortKey === "workCenter"
          ? String(a.workCenterId || "")
          : workCenterSortKey === "records"
            ? Number(a.totals?.recordsSubmitted || 0)
            : workCenterSortKey === "fpy"
              ? Number(a.rates?.firstPassYield || 0)
              : workCenterSortKey === "oot"
                ? Number(a.rates?.ootRate || 0)
                : Number(a.totals?.totalPieces || 0);
      const bv =
        workCenterSortKey === "workCenter"
          ? String(b.workCenterId || "")
          : workCenterSortKey === "records"
            ? Number(b.totals?.recordsSubmitted || 0)
            : workCenterSortKey === "fpy"
              ? Number(b.rates?.firstPassYield || 0)
              : workCenterSortKey === "oot"
                ? Number(b.rates?.ootRate || 0)
                : Number(b.totals?.totalPieces || 0);
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [workCenterRows, workCenterSortKey, workCenterSortDir]);
  const workCenterTotalPages = Math.max(
    1,
    Math.ceil(sortedWorkCenterRows.length / Math.max(1, workCenterPageSize))
  );
  const safeWorkCenterPage = Math.min(Math.max(1, workCenterPage), workCenterTotalPages);
  const pagedWorkCenterRows = sortedWorkCenterRows.slice(
    (safeWorkCenterPage - 1) * workCenterPageSize,
    safeWorkCenterPage * workCenterPageSize
  );
  const sortedJobRows = useMemo(() => {
    const dir = jobSortDir === "asc" ? 1 : -1;
    return [...jobRows].sort((a, b) => {
      const av =
        jobSortKey === "job"
          ? String(a.jobId || "")
          : jobSortKey === "part"
            ? String(a.partId || "")
            : jobSortKey === "fpy"
              ? Number(a.rates?.firstPassYield || 0)
              : Number(a.totals?.totalPieces || 0);
      const bv =
        jobSortKey === "job"
          ? String(b.jobId || "")
          : jobSortKey === "part"
            ? String(b.partId || "")
            : jobSortKey === "fpy"
              ? Number(b.rates?.firstPassYield || 0)
              : Number(b.totals?.totalPieces || 0);
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [jobRows, jobSortKey, jobSortDir]);
  const jobTotalPages = Math.max(1, Math.ceil(sortedJobRows.length / Math.max(1, jobPageSize)));
  const safeJobPage = Math.min(Math.max(1, jobPage), jobTotalPages);
  const pagedJobRows = sortedJobRows.slice(
    (safeJobPage - 1) * jobPageSize,
    safeJobPage * jobPageSize
  );
  const sortedSpcRuleFindings = useMemo(() => {
    const dir = spcRuleSortDir === "asc" ? 1 : -1;
    return [...spcRuleFindings].sort((a, b) => {
      const av = spcRuleSortKey === "rule" ? String(a.rule || "") : Number(a.count || 0);
      const bv = spcRuleSortKey === "rule" ? String(b.rule || "") : Number(b.count || 0);
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [spcRuleFindings, spcRuleSortKey, spcRuleSortDir]);
  const spcRuleTotalPages = Math.max(
    1,
    Math.ceil(sortedSpcRuleFindings.length / Math.max(1, spcRulePageSize))
  );
  const safeSpcRulePage = Math.min(Math.max(1, spcRulePage), spcRuleTotalPages);
  const pagedSpcRuleFindings = sortedSpcRuleFindings.slice(
    (safeSpcRulePage - 1) * spcRulePageSize,
    safeSpcRulePage * spcRulePageSize
  );
  const sortedSpcPoints = useMemo(() => {
    const dir = spcPointSortDir === "asc" ? 1 : -1;
    return [...spcPoints].sort((a, b) => {
      const av =
        spcPointSortKey === "index"
          ? Number(a.index || 0)
          : spcPointSortKey === "record"
            ? Number(a.recordId || 0)
            : spcPointSortKey === "value"
              ? Number(a.value || 0)
              : spcPointSortKey === "control"
                ? Number(a.isOutOfControl ? 1 : 0)
                : Date.parse(a.timestamp || "") || 0;
      const bv =
        spcPointSortKey === "index"
          ? Number(b.index || 0)
          : spcPointSortKey === "record"
            ? Number(b.recordId || 0)
            : spcPointSortKey === "value"
              ? Number(b.value || 0)
              : spcPointSortKey === "control"
                ? Number(b.isOutOfControl ? 1 : 0)
                : Date.parse(b.timestamp || "") || 0;
      return (av - bv) * dir;
    });
  }, [spcPoints, spcPointSortKey, spcPointSortDir]);
  const spcPointTotalPages = Math.max(
    1,
    Math.ceil(sortedSpcPoints.length / Math.max(1, spcPointPageSize))
  );
  const safeSpcPointPage = Math.min(Math.max(1, spcPointPage), spcPointTotalPages);
  const pagedSpcPoints = sortedSpcPoints.slice(
    (safeSpcPointPage - 1) * spcPointPageSize,
    safeSpcPointPage * spcPointPageSize
  );

  useEffect(() => {
    if (!pageResetReadyRef.current) {
      pageResetReadyRef.current = true;
      return;
    }
    setOperatorPage(1);
  }, [operatorSortKey, operatorSortDir, operatorPageSize]);
  useEffect(() => {
    if (operatorPage !== safeOperatorPage) setOperatorPage(safeOperatorPage);
  }, [operatorPage, safeOperatorPage]);
  useEffect(() => {
    if (!workCenterPageResetReadyRef.current) {
      workCenterPageResetReadyRef.current = true;
      return;
    }
    setWorkCenterPage(1);
  }, [workCenterSortKey, workCenterSortDir, workCenterPageSize]);
  useEffect(() => {
    if (workCenterPage !== safeWorkCenterPage) setWorkCenterPage(safeWorkCenterPage);
  }, [workCenterPage, safeWorkCenterPage]);
  useEffect(() => {
    if (!jobPageResetReadyRef.current) {
      jobPageResetReadyRef.current = true;
      return;
    }
    setJobPage(1);
  }, [jobSortKey, jobSortDir, jobPageSize]);
  useEffect(() => {
    if (jobPage !== safeJobPage) setJobPage(safeJobPage);
  }, [jobPage, safeJobPage]);
  useEffect(() => {
    if (!spcRulePageResetReadyRef.current) {
      spcRulePageResetReadyRef.current = true;
      return;
    }
    setSpcRulePage(1);
  }, [spcRuleSortKey, spcRuleSortDir, spcRulePageSize]);
  useEffect(() => {
    if (spcRulePage !== safeSpcRulePage) setSpcRulePage(safeSpcRulePage);
  }, [spcRulePage, safeSpcRulePage]);
  useEffect(() => {
    if (!spcPointPageResetReadyRef.current) {
      spcPointPageResetReadyRef.current = true;
      return;
    }
    setSpcPointPage(1);
  }, [spcPointSortKey, spcPointSortDir, spcPointPageSize]);
  useEffect(() => {
    if (spcPointPage !== safeSpcPointPage) setSpcPointPage(safeSpcPointPage);
  }, [spcPointPage, safeSpcPointPage]);

  function toggleSort(currentKey, setKey, setDir, key) {
    if (currentKey === key) {
      setDir((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setKey(key);
    setDir("asc");
  }
  function sortIcon(currentKey, currentDir, key) {
    if (currentKey !== key) return "";
    return currentDir === "asc" ? "↑" : "↓";
  }
  const chartBars = [
    { label: "Open", value: Number(jobStatusCounts.open || 0), tone: "#2e88d4" },
    { label: "Draft", value: Number(jobStatusCounts.draft || 0), tone: "#9b6fd4" },
    { label: "Incomplete", value: Number(jobStatusCounts.incomplete || 0), tone: "#d4a017" },
    { label: "Closed", value: Number(jobStatusCounts.closed || 0), tone: "#27c76a" }
  ];
  const maxJobStatus = Math.max(1, ...chartBars.map((row) => row.value));
  const maxDailyTrend = Math.max(
    1,
    ...dailyTrendRows.map((row) => Number(row.totals?.totalPieces || 0))
  );

  function exportWorkforceSummary() {
    if (!workforce) return;
    const rows = [
      ["siteId", workforce.siteId || ""],
      ["windowFrom", workforce.window?.dateFrom || ""],
      ["windowTo", workforce.window?.dateTo || ""],
      ["totalPieces", workforceTotals.totalPieces ?? 0],
      ["passPieces", workforceTotals.passPieces ?? 0],
      ["ootPieces", workforceTotals.ootPieces ?? 0],
      ["correctionEvents", workforceTotals.correctionEvents ?? 0],
      ["recordsSubmitted", workforceTotals.recordsSubmitted ?? 0],
      ["activeOperators", workforceTotals.activeOperators ?? 0],
      ["jobsObserved", workforceTotals.jobsObserved ?? 0],
      ["connectorTotalRuns", workforceTotals.connectorTotalRuns ?? 0],
      ["connectorReplayedRuns", workforceTotals.connectorReplayedRuns ?? 0],
      ["connectorFailedRuns", workforceTotals.connectorFailedRuns ?? 0],
      ["firstPassYield", workforceRates.firstPassYield ?? ""],
      ["ootRate", workforceRates.ootRate ?? ""],
      ["correctionRate", workforceRates.correctionRate ?? ""],
      ["avgPiecesPerRecord", workforceRates.avgPiecesPerRecord ?? ""],
      ["connectorFailureRate", workforceRates.connectorFailureRate ?? ""],
      ["connectorReplayRate", workforceRates.connectorReplayRate ?? ""]
    ];
    downloadCsv(
      `workforce-summary-${formatDateInputValue(workforce.window?.dateTo || new Date().toISOString()) || "latest"}.csv`,
      rowsToCsv(["metric", "value"], rows)
    );
  }

  function exportOperatorRows() {
    if (!operatorRows.length) return;
    const rows = operatorRows.map((row) => [
      row.operatorUserId ?? "",
      row.operatorName ?? "",
      row.totals?.recordsSubmitted ?? 0,
      row.totals?.totalPieces ?? 0,
      row.totals?.passPieces ?? 0,
      row.totals?.ootPieces ?? 0,
      row.totals?.correctionEvents ?? 0,
      row.rates?.firstPassYield ?? "",
      row.rates?.ootRate ?? "",
      row.rates?.correctionRate ?? "",
      row.rates?.avgPiecesPerRecord ?? ""
    ]);
    downloadCsv(
      "workforce-operator-breakdown.csv",
      rowsToCsv(
        [
          "operatorUserId",
          "operatorName",
          "recordsSubmitted",
          "totalPieces",
          "passPieces",
          "ootPieces",
          "correctionEvents",
          "firstPassYield",
          "ootRate",
          "correctionRate",
          "avgPiecesPerRecord"
        ],
        rows
      )
    );
  }

  function exportWorkCenterRows() {
    if (!workCenterRows.length) return;
    const rows = workCenterRows.map((row) => [
      row.workCenterId ?? "",
      row.totals?.recordsSubmitted ?? 0,
      row.totals?.totalPieces ?? 0,
      row.totals?.passPieces ?? 0,
      row.totals?.ootPieces ?? 0,
      row.totals?.correctionEvents ?? 0,
      row.rates?.firstPassYield ?? "",
      row.rates?.ootRate ?? "",
      row.rates?.correctionRate ?? "",
      row.rates?.avgPiecesPerRecord ?? ""
    ]);
    downloadCsv(
      "workforce-work-center-breakdown.csv",
      rowsToCsv(
        [
          "workCenterId",
          "recordsSubmitted",
          "totalPieces",
          "passPieces",
          "ootPieces",
          "correctionEvents",
          "firstPassYield",
          "ootRate",
          "correctionRate",
          "avgPiecesPerRecord"
        ],
        rows
      )
    );
  }

  function exportJobRows() {
    if (!jobRows.length) return;
    const rows = jobRows.map((row) => [
      row.jobId ?? "",
      row.partId ?? "",
      row.totals?.recordsSubmitted ?? 0,
      row.totals?.totalPieces ?? 0,
      row.totals?.passPieces ?? 0,
      row.totals?.ootPieces ?? 0,
      row.totals?.correctionEvents ?? 0,
      row.rates?.firstPassYield ?? "",
      row.rates?.ootRate ?? "",
      row.rates?.correctionRate ?? "",
      row.rates?.avgPiecesPerRecord ?? ""
    ]);
    downloadCsv(
      "workforce-job-breakdown.csv",
      rowsToCsv(
        [
          "jobId",
          "partId",
          "recordsSubmitted",
          "totalPieces",
          "passPieces",
          "ootPieces",
          "correctionEvents",
          "firstPassYield",
          "ootRate",
          "correctionRate",
          "avgPiecesPerRecord"
        ],
        rows
      )
    );
  }

  function exportTrendRows() {
    if (!dailyTrendRows.length) return;
    const rows = dailyTrendRows.map((row) => [
      row.day ?? "",
      row.totals?.recordsSubmitted ?? 0,
      row.totals?.totalPieces ?? 0,
      row.totals?.passPieces ?? 0,
      row.totals?.ootPieces ?? 0,
      row.totals?.correctionEvents ?? 0,
      row.rates?.firstPassYield ?? "",
      row.rates?.ootRate ?? "",
      row.rates?.correctionRate ?? "",
      row.rates?.avgPiecesPerRecord ?? ""
    ]);
    downloadCsv(
      "workforce-daily-trend.csv",
      rowsToCsv(
        [
          "day",
          "recordsSubmitted",
          "totalPieces",
          "passPieces",
          "ootPieces",
          "correctionEvents",
          "firstPassYield",
          "ootRate",
          "correctionRate",
          "avgPiecesPerRecord"
        ],
        rows
      )
    );
  }

  function exportSpcSummary() {
    if (!spc) return;
    const rows = [
      ["siteId", spc.siteId || ""],
      ["dimensionId", spcCharacteristic?.dimensionId ?? spc.filters?.dimensionId ?? ""],
      ["dimensionName", spcCharacteristic?.dimensionName || ""],
      ["sampleSize", spc.sampleSize ?? 0],
      ["mean", spcStatistics?.mean ?? ""],
      ["min", spcStatistics?.min ?? ""],
      ["max", spcStatistics?.max ?? ""],
      ["sampleStdDev", spcStatistics?.sampleStdDev ?? ""],
      ["populationStdDev", spcStatistics?.populationStdDev ?? ""],
      ["cp", spcStatistics?.cp ?? ""],
      ["cpk", spcStatistics?.cpk ?? ""],
      ["pp", spcStatistics?.pp ?? ""],
      ["ppk", spcStatistics?.ppk ?? ""],
      ["lsl", spcCharacteristic?.lsl ?? ""],
      ["usl", spcCharacteristic?.usl ?? ""]
    ];
    downloadCsv(
      `spc-summary-${spcCharacteristic?.dimensionId || "latest"}.csv`,
      rowsToCsv(["metric", "value"], rows)
    );
  }

  function exportRuleFindings() {
    if (!spcRuleFindings.length) return;
    const rows = spcRuleFindings.map((row) => [
      row.rule ?? "",
      row.count ?? 0,
      (row.violatingPointIndices || []).join(";")
    ]);
    downloadCsv(
      `spc-rules-${spcCharacteristic?.dimensionId || "latest"}.csv`,
      rowsToCsv(["rule", "count", "violatingPointIndices"], rows)
    );
  }

  function exportSpcPoints() {
    if (!spcPoints.length) return;
    const rows = spcPoints.map((point) => [
      point.index ?? "",
      point.recordId ?? "",
      point.timestamp ?? "",
      point.jobId ?? "",
      point.operationId ?? "",
      point.workCenterId ?? "",
      point.toolId ?? "",
      point.toolName ?? "",
      point.itNum ?? "",
      point.value ?? "",
      point.nominal ?? "",
      point.tolPlus ?? "",
      point.tolMinus ?? "",
      point.isOutOfControl ? "yes" : "no",
      (point.ruleHits || []).join(";")
    ]);
    downloadCsv(
      `spc-points-${spcCharacteristic?.dimensionId || "latest"}.csv`,
      rowsToCsv(
        [
          "index",
          "recordId",
          "timestamp",
          "jobId",
          "operationId",
          "workCenterId",
          "toolId",
          "toolName",
          "itNum",
          "value",
          "nominal",
          "tolPlus",
          "tolMinus",
          "isOutOfControl",
          "ruleHits"
        ],
        rows
      )
    );
  }

  return (
    <div>
      <div className="card">
        <div
          className="card-head"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem"
          }}
        >
          <div className="card-title">Analytics</div>
          <div className="text-muted" style={{ fontSize: ".7rem" }}>
            ANA-KPI-v3 dashboard surfaces for supervisors and admins
          </div>
        </div>
        <div className="sub-tabs" style={{ margin: "0 1.25rem 1rem" }}>
          <button
            className={`sub-tab ${tab === "workforce" ? "active" : ""}`}
            onClick={() => setTab("workforce")}
          >
            Performance
          </button>
          <button
            className={`sub-tab ${tab === "spc" ? "active" : ""}`}
            onClick={() => setTab("spc")}
          >
            SPC
          </button>
        </div>
        <div className="card-body" style={{ paddingTop: 0 }}>
          {tab === "workforce" ? (
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
                  <div className="card-title">Supervisor / Admin Performance</div>
                  <div className="gap1">
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={loadWorkforce}
                      disabled={workforceState.loading}
                    >
                      {workforceState.loading ? "Loading…" : "Refresh"}
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={exportWorkforceSummary}
                      disabled={!workforce}
                    >
                      Export Summary CSV
                    </button>
                  </div>
                </div>
                <div className="card-body">
                  <div className="row3">
                    <div className="field">
                      <label>Start Date</label>
                      <input
                        type="date"
                        value={workforceFilters.dateFrom}
                        onChange={(e) =>
                          setWorkforceFilters((prev) => ({ ...prev, dateFrom: e.target.value }))
                        }
                      />
                    </div>
                    <div className="field">
                      <label>End Date</label>
                      <input
                        type="date"
                        value={workforceFilters.dateTo}
                        onChange={(e) =>
                          setWorkforceFilters((prev) => ({ ...prev, dateTo: e.target.value }))
                        }
                      />
                    </div>
                    <div className="field">
                      <label>Breakdown Limit</label>
                      <input
                        type="number"
                        min="1"
                        max="50"
                        value={workforceFilters.limit}
                        onChange={(e) =>
                          setWorkforceFilters((prev) => ({ ...prev, limit: e.target.value }))
                        }
                      />
                    </div>
                  </div>
                  <div className="gap1 mt2">
                    <button
                      className="btn btn-primary"
                      onClick={loadWorkforce}
                      disabled={workforceState.loading}
                    >
                      {workforceState.loading ? "Loading…" : "Load Performance"}
                    </button>
                    <span
                      className="text-muted"
                      style={{ fontSize: ".74rem", alignSelf: "center" }}
                    >
                      Site: {workforce?.siteId || "default"} · Window:{" "}
                      {workforce?.window?.dateFrom
                        ? fmtTs(workforce.window.dateFrom)
                        : "last 30 days"}
                    </span>
                  </div>
                  {workforceState.error && <p className="err-text mt1">{workforceState.error}</p>}
                  {!workforce && !workforceState.loading ? (
                    <div className="empty-state" style={{ padding: "1.25rem", marginTop: "1rem" }}>
                      Load performance analytics to view production and rate summaries.
                    </div>
                  ) : null}
                </div>
              </div>

              {workforce ? (
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
                      <div className="card-title">Totals and Rates</div>
                      <div className="text-muted" style={{ fontSize: ".7rem" }}>
                        Latest build {workforceLatestBuild?.transform_version || "n/a"} ·{" "}
                        {workforceLatestBuild?.status || "n/a"} ·{" "}
                        {workforceLatestBuild?.completed_at
                          ? fmtTs(workforceLatestBuild.completed_at)
                          : "n/a"}
                      </div>
                    </div>
                    <div className="card-body">
                      <div className="row3">
                        {[
                          ["Total Pieces", formatCompactNumber(workforceTotals.totalPieces)],
                          ["Pass Pieces", formatCompactNumber(workforceTotals.passPieces)],
                          ["OOT Pieces", formatCompactNumber(workforceTotals.ootPieces)],
                          ["Corrections", formatCompactNumber(workforceTotals.correctionEvents)],
                          ["Records", formatCompactNumber(workforceTotals.recordsSubmitted)],
                          [
                            "Active Operators",
                            formatCompactNumber(workforceTotals.activeOperators)
                          ],
                          ["Jobs Observed", formatCompactNumber(workforceTotals.jobsObserved)],
                          [
                            "Connector Runs",
                            formatCompactNumber(workforceTotals.connectorTotalRuns)
                          ],
                          [
                            "Connector Failures",
                            formatCompactNumber(workforceTotals.connectorFailedRuns)
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
                                fontSize: "1.15rem",
                                color: "var(--text)"
                              }}
                            >
                              {value}
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="row3 mt1">
                        {[
                          ["First Pass Yield", formatPercent(workforceRates.firstPassYield)],
                          ["OOT Rate", formatPercent(workforceRates.ootRate)],
                          ["Correction Rate", formatPercent(workforceRates.correctionRate)],
                          [
                            "Avg Pieces / Record",
                            formatCompactNumber(workforceRates.avgPiecesPerRecord)
                          ],
                          [
                            "Connector Failure Rate",
                            formatPercent(workforceRates.connectorFailureRate)
                          ],
                          [
                            "Connector Replay Rate",
                            formatPercent(workforceRates.connectorReplayRate)
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
                                fontSize: "1.05rem",
                                color: "var(--accent2)"
                              }}
                            >
                              {value}
                            </div>
                          </div>
                        ))}
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
                      <div className="card-title">Production Mix</div>
                      <button className="btn btn-ghost btn-sm" onClick={exportWorkforceSummary}>
                        Export Visible CSV
                      </button>
                    </div>
                    <div className="card-body">
                      <div style={{ display: "grid", gap: ".7rem" }}>
                        {chartBars.map((row) => (
                          <div
                            key={row.label}
                            style={{
                              display: "grid",
                              gridTemplateColumns: "120px 1fr 56px",
                              gap: ".6rem",
                              alignItems: "center"
                            }}
                          >
                            <div
                              className="section-label"
                              style={{ marginBottom: 0, color: "var(--muted)" }}
                            >
                              {row.label}
                            </div>
                            <div
                              style={{
                                height: "12px",
                                background: "var(--panel2)",
                                border: "1px solid var(--border2)",
                                borderRadius: "999px",
                                overflow: "hidden"
                              }}
                            >
                              <div
                                style={{
                                  width: `${(row.value / maxJobStatus) * 100}%`,
                                  height: "100%",
                                  background: row.tone
                                }}
                              />
                            </div>
                            <div
                              style={{
                                fontFamily: "var(--mono)",
                                fontSize: ".82rem",
                                textAlign: "right"
                              }}
                            >
                              {row.value}
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
                        <div className="card-title">By Operator</div>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={exportOperatorRows}
                          disabled={!operatorRows.length}
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
                                  operatorSortKey,
                                  setOperatorSortKey,
                                  setOperatorSortDir,
                                  "operator"
                                )
                              }
                              style={{ cursor: "pointer" }}
                            >
                              Operator {sortIcon(operatorSortKey, operatorSortDir, "operator")}
                            </th>
                            <th
                              onClick={() =>
                                toggleSort(
                                  operatorSortKey,
                                  setOperatorSortKey,
                                  setOperatorSortDir,
                                  "records"
                                )
                              }
                              style={{ cursor: "pointer" }}
                            >
                              Records {sortIcon(operatorSortKey, operatorSortDir, "records")}
                            </th>
                            <th
                              onClick={() =>
                                toggleSort(
                                  operatorSortKey,
                                  setOperatorSortKey,
                                  setOperatorSortDir,
                                  "pieces"
                                )
                              }
                              style={{ cursor: "pointer" }}
                            >
                              Pieces {sortIcon(operatorSortKey, operatorSortDir, "pieces")}
                            </th>
                            <th
                              onClick={() =>
                                toggleSort(
                                  operatorSortKey,
                                  setOperatorSortKey,
                                  setOperatorSortDir,
                                  "fpy"
                                )
                              }
                              style={{ cursor: "pointer" }}
                            >
                              FPY {sortIcon(operatorSortKey, operatorSortDir, "fpy")}
                            </th>
                            <th
                              onClick={() =>
                                toggleSort(
                                  operatorSortKey,
                                  setOperatorSortKey,
                                  setOperatorSortDir,
                                  "oot"
                                )
                              }
                              style={{ cursor: "pointer" }}
                            >
                              OOT {sortIcon(operatorSortKey, operatorSortDir, "oot")}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {pagedOperatorRows.length === 0 ? (
                            <tr>
                              <td colSpan={5}>
                                <div className="empty-state">No operator data.</div>
                              </td>
                            </tr>
                          ) : (
                            pagedOperatorRows.map((row) => (
                              <tr key={`${row.operatorUserId || row.operatorName}`}>
                                <td>{row.operatorName}</td>
                                <td className="mono">
                                  {formatCompactNumber(row.totals?.recordsSubmitted)}
                                </td>
                                <td className="mono">
                                  {formatCompactNumber(row.totals?.totalPieces)}
                                </td>
                                <td className="mono">{formatPercent(row.rates?.firstPassYield)}</td>
                                <td className="mono">{formatPercent(row.rates?.ootRate)}</td>
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
                          {sortedOperatorRows.length === 0
                            ? 0
                            : (safeOperatorPage - 1) * operatorPageSize + 1}
                          -
                          {Math.min(sortedOperatorRows.length, safeOperatorPage * operatorPageSize)}{" "}
                          of {sortedOperatorRows.length}
                        </div>
                        <div className="gap1">
                          <select
                            value={String(operatorPageSize)}
                            onChange={(e) =>
                              setOperatorPageSize(Math.max(1, Number(e.target.value) || 25))
                            }
                          >
                            <option value="25">25 / page</option>
                            <option value="50">50 / page</option>
                            <option value="100">100 / page</option>
                          </select>
                          <button
                            className="btn btn-ghost btn-sm"
                            disabled={safeOperatorPage <= 1}
                            onClick={() => setOperatorPage((p) => Math.max(1, p - 1))}
                          >
                            Prev
                          </button>
                          <span className="text-muted mono">
                            Page {safeOperatorPage}/{operatorTotalPages}
                          </span>
                          <button
                            className="btn btn-ghost btn-sm"
                            disabled={safeOperatorPage >= operatorTotalPages}
                            onClick={() =>
                              setOperatorPage((p) => Math.min(operatorTotalPages, p + 1))
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
                        <div className="card-title">By Work Center</div>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={exportWorkCenterRows}
                          disabled={!workCenterRows.length}
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
                                  workCenterSortKey,
                                  setWorkCenterSortKey,
                                  setWorkCenterSortDir,
                                  "workCenter"
                                )
                              }
                              style={{ cursor: "pointer" }}
                            >
                              Work Center{" "}
                              {sortIcon(workCenterSortKey, workCenterSortDir, "workCenter")}
                            </th>
                            <th
                              onClick={() =>
                                toggleSort(
                                  workCenterSortKey,
                                  setWorkCenterSortKey,
                                  setWorkCenterSortDir,
                                  "records"
                                )
                              }
                              style={{ cursor: "pointer" }}
                            >
                              Records {sortIcon(workCenterSortKey, workCenterSortDir, "records")}
                            </th>
                            <th
                              onClick={() =>
                                toggleSort(
                                  workCenterSortKey,
                                  setWorkCenterSortKey,
                                  setWorkCenterSortDir,
                                  "pieces"
                                )
                              }
                              style={{ cursor: "pointer" }}
                            >
                              Pieces {sortIcon(workCenterSortKey, workCenterSortDir, "pieces")}
                            </th>
                            <th
                              onClick={() =>
                                toggleSort(
                                  workCenterSortKey,
                                  setWorkCenterSortKey,
                                  setWorkCenterSortDir,
                                  "fpy"
                                )
                              }
                              style={{ cursor: "pointer" }}
                            >
                              FPY {sortIcon(workCenterSortKey, workCenterSortDir, "fpy")}
                            </th>
                            <th
                              onClick={() =>
                                toggleSort(
                                  workCenterSortKey,
                                  setWorkCenterSortKey,
                                  setWorkCenterSortDir,
                                  "oot"
                                )
                              }
                              style={{ cursor: "pointer" }}
                            >
                              OOT {sortIcon(workCenterSortKey, workCenterSortDir, "oot")}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {pagedWorkCenterRows.length === 0 ? (
                            <tr>
                              <td colSpan={5}>
                                <div className="empty-state">No work center data.</div>
                              </td>
                            </tr>
                          ) : (
                            pagedWorkCenterRows.map((row) => (
                              <tr key={String(row.workCenterId)}>
                                <td>{row.workCenterId}</td>
                                <td className="mono">
                                  {formatCompactNumber(row.totals?.recordsSubmitted)}
                                </td>
                                <td className="mono">
                                  {formatCompactNumber(row.totals?.totalPieces)}
                                </td>
                                <td className="mono">{formatPercent(row.rates?.firstPassYield)}</td>
                                <td className="mono">{formatPercent(row.rates?.ootRate)}</td>
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
                          {sortedWorkCenterRows.length === 0
                            ? 0
                            : (safeWorkCenterPage - 1) * workCenterPageSize + 1}
                          -
                          {Math.min(
                            sortedWorkCenterRows.length,
                            safeWorkCenterPage * workCenterPageSize
                          )}{" "}
                          of {sortedWorkCenterRows.length}
                        </div>
                        <div className="gap1">
                          <select
                            value={String(workCenterPageSize)}
                            onChange={(e) =>
                              setWorkCenterPageSize(Math.max(1, Number(e.target.value) || 25))
                            }
                          >
                            <option value="25">25 / page</option>
                            <option value="50">50 / page</option>
                            <option value="100">100 / page</option>
                          </select>
                          <button
                            className="btn btn-ghost btn-sm"
                            disabled={safeWorkCenterPage <= 1}
                            onClick={() => setWorkCenterPage((p) => Math.max(1, p - 1))}
                          >
                            Prev
                          </button>
                          <span className="text-muted mono">
                            Page {safeWorkCenterPage}/{workCenterTotalPages}
                          </span>
                          <button
                            className="btn btn-ghost btn-sm"
                            disabled={safeWorkCenterPage >= workCenterTotalPages}
                            onClick={() =>
                              setWorkCenterPage((p) => Math.min(workCenterTotalPages, p + 1))
                            }
                          >
                            Next
                          </button>
                        </div>
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
                      <div className="card-title">By Job and Trend</div>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={exportJobRows}
                        disabled={!jobRows.length}
                      >
                        Export Job CSV
                      </button>
                    </div>
                    <div className="card-body">
                      <div className="row2">
                        <div>
                          <table className="data-table">
                            <thead>
                              <tr>
                                <th
                                  onClick={() =>
                                    toggleSort(jobSortKey, setJobSortKey, setJobSortDir, "job")
                                  }
                                  style={{ cursor: "pointer" }}
                                >
                                  Job {sortIcon(jobSortKey, jobSortDir, "job")}
                                </th>
                                <th
                                  onClick={() =>
                                    toggleSort(jobSortKey, setJobSortKey, setJobSortDir, "part")
                                  }
                                  style={{ cursor: "pointer" }}
                                >
                                  Part {sortIcon(jobSortKey, jobSortDir, "part")}
                                </th>
                                <th
                                  onClick={() =>
                                    toggleSort(jobSortKey, setJobSortKey, setJobSortDir, "pieces")
                                  }
                                  style={{ cursor: "pointer" }}
                                >
                                  Pieces {sortIcon(jobSortKey, jobSortDir, "pieces")}
                                </th>
                                <th
                                  onClick={() =>
                                    toggleSort(jobSortKey, setJobSortKey, setJobSortDir, "fpy")
                                  }
                                  style={{ cursor: "pointer" }}
                                >
                                  FPY {sortIcon(jobSortKey, jobSortDir, "fpy")}
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {pagedJobRows.length === 0 ? (
                                <tr>
                                  <td colSpan={4}>
                                    <div className="empty-state">No job data.</div>
                                  </td>
                                </tr>
                              ) : (
                                pagedJobRows.map((row) => (
                                  <tr key={`${row.jobId}-${row.partId}`}>
                                    <td>{row.jobId}</td>
                                    <td>{row.partId}</td>
                                    <td className="mono">
                                      {formatCompactNumber(row.totals?.totalPieces)}
                                    </td>
                                    <td className="mono">
                                      {formatPercent(row.rates?.firstPassYield)}
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
                              paddingLeft: 0,
                              paddingRight: 0,
                              paddingBottom: 0,
                              flexWrap: "wrap"
                            }}
                          >
                            <div className="text-muted">
                              Showing{" "}
                              {sortedJobRows.length === 0 ? 0 : (safeJobPage - 1) * jobPageSize + 1}
                              -{Math.min(sortedJobRows.length, safeJobPage * jobPageSize)} of{" "}
                              {sortedJobRows.length}
                            </div>
                            <div className="gap1">
                              <select
                                value={String(jobPageSize)}
                                onChange={(e) =>
                                  setJobPageSize(Math.max(1, Number(e.target.value) || 25))
                                }
                              >
                                <option value="25">25 / page</option>
                                <option value="50">50 / page</option>
                                <option value="100">100 / page</option>
                              </select>
                              <button
                                className="btn btn-ghost btn-sm"
                                disabled={safeJobPage <= 1}
                                onClick={() => setJobPage((p) => Math.max(1, p - 1))}
                              >
                                Prev
                              </button>
                              <span className="text-muted mono">
                                Page {safeJobPage}/{jobTotalPages}
                              </span>
                              <button
                                className="btn btn-ghost btn-sm"
                                disabled={safeJobPage >= jobTotalPages}
                                onClick={() => setJobPage((p) => Math.min(jobTotalPages, p + 1))}
                              >
                                Next
                              </button>
                            </div>
                          </div>
                        </div>
                        <div>
                          <div
                            className="card-head"
                            style={{
                              marginBottom: ".5rem",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between"
                            }}
                          >
                            <div className="card-title">Daily Trend</div>
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={exportTrendRows}
                              disabled={!dailyTrendRows.length}
                            >
                              Export Trend CSV
                            </button>
                          </div>
                          <div style={{ display: "grid", gap: ".55rem" }}>
                            {dailyTrendRows.length === 0 ? (
                              <div className="empty-state">No daily trend data.</div>
                            ) : (
                              dailyTrendRows.map((row) => (
                                <div
                                  key={row.day}
                                  style={{
                                    display: "grid",
                                    gridTemplateColumns: "88px 1fr 64px",
                                    gap: ".5rem",
                                    alignItems: "center"
                                  }}
                                >
                                  <div className="mono" style={{ fontSize: ".72rem" }}>
                                    {row.day}
                                  </div>
                                  <div
                                    style={{
                                      height: "10px",
                                      background: "var(--panel2)",
                                      border: "1px solid var(--border2)",
                                      borderRadius: "999px",
                                      overflow: "hidden"
                                    }}
                                  >
                                    <div
                                      style={{
                                        width: `${(Number(row.totals?.totalPieces || 0) / maxDailyTrend) * 100}%`,
                                        height: "100%",
                                        background: "var(--accent)"
                                      }}
                                    />
                                  </div>
                                  <div
                                    className="mono"
                                    style={{ fontSize: ".78rem", textAlign: "right" }}
                                  >
                                    {formatCompactNumber(row.totals?.totalPieces)}
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          ) : (
            <AdminAnalyticsSpc
              spcFilters={spcFilters}
              setSpcFilters={setSpcFilters}
              spcState={spcState}
              spcRuleSortKey={spcRuleSortKey}
              setSpcRuleSortKey={setSpcRuleSortKey}
              spcRuleSortDir={spcRuleSortDir}
              setSpcRuleSortDir={setSpcRuleSortDir}
              spcRulePageSize={spcRulePageSize}
              setSpcRulePageSize={setSpcRulePageSize}
              spcRulePage={spcRulePage}
              setSpcRulePage={setSpcRulePage}
              spcPointSortKey={spcPointSortKey}
              setSpcPointSortKey={setSpcPointSortKey}
              spcPointSortDir={spcPointSortDir}
              setSpcPointSortDir={setSpcPointSortDir}
              spcPointPageSize={spcPointPageSize}
              setSpcPointPageSize={setSpcPointPageSize}
              spcPointPage={spcPointPage}
              setSpcPointPage={setSpcPointPage}
              loadSpc={loadSpc}
              exportSpcSummary={exportSpcSummary}
              exportRuleFindings={exportRuleFindings}
              exportSpcPoints={exportSpcPoints}
              spc={spc}
              spcCharacteristic={spcCharacteristic}
              spcStatistics={spcStatistics}
              spcRuleFindings={spcRuleFindings}
              spcPoints={spcPoints}
              spcRuleTotalPages={spcRuleTotalPages}
              spcPointTotalPages={spcPointTotalPages}
              pagedSpcRuleFindings={pagedSpcRuleFindings}
              pagedSpcPoints={pagedSpcPoints}
              safeSpcRulePage={safeSpcRulePage}
              safeSpcPointPage={safeSpcPointPage}
              sortedSpcRuleFindings={sortedSpcRuleFindings}
              sortedSpcPoints={sortedSpcPoints}
              toggleSort={toggleSort}
              sortIcon={sortIcon}
              dimensions={dimensions}
              currentDimension={currentDimension}
              tab={tab}
            />
          )}
        </div>
      </div>
    </div>
  );
}

