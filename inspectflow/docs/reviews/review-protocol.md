# Code Review Protocol

## Purpose
This protocol governs independent code reviews of the InspectFlow codebase. Reviews surface actionable findings, present them for owner approval, and integrate accepted items into the tracked backlog via the standard intake process.

---

## Review Modes

| Mode | When to Use | Scope |
|------|------------|-------|
| **Full** | First ever session, or explicitly requested at a major release gate | Entire codebase |
| **Delta** | Default after the initial review; run after any significant sprint or wave | Files changed since last review commit (via `npm run review:delta`) |
| **Targeted** | Pre-release hardening, high-risk area focus | Specific module, stream, or file list |

---

## Six Review Lenses

Every session applies all six lenses to every file in scope. No lens may be skipped.

| # | Lens | Focus Areas |
|---|------|-------------|
| 1 | **Security** | OWASP top-10, auth gaps, injection vectors (SQL/cmd/XSS), exposed secrets, insecure defaults |
| 2 | **Architecture** | Contract adherence, coupling, separation of concerns, stream alignment, boundary violations |
| 3 | **Code Quality** | Duplication, dead code, complexity, naming consistency, magic values |
| 4 | **Test Coverage** | Untested paths, missing edge cases, flaky or weak assertions, test–code drift |
| 5 | **Performance** | N+1 queries, missing DB indexes, unbounded result sets, synchronous hot paths |
| 6 | **Documentation** | Stale or missing docs, undocumented contracts, unclear intent, drift from stream contracts |

---

## Severity and Priority Scoring

Severity determines the priority score band assigned when a finding is promoted to a BL-### item. Use the existing `backlog-framework.md` formula (customer risk + revenue + dependency unlock + delivery confidence) to select a score within the band.

| Severity | Priority Score Band | Typical Examples |
|----------|--------------------|-|
| **Critical** | 85–100 | Security vulnerability, data loss risk, broken auth contract |
| **Major** | 65–84 | Significant coupling, broken test gate, missing stream contract |
| **Minor** | 35–64 | Quality debt, weak test, stale documentation |
| **Suggestion** | 0–34 | Naming improvement, polish, optional refactor |

---

## Finding Format

Each finding receives a temporary `RV-###` ID for the duration of the review session. The counter restarts at `RV-001` per session.

```
| RV-### | Severity | Lens | File(s):line | Finding | Recommendation | Stream | Disposition |
```

**Stream values**: `PLAT` | `OPS` | `QUAL` | `INT` | `ANA` | `COMM`

**Disposition values** (lifecycle):
1. `Pending` — awaiting owner review
2. `Approved → BL-###` — accepted; promoted via intake protocol
3. `Deferred` — valid but not now; re-evaluate next cycle
4. `Rejected` — not actionable, duplicate, or out of scope

---

## Session File Convention

Each session produces one file under `docs/reviews/sessions/`:

**Filename**: `YYYY-MM-DD-[mode]-[scope]-findings.md`

**Example**: `2026-03-26-full-all-modules-findings.md`

**Session file structure**:
```markdown
# Review Session: [date] — [mode] — [scope]

## Session Header
- Date: YYYY-MM-DD
- Mode: Full | Delta | Targeted
- Scope: [description or file list]
- Commit range: [base hash]..[HEAD hash]
- Reviewer: Independent Reviewer

## Lens Checklist
- [ ] Security
- [ ] Architecture
- [ ] Code Quality
- [ ] Test Coverage
- [ ] Performance
- [ ] Documentation

## Findings

| RV-### | Severity | Lens | File(s):line | Finding | Recommendation | Stream | Disposition |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ... |

## Disposition Summary
- Total findings: N
- Approved (→ BL-###): N
- Deferred: N
- Rejected: N
```

---

## Approval Workflow

1. Reviewer conducts session and writes all findings to the session file.
2. Findings are presented to the owner grouped by severity (Critical → Suggestion).
3. Owner approves, defers, or rejects each finding (may batch by severity tier).
4. For each **Approved** finding:
   - Run duplicate scan against `backlog.md`, `STATUS.md`, and `WORKLOG.md`.
   - Apply realism gate per `backlog-intake-protocol.md`.
   - Assign next available `BL-###`, add to `backlog.md` with full metadata.
   - Append intake decision to `WORKLOG.md` referencing the `RV-###` source.
   - Update the finding row disposition to `Approved → BL-###`.
5. Log the completed session in `docs/reviews/review-log.md` with HEAD commit hash.

---

## Cadence Recommendations

| Cadence | Trigger |
|---------|---------|
| **Full review** | Each major release gate (R1 → R2 → R3…), or on explicit request |
| **Delta review** | After any significant sprint, cycle, or wave of work |
| **Targeted review** | Before a release when a specific area is flagged high-risk |

---

## Per-Session Quality Checklist

Before closing a session, confirm:
- [ ] All six lenses applied to every file in scope
- [ ] Both frontend and backend checked for the same vulnerability class (where applicable)
- [ ] Each finding references the relevant stream contract (e.g., `PLAT-AUTH-v1`)
- [ ] No finding is vague — every recommendation is concrete and actionable
- [ ] Session logged in `review-log.md` with commit hash

---

## Canonical Sources (Check During Intake)
- `docs/backlog.md`
- `STATUS.md`
- `WORKLOG.md`
- `docs/backlog-intake-protocol.md`
- `docs/backlog-framework.md`
