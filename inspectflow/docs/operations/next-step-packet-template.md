# Sub-Agent Task Packet Template

Use one packet per active sub-agent track in a controller run.

## Packet
- `Cycle`: `YYYY-MM-DD-C#`
- `Track`: `<backend|frontend|verifier|docs|custom>`
- `Assigned BL IDs`: `BL-###, BL-###`
- `Scope`: precise boundaries (paths, contracts, acceptance slices)
- `Out of Scope`: explicit exclusions
- `Required Actions`:
  1. Action one with measurable completion signal
  2. Action two with measurable completion signal
- `Required Evidence`:
  - file/line references
  - test or command outputs
- `Escalate If`:
  - explicit blocker conditions
- `Expected Deliverables`:
  - concrete output list for controller merge
