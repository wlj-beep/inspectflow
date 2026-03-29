# Large Untracked Artifact Detector

Use the detector before review or context-packaging runs when you want to catch local files that were created but not added to git.

## Command

```bash
npm run context:untracked:check -- --threshold-kb 200
```

## Contract

- Scans `git ls-files --others --exclude-standard` from the current repository.
- Emits JSON with `counts`, `byPrefix`, `largeFiles`, and `warnings`.
- Exits with a non-zero status when any untracked artifact exceeds the configured threshold.
- Accepts `--threshold-kb`, `--threshold`, or `-t` with a positive numeric value.

## Practical Use

- Keep the default `200 KB` threshold for routine review gates.
- Lower the threshold when you are investigating accidental binary drops or generated artifacts.
- Run from the repository root so prefix summaries stay stable and the detector sees the same ignore rules as the rest of the workspace.
