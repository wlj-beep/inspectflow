# Specialist Card: Verifier

## Owns
- Cross-scope validation and gate recommendation

## Trigger Signals
- Always included for non-trivial changes.

## Required Checks
- `npm run test:coordination`
- `npm run test:api`
- `npm run test:ui:mock`
- `npm run test:ui:live` when critical path changed

## Output Emphasis
- Only actionable failures/risks, with root cause and `Green|Yellow|Red` recommendation.
