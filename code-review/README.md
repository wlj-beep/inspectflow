# InspectFlow Code Review Agents

Automated AI code review for the InspectFlow project. Three specialized agents run in
parallel against changed source files and produce a consolidated markdown report.

## Agents

| Agent | Focus |
|-------|-------|
| **Security** | OWASP Top 10, auth gaps, injection, secrets, misconfigurations |
| **Code Quality** | Complexity, duplication, error handling, dead code, magic values |
| **Architecture** | Stream boundary violations, route bloat, coupling, cohesion |

## How to Trigger (GitHub Actions)

1. Open **Actions** in the GitHub repository
2. Select **AI Code Review** from the workflow list
3. Click **Run workflow**
4. Enter the inputs:
   - **PR number**: The PR number you want reviewed (e.g. `47`)
   - **Base SHA**: The base commit SHA (find it in the PR's "Commits" tab — the first commit's parent, or the merge-base)
   - **Head SHA**: The head commit SHA (the latest commit on the PR branch)
5. Click **Run workflow**
6. When the run completes, open the run and download the artifact named `code-review-pr-{number}`
7. The artifact contains a markdown report file

## How to Find the SHAs

In the GitHub PR:
- **Base SHA**: Go to the PR → Commits tab → right-click the earliest commit → "Copy SHA" — or use the branch merge-base: `git merge-base main <your-branch>`
- **Head SHA**: The latest commit on the PR branch — shown at the top of the PR commits list

Or via CLI:
```bash
git merge-base main your-branch-name   # base SHA
git rev-parse your-branch-name         # head SHA
```

## Running Locally

```bash
# 1. Install dependencies (first time only)
cd code-review
npm install

# 2. Copy .env.example and fill in your API key
cp .env.example .env
# Edit .env: set ANTHROPIC_API_KEY and REPO_ROOT

# 3. Set diff targets and run
export REPO_ROOT="$(pwd)/.."
export BASE_REF="$(git -C .. merge-base main HEAD)"
export HEAD_REF="HEAD"
export PR_NUMBER="local"
export ANTHROPIC_API_KEY="sk-ant-..."

node orchestrator.js incremental
```

The report is saved to `code-review/reports/pr-{PR_NUMBER}-{timestamp}.md`.

## Report Structure

```
# InspectFlow Code Review — PR #47
## Files Reviewed
## Executive Summary    ← severity counts per agent
## Security Review      ← full agent output
## Code Quality Review
## Architecture Review
## Review Metadata      ← token usage, cost estimate, model
```

## Configuration

### Adding `ANTHROPIC_API_KEY` as a GitHub Secret (one-time setup)
1. Go to the repository **Settings** → **Secrets and variables** → **Actions**
2. Click **New repository secret**
3. Name: `ANTHROPIC_API_KEY`, Value: your Anthropic API key
4. Click **Add secret**

### Modifying Agent Behavior
- Edit the system prompts in `prompts/security.md`, `prompts/quality.md`, `prompts/architecture.md`
- Edit shared project context in `prompts/context.md` when the codebase changes significantly
- Adjust file inclusion/exclusion rules in `lib/file-collector.js`

## File Structure

```
code-review/
  orchestrator.js          Entry point
  agents/
    security-agent.js      Security reviewer
    quality-agent.js       Code quality reviewer
    architecture-agent.js  Architecture reviewer
  prompts/
    context.md             Shared project context (injected into all agents)
    security.md            Security agent system prompt
    quality.md             Quality agent system prompt
    architecture.md        Architecture agent system prompt
  lib/
    file-collector.js      Collects changed files via git diff
    chunker.js             Splits large files at logical boundaries
    report-builder.js      Aggregates agent outputs into one report
    token-budget.js        Retry logic and token usage tracking
  reports/                 Output directory (gitignored, populated at runtime)
```
