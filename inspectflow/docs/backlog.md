# Backlog (Active Build)

This backlog follows `docs/backlog-framework.md` and is organized for parallel team execution across releases.

## Baseline Preservation
- Historical v1-era backlog snapshot: `docs/backlog-v1-baseline-2026-03.md`
- Previously delivered baseline IDs (`BL-001` through `BL-014`) remain preserved in that snapshot and worklog history.

## Active Backlog Shards
- R1 (Commercialization Foundation): `docs/backlog/r1.md`
- R2 (Enterprise Expansion): `docs/backlog/r2.md`
- R3 (Intelligence and Multi-Site): `docs/backlog/r3.md`
- R4 (Platform and Ecosystem): `docs/backlog/r4.md`
- R5 (UI/UX Modernization): `docs/backlog/r5.md`
- Recovery (Audit Follow-Ups): `docs/backlog/recovery.md`
- Commercialization Acceleration (External Review 2026-03): `docs/backlog/commercialization.md`
- Customer Appeal (Buyer-Facing UX): `docs/backlog/customer-appeal.md`

## Delivery Sequence Defaults
1. Complete R1 `PLAT`, `OPS`, `QUAL`, and `COMM` foundation items.
2. Freeze R1 contracts and run full acceptance matrix.
3. Execute R2 modules in parallel using stable R1 contracts.
4. Start R3 intelligence and multi-site work only after R2 contract maturity gate.
5. Use R4 as expansion track with compatibility-first governance.
6. After R1 stabilization, execute the commercialization acceleration track in this order: reliability gates (`BL-092`), runtime scalability (`BL-101`/`BL-102`/`BL-103`), quality-suite expansion (`BL-093` to `BL-098`), then packaging and operating model (`BL-104` to `BL-108`).
7. For buyer-facing appeal work, start with onboarding and trust surfaces (`BL-109`, `BL-112`), then customer proof/report views (`BL-110`, `BL-113`), and finish with the visual polish pass (`BL-111`).
8. For UI modernization and token-efficiency work, deliver the responsive shell and modularization tranche (`BL-119`, `BL-120`) before expanding any additional surface polish, then ship the customer proof-pack handoff (`BL-121`).

## Queue Status
- The latest review wave has been fully reconciled. `STATUS.md` is intentionally empty until new work is claimed.
- Historical delivery packets for that wave are archived at `docs/operations/cycles/2026-04-01-archived-delivery-packets.md`.
- Completed items remain preserved in `WORKLOG.md` and the shard docs above remain the right place to seed any future backlog additions.
