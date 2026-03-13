# Architecture Risk Register

| Risk | Impact | Mitigation | Status |
| --- | --- | --- | --- |
| No authentication (role header only) | Unauthorized access on untrusted networks | Treat MVP as trusted LAN-only; plan for auth/SSO layer post-MVP | Open |
| Stale job locks from disconnected clients | Jobs blocked from entry | Admin force-unlock; consider server-side lock timeout if needed | Monitoring |
| Capability misconfiguration | Users unable to access required workflows | Seed sane defaults; document recovery path (Admin re-enable) | Open |
| Record payload mismatch or invalid refs | Data integrity issues and audit gaps | Server-side validation + transactional writes | Mitigated |
| Single-site DB as a single point of failure | Loss of availability | Manual exports now; plan automated backups post-MVP | Open |
