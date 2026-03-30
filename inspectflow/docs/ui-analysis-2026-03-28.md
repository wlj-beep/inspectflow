# UI Analysis (2026-03-28)

## Scope
- Frontend shell (`frontend/src/App.jsx`) and primary UI surface (`frontend/src/legacy/InspectFlowDemo.jsx`).
- Navigation, operator workflow, admin workflow, data tables, feedback mechanisms, accessibility, and performance posture.

## Current State Summary
- The UI is functionally rich but concentrated in a monolith (`InspectFlowDemo.jsx`, 4,353 lines), which slows delivery and increases regression risk.
- The app supports core workflows, but information hierarchy and interaction consistency are uneven across screens.
- Existing strengths: role-aware visibility, broad data operations coverage, and practical manufacturing vocabulary in UI labels.

## Findings By Category

### Ease Of Use
- Admin uses an overloaded horizontal sub-tab pattern with low discoverability.
- Top-level view and admin subsection are not URL-driven, so refresh/share loses context.
- Records table supports filtering/sorting, but jobs table interaction is more static.

### Readability
- Typography uses many near-adjacent sizes and condensed spacing, creating visual noise.
- Dense tables and stacked controls increase scan cost in high-volume workflows.
- Status cues rely heavily on color and subtle text weight differences.

### Visual Appeal
- Styling is coherent but dated and crowded, with limited whitespace rhythm in data-heavy panels.
- Single-slot transition banner can hide prior messages and reduces perceived responsiveness.

### Adjustability
- Data table scaling controls are limited; row density/layout choices are not user-tunable.
- Navigation structure does not adapt to role-specific mental models strongly enough.

### Performance
- Large single-component render surface implies broad rerender scope.
- Lists/tables can grow large; pagination/virtualization patterns are not uniformly applied.
- Loading feedback exists, but content-shaped skeletons are inconsistent.

### Accessibility
- Some `aria-live` use exists, but dynamic feedback is not consistently announced across states.
- Focus visibility is minimal on several interactive elements.
- Escape-close behavior exists in some places but is not universal for modal-like surfaces.

### Maintainability
- Most UX logic and styling are embedded in one legacy file.
- Cross-cutting concerns (feedback, pagination, route state, empty states) were previously duplicated instead of standardized.

## Prioritized Recommendations
- R5 UI tranche added to backlog (`BL-062` through `BL-071`) in `docs/backlog.md`.
- Immediate execution slice (highest impact, lowest dependency risk):
1. `BL-062` URL-driven navigation + breadcrumb continuity.
2. `BL-063` Admin grouped sidebar IA.
3. `BL-064` Toast notification stack.
4. `BL-065` Table pagination standardization.
5. `BL-066` Skeleton + empty-state + focus visibility hardening.

## Execution Strategy
- Use shared UI primitives for route state, feedback, pagination, and toasts.
- Apply improvements incrementally inside legacy shell while preserving existing workflows.
- Continue extracting monolith responsibilities into focused modules in follow-on backlog waves.
