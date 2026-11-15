# NASA challenge alignment · internal self-assessment

The basis is the user's structured summary of [Harmonization of MODIS and VIIRS Hot Spots](https://www.spaceappschallenge.org/2026/challenges/harmonization-of-modis-and-viirs-hot-spots/), provided on 15 November 2026. It is not a verbatim transcription. The complete official page could not be independently retrieved (HTTP/certificate errors); the user directed implementation to continue from that summary. Core objectives and optional suggestions below are therefore attributed to the supplied summary, not independently verified submission rules.

## Rubric defined before assigning scores

**PASS = 1; PARTIAL = 0.5; NOT VALIDATED = 0.** PASS requires executed evidence for the specifically stated requirement and scope. PARTIAL means an implemented, tested contribution exists but an essential scientific or operational limitation remains. NOT VALIDATED means the central claimed outcome is not established; implementing a test does not earn that outcome's score.

Weights total **100**. Scientific objectives receive 75, including 45 specifically for grid integration and physical sensor comparability. Software delivery receives 25. A successful interface cannot turn a failed scientific outcome into a pass. No requirement earns points merely for being documented.

`Self-assessed alignment (%) = 100 × Σ(weight × status score) / Σ(weights)`

This is an **internal project assessment**, not an official NASA score, judging prediction, certification or percentage of physical accuracy. The weights reflect project judgment. No percentage appears on the public dashboard.

## Requirement assessment

| Requirement | Evidence | Status | Weight | Earned score |
|---|---|---|---:|---:|
| Correct integration of MODIS and VIIRS on the declared measurement | 0.02° daily union; source-derived AOIs; all 54 partitions; pre-VIIRS equality; distinct raw counts | PASS | 15 | 15 |
| Sensor-independent historical comparability, including seasonal/geographic transfer | Pooled/common-date/seasonal/regularized models tested; California summer and geographic transfer fail; latent activity is not identifiable | NOT VALIDATED | 30 | 0 |
| Authenticity and adequate temporal/observational support | Four original ZIP hashes, versions, chronology, class/quality rules verified; request receipts and valid-observation masks absent | PARTIAL | 10 | 5 |
| Correct descriptive historical/seasonal analysis within supported scope | Matched periods and sensor eras, target exclusion, earlier-year references, tested median/quantiles, explicit calendar denominators | PASS | 10 | 10 |
| Identify unusual periods with scientifically interpretable uncertainty | Supported empirical/robust labels and unavailable states implemented; no formal significance, calibrated alert rate or observation-adjusted anomaly | PARTIAL | 10 | 5 |
| Interactive calendar, geographic/date selection and historical exploration | Desktop/mobile Edge journey: draw/edit/reset/coordinates, month/day selection, filters, map, keyboard flow and concise dashboard | PASS | 15 | 15 |
| Download relevant analytics and visualizations | Aggregate and selected-record CSVs plus SVG; original-CSV row comparison and visualization content checked | PASS | 5 | 5 |
| Reproducible local static application and transparent data use | Python/JS suites, local HTTP browser journey, source manifest, methods and deployment instructions; production deployment is outside this scored scope | PASS | 5 | 5 |
| **Total** | | | **100** | **60** |

**Overall internal alignment: 60%. Scientific outcomes: 35/75 = 46.7%. Software implementation: 25/25 = 100% within tested scope.** The sensor-independent comparability requirement is explicitly NOT VALIDATED. Software 100% does not mean all browser/device accessibility combinations, global area queries or production hosting were validated. Production deployment remains unverified and is not counted as completed.

The historical series spans the supplied early-2000s-to-November-2026 observations, with missing periods left unknown. Recent NRT periods often lack an eligible archive reference. The October correction distinguishes target exclusions from the number of eligible historical years and preserves all thresholds; it does not change this score. The README's ten-row feature table uses broader IMPLEMENTED / PARTIALLY IMPLEMENTED / NEEDS FURTHER VALIDATION labels, without claiming those rows are the eight weighted outcomes in this rubric. Working controls cannot remove scientific limitations. [Acceptance results](REVIEW.md) and [numerical transfer evidence](TRANSFER_VALIDATION.md) are the supporting records.

## Optional suggestions from the supplied summary

| Optional suggestion | Implemented response / boundary |
|---|---|
| Selectable map or geographic coordinates | Draw/edit/reset plus expandable numerical rectangle entry, within the two supplied study envelopes |
| Monthly heatmap with accessible colors | Existing visual identity, state symbols, accessible names and keyboard navigation preserved; no full accessibility certification |
| Multi-year average or median | Median, empirical ranges and scaled robust deviations where eligible; an average is not required in addition |
| Clear hotspot metrics and selected-search CSV | Raw source rows and cell-days remain distinct; limited-field unsampled observation download for ≤31 inclusive days |
| Simple indicators for scientists/managers/responders | Supported recorded-activity labels and concise context; no wildfire warning or forecast |

The public UI has three consistently labeled metrics, the calendar/map, historical comparison, seasonal totals and recorded-activity context. Calibration diagnostics, source auditing and extended limitations are in repository documentation and scientific exports. The original sources, 0.02° grid, static architecture, branding and working exports remain preserved. No new observation dataset, push or deployment was introduced.
