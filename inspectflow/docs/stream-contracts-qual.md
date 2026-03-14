# Stream Contract: QUAL (Team Helix)

## Scope
Quality and traceability: correction workflows, chain-of-events reporting, export packs, first-article support, and quality risk workflows.

## Provides
- `QUAL-TRACE-v1`: part/job/lot/piece trace query contract.
- `QUAL-EXPORT-v1`: CSV and starter AS9102 export contract.
- `QUAL-FAI-v2`: first-article workflow and export profile contract.

## Consumes
- `OPS-JOBFLOW-v1` for lifecycle context.
- `INT-INGEST-v1` for externally ingested measurements.
- `PLAT-AUTH-v1` for role-safe correction authority.

## Versioning Policy
- Export schema changes require explicit versioned contract updates.

## Done Criteria
- Export outputs reproducible and validated by acceptance fixtures.
- Correction lineage visible and auditable.
- Trace queries cover full lifecycle chain.
