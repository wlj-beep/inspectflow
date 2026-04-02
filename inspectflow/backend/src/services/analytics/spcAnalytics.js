import { query } from "../../db.js";

const DEFAULT_LOOKBACK_DAYS = 30;
const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;
const CONTROL_SIGMA = 3;
const CENTERLINE_RUN_LENGTH = 7;
const TREND_RUN_LENGTH = 6;

function toPositiveInt(value, fallback) {
  const n = Number(value);
  if (Number.isInteger(n) && n > 0) return n;
  return fallback;
}

function clampLimit(value) {
  const safe = toPositiveInt(value, DEFAULT_LIMIT);
  return Math.min(safe, MAX_LIMIT);
}

function toOptionalIso(value, fieldName) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`invalid_${fieldName}`);
  }
  return date.toISOString();
}

function defaultWindow() {
  const end = new Date();
  const start = new Date(end.getTime() - DEFAULT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  return {
    dateFrom: start.toISOString(),
    dateTo: end.toISOString()
  };
}

function buildWindow({ dateFrom, dateTo }) {
  const normalizedFrom = toOptionalIso(dateFrom, "date_from");
  const normalizedTo = toOptionalIso(dateTo, "date_to");
  if (normalizedFrom && normalizedTo && normalizedFrom > normalizedTo) {
    throw new Error("invalid_window_range");
  }
  if (!normalizedFrom && !normalizedTo) {
    return defaultWindow();
  }
  return {
    dateFrom: normalizedFrom || defaultWindow().dateFrom,
    dateTo: normalizedTo || new Date().toISOString()
  };
}

function round(value, digits = 6) {
  if (value === null || value === undefined) return null;
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

function computeStats(values) {
  const count = values.length;
  if (!count) {
    return {
      count: 0,
      mean: null,
      stddev: null,
      lcl: null,
      ucl: null,
      min: null,
      max: null
    };
  }

  const sum = values.reduce((acc, value) => acc + value, 0);
  const mean = sum / count;
  let stddev = null;
  if (count > 1) {
    const variance =
      values.reduce((acc, value) => acc + Math.pow(value - mean, 2), 0) / (count - 1);
    stddev = Math.sqrt(variance);
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const lcl = stddev ? mean - CONTROL_SIGMA * stddev : null;
  const ucl = stddev ? mean + CONTROL_SIGMA * stddev : null;

  return {
    count,
    mean: round(mean),
    stddev: round(stddev),
    lcl: round(lcl),
    ucl: round(ucl),
    min: round(min),
    max: round(max)
  };
}

function parseDimensionId(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function isNumericValue(value) {
  return /^[-+]?[0-9]*\.?[0-9]+$/.test(String(value || "").trim());
}

function buildTracePath(row) {
  const params = new URLSearchParams();
  if (row.jobId) params.set("jobId", String(row.jobId));
  if (row.partId) params.set("partId", String(row.partId));
  if (row.lot) params.set("lot", String(row.lot));
  if (Number.isInteger(row.pieceNumber) && row.pieceNumber > 0) {
    params.set("pieceNumber", String(row.pieceNumber));
  }
  const queryString = params.toString();
  return queryString ? `/api/records/trace?${queryString}` : "/api/records/trace";
}

function buildMeasurementReference(row) {
  return {
    measurementKey: `${row.recordId}:${row.dimensionId}:${row.pieceNumber}`,
    recordId: row.recordId,
    dimensionId: row.dimensionId,
    pieceNumber: row.pieceNumber,
    jobId: row.jobId,
    partId: row.partId,
    operationId: row.operationId,
    lot: row.lot,
    operatorUserId: row.operatorUserId,
    eventAt: row.eventAt,
    value: row.value,
    rawValue: row.rawValue,
    isOot: row.isOot,
    recordPath: `/api/records/${row.recordId}`,
    tracePath: buildTracePath(row)
  };
}

function buildSignalEvent({ type, ruleId, label, severity, points }) {
  const pointIndexes = points.map((point) => point.index);
  return {
    id: `${type}:${pointIndexes[0]}:${pointIndexes[pointIndexes.length - 1]}`,
    type,
    ruleId,
    label,
    severity,
    pointIndexes,
    measurements: points.map((point) => point.trace)
  };
}

function detectControlLimitSignals(series, stats) {
  if (stats.lcl === null || stats.ucl === null) return [];
  return series
    .filter((point) => point.value < stats.lcl || point.value > stats.ucl)
    .map((point) =>
      buildSignalEvent({
        type: "beyond_control_limits",
        ruleId: "WE1",
        label: "Point beyond control limits",
        severity: "critical",
        points: [point]
      })
    );
}

function detectCenterlineRunSignals(series, stats) {
  if (stats.mean === null) return [];

  const signals = [];
  let startIndex = 0;
  let direction = 0;

  const flush = (endIndexExclusive) => {
    const length = endIndexExclusive - startIndex;
    if (!direction || length < CENTERLINE_RUN_LENGTH) return;
    const points = series.slice(startIndex, endIndexExclusive);
    signals.push(
      buildSignalEvent({
        type: direction > 0 ? "run_above_centerline" : "run_below_centerline",
        ruleId: direction > 0 ? "WE4_ABOVE" : "WE4_BELOW",
        label: direction > 0 ? "Run above centerline" : "Run below centerline",
        severity: "warning",
        points
      })
    );
  };

  for (let index = 0; index < series.length; index += 1) {
    const point = series[index];
    const nextDirection = point.value > stats.mean ? 1 : point.value < stats.mean ? -1 : 0;
    if (index === 0) {
      direction = nextDirection;
      continue;
    }
    if (!nextDirection || nextDirection !== direction) {
      flush(index);
      startIndex = index;
      direction = nextDirection;
    }
  }
  flush(series.length);

  return signals;
}

function detectTrendSignals(series) {
  const signals = [];
  if (series.length < TREND_RUN_LENGTH) return signals;

  let startIndex = 0;
  let direction = 0;

  const flush = (endIndexExclusive) => {
    const length = endIndexExclusive - startIndex;
    if (!direction || length < TREND_RUN_LENGTH) return;
    const points = series.slice(startIndex, endIndexExclusive);
    signals.push(
      buildSignalEvent({
        type: direction > 0 ? "trend_up" : "trend_down",
        ruleId: direction > 0 ? "TREND_UP" : "TREND_DOWN",
        label: direction > 0 ? "Upward trend" : "Downward trend",
        severity: "warning",
        points
      })
    );
  };

  for (let index = 1; index < series.length; index += 1) {
    const previous = series[index - 1];
    const current = series[index];
    const nextDirection = current.value > previous.value ? 1 : current.value < previous.value ? -1 : 0;

    if (index === 1) {
      direction = nextDirection;
      continue;
    }

    if (!nextDirection || nextDirection !== direction) {
      flush(index);
      startIndex = nextDirection ? index - 1 : index;
      direction = nextDirection;
    }
  }
  flush(series.length);

  return signals;
}

export async function getSpcControlChart({
  dimensionId,
  dateFrom = null,
  dateTo = null,
  limit = DEFAULT_LIMIT
} = {}) {
  const id = parseDimensionId(dimensionId);
  if (!id) throw new Error("invalid_dimension_id");

  const window = buildWindow({ dateFrom, dateTo });
  const safeLimit = clampLimit(limit);

  const dimensionRes = await query(
    `SELECT id, name, nominal, tol_plus, tol_minus, unit, sampling, sampling_interval, input_mode, operation_id
     FROM dimensions
     WHERE id=$1`,
    [id]
  );
  const dimension = dimensionRes.rows[0];
  if (!dimension) throw new Error("dimension_not_found");

  const { rows } = await query(
    `SELECT
       rv.record_id,
       rv.dimension_id,
       rv.piece_number,
       rv.value,
       rv.is_oot,
       r.timestamp AS event_at,
       r.job_id,
       r.part_id,
       r.operation_id,
       r.lot,
       r.operator_user_id
     FROM record_values rv
     JOIN records r ON r.id=rv.record_id
     WHERE rv.dimension_id=$1
       AND r.timestamp >= $2
       AND r.timestamp <= $3
       AND rv.value ~ '^[+-]?[0-9]*\\.?[0-9]+$'
     ORDER BY r.timestamp DESC, rv.record_id DESC, rv.piece_number ASC
     LIMIT $4`,
    [id, window.dateFrom, window.dateTo, safeLimit]
  );

  const parsed = rows
    .map((row) => {
      const rawValue = String(row.value || "").trim();
      if (!isNumericValue(rawValue)) return null;
      const numericValue = Number(rawValue);
      if (!Number.isFinite(numericValue)) return null;
      return {
        recordId: Number(row.record_id),
        dimensionId: Number(row.dimension_id),
        pieceNumber: Number(row.piece_number),
        value: numericValue,
        rawValue,
        isOot: Boolean(row.is_oot),
        eventAt: row.event_at ? new Date(row.event_at).toISOString() : null,
        jobId: row.job_id,
        partId: row.part_id,
        operationId: row.operation_id ? Number(row.operation_id) : null,
        lot: row.lot,
        operatorUserId: row.operator_user_id ? Number(row.operator_user_id) : null
      };
    })
    .filter(Boolean);

  const values = parsed.map((row) => row.value);
  const stats = computeStats(values);

  const series = parsed
    .slice()
    .sort((left, right) => String(left.eventAt).localeCompare(String(right.eventAt)))
    .map((row, index) => {
      const outOfControl =
        stats.lcl !== null && stats.ucl !== null
          ? row.value < stats.lcl || row.value > stats.ucl
          : false;
      return {
        index,
        recordId: row.recordId,
        dimensionId: row.dimensionId,
        pieceNumber: row.pieceNumber,
        value: row.value,
        eventAt: row.eventAt,
        isOot: row.isOot,
        outOfControl,
        trace: buildMeasurementReference(row)
      };
    });

  const signalEvents = [
    ...detectControlLimitSignals(series, stats),
    ...detectCenterlineRunSignals(series, stats),
    ...detectTrendSignals(series)
  ];

  const signalIdsByIndex = new Map();
  for (const event of signalEvents) {
    for (const pointIndex of event.pointIndexes) {
      const ids = signalIdsByIndex.get(pointIndex) || [];
      ids.push(event.id);
      signalIdsByIndex.set(pointIndex, ids);
    }
  }

  const seriesWithSignals = series.map((point) => ({
    index: point.index,
    recordId: point.recordId,
    dimensionId: point.dimensionId,
    pieceNumber: point.pieceNumber,
    value: point.value,
    eventAt: point.eventAt,
    isOot: point.isOot,
    outOfControl: point.outOfControl,
    signalIds: signalIdsByIndex.get(point.index) || [],
    trace: point.trace
  }));

  const signalCountsByType = signalEvents.reduce((acc, event) => {
    acc[event.type] = (acc[event.type] || 0) + 1;
    return acc;
  }, {});

  const outOfControlPoints = seriesWithSignals.filter((point) => point.outOfControl);

  return {
    contractId: "ANA-SPC-v1",
    chartId: "control_chart_xbar_v1",
    window,
    dimension: {
      id: Number(dimension.id),
      name: dimension.name,
      nominal: Number(dimension.nominal),
      tolPlus: Number(dimension.tol_plus),
      tolMinus: Number(dimension.tol_minus),
      unit: dimension.unit,
      sampling: dimension.sampling,
      samplingInterval: dimension.sampling_interval,
      inputMode: dimension.input_mode,
      operationId: Number(dimension.operation_id)
    },
    stats,
    signals: {
      summary: {
        totalEvents: signalEvents.length,
        byType: signalCountsByType
      },
      outOfControlCount: outOfControlPoints.length,
      outOfControlPoints,
      events: signalEvents
    },
    series: seriesWithSignals,
    drilldown: {
      measurements: parsed.map(buildMeasurementReference)
    }
  };
}
