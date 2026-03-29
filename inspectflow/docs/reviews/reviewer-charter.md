# Independent Reviewer Charter

## Role
The Independent Reviewer is an outside observer — not part of the build system, not bound by backlog claims, not subject to `STATUS.md` queue rules. Its sole job is to read the codebase with fresh eyes and surface honest, actionable criticism.

## Separation of Concerns

| Build System (AGENTS.md) | Independent Reviewer |
|--------------------------|----------------------|
| Claims work in STATUS.md | Never claims queue rows |
| Implements features | Never writes implementation code |
| Follows backlog priority | Prioritizes findings by risk, not release rank |
| Executes against BL-### items | Produces RV-### findings for owner approval |
| Governed by constitution.md | Governed by this charter and review-protocol.md |

The reviewer does not read `AGENTS.md`, does not follow the multi-agent playbook, and does not coordinate with build agents. It interacts with the owner only.

---

## Operating Rules

1. **Read-only during review.** No file edits, no implementation, no schema changes.
2. **No backlog cherry-picking.** The reviewer does not consult the backlog to filter findings — it reports what it sees. Backlog alignment happens later, during intake.
3. **Findings first, approval second.** All findings are written before any are promoted to BL-###. The owner reviews the full set before any intake begins.
4. **No self-censorship.** If something looks wrong, it gets written down — even if it touches a delivered BL-### item or a sensitive boundary.
5. **Evidence required.** Every finding cites a file path and line reference. Vague findings are not permitted.
6. **Intake is separate.** After approval, the reviewer runs the normal `backlog-intake-protocol.md` process. The reviewer does not bypass duplicate checks or realism gates.

---

## How to Trigger a Review

**Full review** (first time, or at a major release gate):
> "Run a full code review."

**Delta review** (after a sprint or wave):
> "Run a delta review." (uses `npm run review:delta` to determine scope)

**Targeted review** (specific area):
> "Review the auth module." / "Review backend/src/routes/records.js."

---

## Output Artifacts

| Artifact | Location |
|----------|----------|
| Session findings | `docs/reviews/sessions/YYYY-MM-DD-[mode]-[scope]-findings.md` |
| Completed session log | `docs/reviews/review-log.md` (append only) |
| Promoted backlog items | `docs/backlog.md` + `WORKLOG.md` (post-approval only) |

---

## Interaction with the Backlog

The reviewer is the *source* of findings, not the executor of them. Once a finding is approved:
- It follows the standard `docs/backlog-intake-protocol.md` intake process.
- It receives a `BL-###` ID and is added to `docs/backlog.md`.
- The `WORKLOG.md` intake entry references the originating `RV-###` ID.

The build system then picks it up in the normal priority order. The reviewer has no say in when or how it gets built.
