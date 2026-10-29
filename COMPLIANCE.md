# Compliance checklist

Blocking gates from master prompt §3. Not legal advice; items marked "lawyer" need a qualified one.

| Item                 | Requirement                                                                                   | Status                                                        |
| -------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Age gate             | Age band collected at sign-up; minimum 14 in Spain for data consent (configurable per region) | Schema done (`users.age_band`); UI in milestone 2             |
| Web3 for adults only | Wallet, NFTs, marketplace and claims hidden below 18                                          | Rule implemented in `@nyrgo/shared` (`canUseWeb3`) and tested |
| GDPR lawful basis    | Location processed only for active gameplay; privacy policy                                   | Policy text pending                                           |
| GDPR rights          | Data export and erasure endpoints                                                             | Planned (milestone 2); erasure anonymizes ledger rows         |
| Retention            | Precise location 24 h, samples 30 days                                                        | Defaults in config; job in milestone 4                        |
| Processors           | DPA with hosting, email and any tile provider                                                 | Pending provider choice                                       |
| OSM license          | ODbL attribution on the map; share-alike for derived POI database                             | Planned (milestone 3)                                         |
| MiCA                 | Assessment before any public token offer or distribution                                      | Not started; required before Phase 6 (lawyer)                 |
| Loot boxes           | No paid randomized items                                                                      | Enforced by design; nothing paid exists yet                   |
| Trademark            | Search for the commercial name before public branding ("nyrgo" is a codename)                 | Not started                                                   |
| App stores           | Review NFT and crypto rules before any native release                                         | Not applicable yet                                            |
