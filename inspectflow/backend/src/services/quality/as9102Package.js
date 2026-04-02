function toFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function toPositiveInteger(value) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
}

function normalizeText(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function samplingPieceCount({ sampling, samplingInterval, qty }) {
  const total = toPositiveInteger(qty) || 0;
  if (!total) return 0;

  const pickByInterval = (interval) => {
    const safeInterval = toPositiveInteger(interval);
    if (!safeInterval) return 0;
    return Math.ceil(total / safeInterval);
  };

  switch (String(sampling || "").trim()) {
    case "first_last":
      return total > 1 ? 2 : total;
    case "first_middle_last":
      return total >= 3 ? 3 : total;
    case "every_5":
      return pickByInterval(5);
    case "every_10":
      return pickByInterval(10);
    case "100pct":
      return total;
    case "custom_interval":
      return pickByInterval(samplingInterval);
    default:
      return 0;
  }
}

function buildCharacteristicStatus({ measuredCount, failedCount, expectedPieceCount }) {
  if (failedCount > 0) return "failed";
  if (expectedPieceCount > 0 && measuredCount === 0) return "pending";
  if (expectedPieceCount > 0 && measuredCount < expectedPieceCount) return "partial";
  return "accepted";
}

function sortByDimensionId(left, right) {
  return Number(left.dimension_id || left.id || 0) - Number(right.dimension_id || right.id || 0);
}

export function buildAs9102Package({
  record,
  part,
  operation,
  inspector,
  stats,
  snapshots = [],
  values = [],
  tools = [],
  missingPieces = [],
  pieceComments = [],
  generatedAt,
  profileId
}) {
  const sortedSnapshots = [...snapshots].sort(sortByDimensionId);
  const valueRows = [...values].sort((left, right) => {
    const pieceDelta = Number(left.piece_number || 0) - Number(right.piece_number || 0);
    if (pieceDelta !== 0) return pieceDelta;
    return Number(left.dimension_id || left.dimensionId || 0) - Number(right.dimension_id || right.dimensionId || 0);
  });
  const toolRows = [...tools].sort((left, right) => {
    const dimensionDelta = Number(left.dimension_id || 0) - Number(right.dimension_id || 0);
    if (dimensionDelta !== 0) return dimensionDelta;
    return Number(left.tool_id || 0) - Number(right.tool_id || 0);
  });

  const pieceCommentByNumber = new Map(
    pieceComments.map((commentRow) => [
      Number(commentRow.piece_number),
      {
        pieceNumber: Number(commentRow.piece_number),
        comment: normalizeText(commentRow.comment),
        serialNumber: normalizeText(commentRow.serial_number),
        createdByUserId: commentRow.created_by_user_id ?? null,
        createdByUserName: normalizeText(commentRow.created_by_user_name),
        createdByRole: normalizeText(commentRow.created_by_role),
        createdAt: commentRow.created_at ?? null,
        updatedAt: commentRow.updated_at ?? null
      }
    ])
  );
  const missingByPiece = new Map(
    missingPieces.map((row) => [
      Number(row.piece_number),
      {
        pieceNumber: Number(row.piece_number),
        reason: normalizeText(row.reason),
        ncNum: normalizeText(row.nc_num),
        details: normalizeText(row.details)
      }
    ])
  );

  const valuesByDimension = new Map();
  for (const valueRow of valueRows) {
    const dimensionId = Number(valueRow.dimension_id || valueRow.dimensionId || 0);
    if (!valuesByDimension.has(dimensionId)) valuesByDimension.set(dimensionId, []);
    const pieceComment = pieceCommentByNumber.get(Number(valueRow.piece_number));
    valuesByDimension.get(dimensionId).push({
      pieceNumber: Number(valueRow.piece_number),
      value: String(valueRow.value ?? ""),
      isOot: Boolean(valueRow.is_oot),
      pieceComment: pieceComment?.comment || null,
      pieceSerialNumber: pieceComment?.serialNumber || null
    });
  }

  const toolsByDimension = new Map();
  for (const toolRow of toolRows) {
    const dimensionId = Number(toolRow.dimension_id || 0);
    if (!toolsByDimension.has(dimensionId)) toolsByDimension.set(dimensionId, []);
    toolsByDimension.get(dimensionId).push({
      toolId: Number(toolRow.tool_id),
      itNum: normalizeText(toolRow.it_num),
      name: normalizeText(toolRow.tool_name),
      type: normalizeText(toolRow.tool_type)
    });
  }

  const characteristicRows = sortedSnapshots.map((snapshot, index) => {
    const dimensionId = Number(snapshot.dimension_id || snapshot.id);
    const characteristicIndex = index + 1;
    const measurements = valuesByDimension.get(dimensionId) || [];
    const failedCount = measurements.filter((measurement) => measurement.isOot).length;
    const expectedPieceCount = samplingPieceCount({
      sampling: snapshot.sampling,
      samplingInterval: snapshot.sampling_interval,
      qty: record.qty
    });

    return {
      characteristicIndex,
      dimensionId,
      name: normalizeText(snapshot.name),
      balloonReference: {
        characteristicIndex,
        label: `B${characteristicIndex}`,
        source: "record_dimension_snapshot_order"
      },
      requirement: {
        nominal: toFiniteNumber(snapshot.nominal),
        tolPlus: toFiniteNumber(snapshot.tol_plus),
        tolMinus: toFiniteNumber(snapshot.tol_minus),
        unit: normalizeText(snapshot.unit)
      },
      sampling: {
        method: normalizeText(snapshot.sampling),
        interval: toPositiveInteger(snapshot.sampling_interval),
        inputMode: normalizeText(snapshot.input_mode) || "single",
        expectedPieceCount
      },
      measurementSummary: {
        measuredCount: measurements.length,
        failedCount,
        expectedPieceCount,
        status: buildCharacteristicStatus({
          measuredCount: measurements.length,
          failedCount,
          expectedPieceCount
        })
      },
      measurements,
      tools: toolsByDimension.get(dimensionId) || []
    };
  });

  const balloonReferences = characteristicRows.map((row) => ({
    characteristicIndex: row.characteristicIndex,
    dimensionId: row.dimensionId,
    characteristicName: row.name,
    label: row.balloonReference.label,
    source: row.balloonReference.source
  }));

  const tooling = [];
  for (const row of characteristicRows) {
    for (const tool of row.tools) {
      tooling.push({
        characteristicIndex: row.characteristicIndex,
        balloonLabel: row.balloonReference.label,
        dimensionId: row.dimensionId,
        characteristicName: row.name,
        ...tool
      });
    }
  }

  return {
    contractId: "QUAL-AS9102-PKG-v1",
    manifest: {
      recordId: record.id,
      profileId,
      generatedAt: generatedAt || null,
      inspector: {
        id: inspector?.id ?? null,
        name: normalizeText(inspector?.name),
        role: normalizeText(inspector?.role)
      }
    },
    forms: {
      form1: {
        partNumber: normalizeText(part?.id),
        partRevision: normalizeText(part?.revision),
        partDescription: normalizeText(part?.description),
        lot: normalizeText(record.lot),
        quantity: toPositiveInteger(record.qty),
        operationNumber: normalizeText(operation?.number),
        operationLabel: normalizeText(operation?.label)
      },
      form2: {
        toolingCount: tooling.length,
        tooling
      },
      form3: {
        characteristicCount: characteristicRows.length,
        measuredCount: Number(stats?.measured || 0),
        failedCount: Number(stats?.failed || 0),
        expectedMeasurements: Number(stats?.expectedMeasurements || 0),
        rows: characteristicRows
      }
    },
    summary: {
      measured: Number(stats?.measured || 0),
      failed: Number(stats?.failed || 0),
      expectedMeasurements: Number(stats?.expectedMeasurements || 0),
      passRate: typeof stats?.passRate === "number" ? stats.passRate : 0
    },
    balloonReferences: {
      total: balloonReferences.length,
      items: balloonReferences
    },
    characteristics: {
      total: characteristicRows.length,
      rows: characteristicRows
    },
    missingPieces: Array.from(missingByPiece.values()),
    pieceComments: Array.from(pieceCommentByNumber.values())
  };
}
