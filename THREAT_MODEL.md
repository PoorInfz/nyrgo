# Threat model (STRIDE)

Scope: Phase 1 (no blockchain). Reviewed at the end of every phase. Status: **draft, milestone 1**.

## Assets

Player progress (creatures, Gold, XP), player accounts and email addresses, location samples,
admin configuration, audit logs.

## Trust boundaries

1. Player device ↔ API (the client is untrusted).
2. Admin browser ↔ admin API (separate route and login, 2FA).
3. API ↔ PostgreSQL.
4. Phase 3: API ↔ NEAR RPC and indexer.

## Threats and controls

| STRIDE            | Threat                                      | Control                                                                                     | Status                                           |
| ----------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Spoofing          | GPS spoofing, teleporting                   | Speed and accuracy plausibility, cooldowns, risk signals, no single-signal bans             | Planned (milestone 4)                            |
| Spoofing          | Session theft                               | httpOnly SameSite cookies, hashed session tokens, short expiry, revocation                  | Schema done; logic in milestone 2                |
| Tampering         | Client sends fake capture or damage results | Client sends intents only; server rolls with stored seed and records chance and roll        | Schema done                                      |
| Tampering         | Balance edits                               | Append-only Gold ledger (trigger), `gold >= 0` check, unique `(reason, ref_id)`             | Done and tested                                  |
| Repudiation       | Admin denies a config change                | Append-only `admin_audit_log` with reason, before and after                                 | Schema done and tested                           |
| Info disclosure   | Location history leak                       | Precise coordinates nulled at 24 h, rows deleted at 30 days; coordinates redacted from logs | Retention job in milestone 4; log redaction done |
| Info disclosure   | Secrets in repo                             | `.env` ignored, gitleaks in CI, secret manager in production                                | CI written                                       |
| Denial of service | Endpoint flooding                           | Global rate limit (120/min), 64 KB body limit, statement timeout 5 s                        | Done                                             |
| Elevation         | Dev GPS simulator in production             | Startup refuses `ENABLE_DEV_ROUTES` in production                                           | Done and tested                                  |
| Elevation         | Player reaches admin functions              | Separate route prefix, separate auth, roles                                                 | Planned                                          |
