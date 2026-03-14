# Architecture Risk Register

| Risk | Impact | Mitigation | Release Focus | Status |
| --- | --- | --- | --- | --- |
| Auth modernization delay | Production security exposure and audit failure risk | Prioritize `PLAT-AUTH-v1` and block R1 exit without completion | R1 | Open |
| Legacy UI monolith complexity | High change-collision risk across teams | Frontend domain modularization and interface boundaries | R1 | Open |
| Route-layer concentration in backend | Slower delivery and regression risk | Service extraction by stream with contract tests | R1 | Open |
| Entitlement model ambiguity | Commercial inconsistency and support burden | Define `COMM-LICENSE-v1` and `COMM-SEAT-v1` before wide rollout | R1 | Open |
| Offline update reliability gap | Customer environments unable to patch securely | Signed offline bundle process and rollback verification | R1 | Open |
| Backup/restore gaps | Data loss and operational outage risk | Automated local backups plus tested restore runbook | R1 | Open |
| Integration schema drift | Import failures and reconciliation cost | Canonical ingest contract and adapter versioning | R2 | Monitoring |
| Export format inconsistency | Compliance rejection risk | Versioned export profiles and acceptance fixtures | R2 | Open |
| Analytics without stable source contracts | Incorrect KPIs and trust loss | Gate R3 on R2 contract stability and quality checks | R3 | Open |
| Multi-site leakage between partitions | Data governance violations | Site-bound authorization and partition safeguards | R3 | Open |
| Module compatibility regressions | Core workflow instability | Release matrix with module-on/module-off regression suite | R1-R4 | Open |
| Parallel team interface drift | Merge conflicts and rework | Required stream contracts and dependency declarations | R1-R4 | Open |
