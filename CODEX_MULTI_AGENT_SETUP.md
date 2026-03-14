# Codex Multi-Agent Setup and Usage

This runbook enables Codex experimental multi-agent mode and gives reusable commands for this workspace.

## 1) Enable multi-agent in config

Edit `~/.codex/config.toml` and ensure this block exists:

```toml
[features]
multi_agent = true
```

If you already have a `[features]` block, add only `multi_agent = true` under it.

## 2) Restart Codex

Config changes are loaded on startup. Fully quit and relaunch Codex after enabling the feature.

## 3) Confirm feature in session

In a new Codex session, run:

```text
/experimental
```

Then check agent controls:

```text
/agent
```

You should see multi-agent commands available.

## 4) Core multi-agent workflow

Use one controller prompt that clearly assigns independent tracks:

```text
You are the controller. Spawn parallel sub-agents and wait for all.

Track A (Backend): inspect backend API changes for regressions, list top 3 risks with file paths and line refs.
Track B (Frontend): inspect frontend UI flows for breakages, list top 3 risks with file paths and line refs.
Track C (Tests): run and summarize failing tests only, include likely root cause per failure.

Return one merged report ordered by severity.
```

## 5) CSV/batch workflow pattern

For repetitive checks over multiple items, use the `spawn_agents_on_csv` + `wait` flow from the Codex docs.

Recommended format:
- one row = one isolated unit of work
- include stable IDs in the CSV
- keep agent task deterministic and output structured

Example task framing:

```text
For each CSV row, evaluate the item and return JSON with: id, status, findings, next_action.
```

## 6) Operational guardrails

- Keep sub-agent scopes independent to reduce merge conflicts.
- Require each sub-agent to include evidence (`file`, `line`, command output excerpt).
- Ask controller to dedupe overlapping findings before final merge.
- Prefer short, explicit output schemas for reliable consolidation.

## 7) Troubleshooting

- If `/agent` doesn’t show expected controls, verify `~/.codex/config.toml` and restart Codex.
- If sub-agents overlap work, tighten prompts with explicit ownership boundaries.
- If results are noisy, force a schema and severity rubric in the controller prompt.
