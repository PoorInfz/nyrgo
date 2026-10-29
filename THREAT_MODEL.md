# Threat model (STRIDE)

Scope: Phase 1 (no blockchain). Reviewed at the end of every phase. Status: **draft, milestone 3**.

## Assets

Player progress (creatures, Gold, XP), player accounts and email addresses, location samples,
admin configuration, audit logs.

## Trust boundaries

1. Player device ↔ API (the client is untrusted).
2. Admin browser ↔ admin API (separate route and login, 2FA).
3. API ↔ PostgreSQL.
4. API ↔ email provider (not chosen yet).
5. Phase 3: API ↔ NEAR RPC and indexer.

## Threats and controls

| STRIDE            | Threat                                            | Control                                                                                                                                                 | Status                                                                                     |
| ----------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Spoofing          | GPS spoofing, teleporting                         | Speed and accuracy plausibility, cooldowns, risk signals, no single-signal bans                                                                         | Planned (milestone 4)                                                                      |
| Spoofing          | Session theft or replay from a database leak      | httpOnly SameSite=Lax cookie, SHA-256 token hashes only, 30-day expiry, rotation on sign-in, revocation on logout                                       | Done and tested                                                                            |
| Spoofing          | Magic-link interception or reuse                  | Single use, 15-minute expiry, hash stored, token removed from the address bar after use                                                                 | Done and tested                                                                            |
| Spoofing          | Account enumeration through the email endpoint    | Same 202 answer whether or not the email has an account                                                                                                 | Done and tested                                                                            |
| Spoofing          | Cross-site request forgery                        | SameSite=Lax plus refusal of foreign `Origin` on state-changing requests                                                                                | Done and tested                                                                            |
| Spoofing          | Borrowed unlocked phone deletes an account        | Deleting a registered account needs a sign-in from the last 15 minutes                                                                                  | Done and tested                                                                            |
| Tampering         | Client sends fake capture or damage results       | Client sends intents only; server rolls with stored seed and records chance and roll                                                                    | Schema done                                                                                |
| Tampering         | Balance edits                                     | Append-only Gold ledger (trigger), `gold >= 0` check, unique `(reason, ref_id)`                                                                         | Done and tested                                                                            |
| Tampering         | Mass assignment (`isAdmin` and similar)           | Strict request schemas; unknown fields rejected                                                                                                         | Done and tested                                                                            |
| Repudiation       | Admin denies a config change                      | Append-only `admin_audit_log` with reason, before and after                                                                                             | Schema done and tested                                                                     |
| Info disclosure   | Location history leak                             | Only the player's own H3 cell is echoed back; precise points nulled at 24 h, rows deleted at 30 days; coordinates redacted from logs                    | **Samples stored since milestone 3; retention job due in milestone 4**; log redaction done |
| Info disclosure   | Other players' positions                          | Never returned by any endpoint                                                                                                                          | Done (no endpoint exposes them)                                                            |
| Info disclosure   | Emails or tokens in logs                          | Logger redacts `email`, `token`, cookies and `set-cookie`; dev mailer logs the link but not the address                                                 | Done; verified by smoke test                                                               |
| Info disclosure   | Secrets in repo                                   | `.env` ignored, gitleaks in CI, secret manager in production                                                                                            | CI written                                                                                 |
| Denial of service | Endpoint flooding                                 | Global 120/min per IP; guest 10/hour, magic link 5/15 min, verify 20/15 min per IP; 3 links per address per 15 min; 64 KB bodies; 5 s statement timeout | Done; guest limit tested                                                                   |
| Denial of service | Email bombing a third party                       | Per-address cap of 3 messages per 15 minutes                                                                                                            | Done and tested                                                                            |
| Safety            | Objectives placed at schools, homes, roads, water | Exclusion zones from OSM, POI filter at query time, three-report hiding                                                                                 | Done and tested; tag coverage depends on OSM                                               |
| Elevation         | GPS simulator shipped to players                  | Simulator only in `import.meta.env.DEV` builds                                                                                                          | Verified absent from the production bundle                                                 |
| Elevation         | Dev GPS simulator in production                   | Startup refuses `ENABLE_DEV_ROUTES` in production                                                                                                       | Done and tested                                                                            |
| Elevation         | Player reaches admin functions                    | Separate route prefix, separate auth, roles                                                                                                             | Planned                                                                                    |
| Elevation         | Minor reaches web3 features                       | Age band stored at sign-up; `canUseWeb3` only for `18+`                                                                                                 | Rule done and tested; enforced on web3 routes in Phase 3                                   |
