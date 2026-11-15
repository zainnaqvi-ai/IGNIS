# IGNIS scientific acceptance review · 15 November 2026

## Verdict

**Ready for a local static research demonstrator; scientifically sensor-aware integration.** The existing Lahore and California datasets support a reproducible calendar of recorded thermal detections and occupied 0.02° cell-days. Conditional references, scaled robust deviations and supported descriptive unusualness labels are implemented. Sensor-independent historical comparability and formal observation-adjusted anomaly significance remain **NOT VALIDATED**. The simplified explorer prioritizes controls, calendar, map and patterns; detailed evidence stays here. [Internal alignment is 60%](CHALLENGE_ALIGNMENT.md), with scientific/software subscores separate. This is not an official NASA score or certification. Original data and the grid baseline are unchanged; no new observations, push or deployment were introduced.

## Exact measurement

For UTC date d, let M(d) and V(d) be the sets of 0.02° cells containing at least one retained MODIS or VIIRS observation inside the selected rectangle and classification. Integrated activity over dates D is **Σ(d ∈ D) |M(d) ∪ V(d)|**, in **occupied cell-days**. Spatial filtering selects reported centers before gridding. The fixed grid origin is (−180°, −90°); it is not equal-area. A cell recorded on two days contributes two. Shared occupancy is counted once per day, without asserting that the two sensors saw the same physical fire.

Raw detections count original rows before quality exclusions and deduplication. The integrated grid is a sensor-aware description of recorded activity, not a calibrated sensor-independent estimate, fire count, burned area, forecast or estimate of unobserved burning.

## Evidence from the four ZIPs

All eight CSVs reconcile to 1,515,265 original rows. The grid retains 1,435,985 observations after separate MODIS confidence ≥30 and VIIRS nominal/high rules. No exact duplicates or invalid rows were found. Archive and NRT member date spans are disjoint within each of the four exports. The duplicate-policy fixture tests archive precedence and preservation of distinct radiometry. Each source retains its processing version, original header, date limits and ZIP SHA-256. [Member counts, versions and envelopes](DATA_AUDIT.md)

Classification precedes occupancy. FIRMS type 0 contributes 1,390,033 presumed vegetation detections; types 1, 2 and 3 contribute 8 volcanic, 109,085 other static land and 1,341 offshore detections. All 14,798 NRT detections have unknown class. The default includes all classes. Class-specific raw counts partition the supplied rows. Class-specific cell-day counts can overlap when different sources occupy the same cell and day. Classification is inferred by FIRMS, so even a type 0 record does not establish a wildfire incident. [FIRMS MODIS attributes](https://firms.modaps.eosdis.nasa.gov/content/descriptions/FIRMS_MODIS_Firehotspots.html) · [FIRMS VIIRS attributes](https://firms.modaps.eosdis.nasa.gov/content/descriptions/FIRMS_VIIRS_Firehotspots.html)

Before 20 January 2012, Integrated equals MODIS at 2,283 occupied cell-days in Lahore and 61,653 in California. The raw MODIS counts are 2,585 and 114,055 respectively. Across all supplied dates, the two unions are 19,724 and 382,271. Tests reconcile every regional day and independently re-read CSVs for four cropped windows, including a pre-VIIRS period, overlapping instruments, vegetation, other anomalies and NRT unknowns.

## Held-out sensor agreement

Use only archive months with positive retained occupancy from both instruments in the same parent rectangle. Fit the median ratio of VIIRS to MODIS cell-days in 2013–2023 and hold out all eligible months from 2024–2025. This excludes the entry year and partial ending year. A single multiplier is evaluated without tuning. The comparison is conditional on both instruments recording positive activity and uses VIIRS as a reporting scale. Neither sensor provides ground truth.

| Region | Train / holdout months | Median ratio (training Q1–Q3) | Unadjusted holdout MAE | Adjusted holdout MAE |
|---|---:|---:|---:|---:|
| California | 132 / 24 | 3.37 (2.56–4.23) | 851.3 | 563.0 |
| Lahore | 83 / 17 | 5.07 (3.69–10.83) | 76.5 | 38.3 |

MAE is measured in recorded VIIRS cell-days/month. California's summer MAE increased from 819.3 to 1,433.9. Lahore's training interquartile width exceeds its median and seven of the 24 holdout months lack a positive pair. Both fail the independent sampling-support gate. The diagnostic coefficients are never applied to the calendar.

The existing final alternative restricts fitting to **common positive UTC dates within the same rectangle**, with the same training/holdout split. It was evaluated once; no further parameter search was justified. Against the unchanged original monthly target:

| Region | Common-date factor | Overall MAE, unadjusted → scaled | DJF | MAM | JJA | SON |
|---|---:|---:|---:|---:|---:|---:|
| California | 3.263 | 851.3 → 547.3 | 716.0 → 304.8 | 801.5 → 194.9 | **819.3 → 1,352.1** | 1,068.3 → 337.5 |
| Lahore | 2.261 | 76.5 → 54.1 | 28.0 → 25.9 | 125.4 → 83.3 | 12.7 → 10.6 | 91.8 → 65.6 |

California has 24 scored months, six per season; Lahore has 17 (3/5/3/6). California's summer error worsens by 65.0%. Lahore's factor falls from 5.070 to 2.261 when matching dates; only 95 of 731 holdout dates and one summer month have jointly positive recording dates. These support-sensitive estimates are rejected. Held-out years were excluded from fitting but reused from the prior retrospective evaluation; this is not a fresh blind validation dataset.

Exact same-cell/same-date holdout overlap is **5,605 / 36,228 = 15.47%** for California and **62 / 2,012 = 3.08%** for Lahore. These are observed Jaccard fractions, not detection probabilities. Different pixel sizes (nominal 1 km versus 375 m), detection sensitivity, overpasses, viewing geometry, obscuration and acquisition gaps remain unresolved. Matching UTC dates does not match overpass times or clear-sky opportunity. [Full methods, seasonal results and reproducible diagnostic](MATCHED_AGREEMENT.md)

The subsequent scoped implementation evaluates a four-season ratio alongside the pooled ratio using earlier-year, north/south spatial and season-exclusion tests. California's seasonal fit gives overall MAE **851.3 → 404.4**, but summer **819.3 → 889.3** and south-to-north summer **380.3 → 1,503.8**. A separately defined retained-detection-count model also fails geographic summer transfer (**2,027.2 → 3,228.8 detections/month**), despite improved full-region errors. Lahore lacks sufficient seasonal test support. Thus no additional harmonized hotspot-count metric is published. Read-only source timestamp checks quantify observed recording-time differences. [Protocol, all seasonal results, timing and transition evidence](TRANSFER_VALIDATION.md)

Final refinement adds a fixed regularized seasonal candidate, shrinking seasonal log ratios toward the pooled ratio with 24 pseudo-months. California 2024–2025 overall MAE **851.3 → 431.5**, summer **819.3 → 1,032.3**; Lahore overall **76.5 → 36.9** has insufficient seasonal support. California → Lahore transfer gives **76.5 → 40.2**, while Lahore → California deteriorates **851.3 → 1,250.0**. The previously unscored January–May 2026 block improves overall error but omits summer/autumn and cannot pass acceptance. No untouched full-year final holdout exists. No coefficient is deployed; the latent region-season model is not identifiable from two regions and positive-only records. Seasonal bias, N and limited year-bootstrap uncertainty are documented in [transfer validation](TRANSFER_VALIDATION.md).

Daily Jaccard is unchanged. Fixed ±30-minute one-to-one matching of identical cell/date/minute tokens gives California **1,382/50,887 = 2.716%** and Lahore **14/2,094 = 0.669%**, with unmatched tokens retained. This stricter diagnostic uses different units and does not establish physical-fire equivalence.

## What the historical reference can support

The ZIP readmes and local files matching the four request IDs contain no original request receipts with dates and extents. An ID and first/last detection cannot establish complete acquisition. A recovered request receipt could document query coverage. Independent acquisition and valid-observation masks would still be needed to compare observation effort. The UI flags possible historical MODIS gaps for June–July 2001, 2002, August 2007 and 21–22 April 2009 using conservative intervals for approximate NASA dates. These are product advisories, not assertions of local outages. [FIRMS archive readme](https://firms.modaps.eosdis.nasa.gov/download/Readme.txt)

For a **descriptive median of recorded activity**, target and reference intervals must have positive archive detections on every matched UTC day for every active selected sensor, the same day-of-month bounds and era, and no flagged gap. Five other years are required. This positive-detection condition favors frequently active places. It measures neither clear-sky coverage nor total burning. With full parent rectangles, all classes, retrospective reference mode and the Integrated metric, 66 California whole target months and zero Lahore whole target months qualify. California September 2020 has seven reference Septembers with median 2,269 recorded cell-days.

In retrospective reference mode, exact UTC-day references recover descriptive comparisons for **7,705 California dates and 858 Lahore dates**. Lahore on 5 November 2021 has 57 cell-days versus a median of 22 across eight other eligible 5 Novembers, independently checked against the source CSVs. MODIS-only references preserve Terra/Aqua configuration without imposing the unrelated S-NPP transition. February 29 never substitutes February 28. Daily CSVs use each row's own reference interval.

No scientifically verified anomaly baseline is available in either region: comparable baseline N remains 0. Seasonal charts sum supplied archive/NRT observations within the date filter, show selected calendar-month lengths and partial-month counts, and distinguish absent records from zero retained occupancy. The highest-color-band month list helps locate high **recorded totals** chronologically; it is not an anomaly ranking or a cross-era fire-severity comparison.

Conditional statistics include empirical quartiles and 10th/90th percentiles, tied midrank, signed median deviation and **(value − median)/(1.4826 × MAD)** when N ≥ 8 and MAD > 0. Earlier-years-only is now the default. Sparse, constant, NRT and unsupported targets remain gated. Lahore on 5 November 2021 has Q25–Q75 **11–25.5**, MAD **8** and scaled robust deviation **2.951** across eight other eligible years, independently reconciled to source CSVs. Earlier-years mode has six references and correctly withholds an unusualness label. Exact statistics, legacy unscaled values and eligibility fields remain in exports. Labels describe recorded activity, without significance or emergency claims.

## October reference correction

The reported contradiction was a **status-message defect, not a need to relax eligibility**. Previously, both inadequate reference N and an unsupported target collapsed to “Not enough comparable history”. Historical bars count recorded periods; the reference uses only daily archive-supported periods. October 2026 in California has **15 bars including the target, 14 recorded earlier years and 8 eligible earlier references**. The target is NRT and also lacks MODIS detections on one day. No median or deviation against this target is justified under the existing rule.

Eligibility and counts are unchanged before/after this correction. The interface now gives the actual target reason, shows recorded versus reference-eligible year counts, and exposes each bar's reason in its accessible description. Aggregate CSVs include the target issues and every candidate year's eligibility/exclusion reasons. Date clipping, sensor configuration, target exclusion and earlier-years policy remain distinct from record support. The context panel no longer advises widening the date range as a remedy for NRT processing.

Full parent areas, all classifications, full supplied UTC range, earlier-years policy:

| Target | Region | Integrated / MODIS / VIIRS eligible earlier years | Target limitation |
|---|---|---|---|
| October 2003 | California | 0 / 0 / 0 | Integrated and MODIS target supported, but only 2002 is an earlier same-configuration October and it has a gap advisory; VIIRS unavailable |
| October 2003 | Lahore | 0 / 0 / 0 | Same era/advisory exclusions plus target daily record gaps; VIIRS unavailable |
| October 2026 | California | 8 / 13 / 14 | NRT target; Integrated/MODIS also have a record gap |
| October 2026 | Lahore | 0 / 0 / 5 | NRT target and daily record gaps |

For October 2003, 2000 October is outside the data range and 2001 has a different Terra/Aqua configuration. Earlier-only policy removes later years intentionally. A retrospective Integrated California reference would have four eligible later years, still below five. Integrated 2026 excludes pre-2012 Octobers because they have a different sensor configuration; MODIS alone does not impose that VIIRS boundary. Raw and cell-day modes have identical support eligibility but different values and units. All these date windows contain 31 calendar days: that is **calendar completeness, not observation completeness**.

Every displayed Integrated 2026 reference period is accounted for below. M/V means days with any source detections for MODIS/VIIRS, out of 31. Earlier-year records are standard products; target 2026 records are NRT. Missing record days are unknown, not observed zeros.

| October year | California M/V days | California reference decision | Lahore M/V days | Lahore reference decision |
|---|---:|---|---:|---|
| 2012 | 28/31 | Record gaps | 22/31 | Record gaps |
| 2013 | 31/31 | Eligible | 14/28 | Record gaps |
| 2014 | 30/31 | Record gaps | 20/28 | Record gaps |
| 2015 | 31/31 | Eligible | 17/30 | Record gaps |
| 2016 | 31/31 | Eligible | 19/29 | Record gaps |
| 2017 | 31/31 | Eligible | 22/31 | Record gaps |
| 2018 | 30/31 | Record gaps | 21/31 | Record gaps |
| 2019 | 31/31 | Eligible | 18/23 | Record gaps |
| 2020 | 31/31 | Eligible | 26/31 | Record gaps |
| 2021 | 28/31 | Record gaps | 18/28 | Record gaps |
| 2022 | 28/31 | Record gaps | 15/29 | Record gaps |
| 2023 | 31/31 | Eligible | 12/26 | Record gaps |
| 2024 | 31/31 | Eligible | 14/31 | Record gaps |
| 2025 | 29/31 | Record gaps | 12/27 | Record gaps |
| 2026 | 30/31 | Target excluded; NRT and record gap | 9/27 | Target excluded; NRT and record gaps |

[Independent original-CSV test](../tests/test_october_reference.py) verifies all candidate years, counts, reasons and occupancy in **48 combinations**: two regions × parent/interior AOI × two October targets × three sensors × two measures. Expectations are calculated directly from all eight original CSVs using decimal grid coordinates, independently of the JavaScript eligibility function. Browser tests execute both targets, regions, sensors and measures and inspect the downloaded October audit. No source, threshold, calibration coefficient or baseline count changed. Calibration regression tests reproduce the existing failed experiments; no further variants were fitted to the same holdouts.

## Release checks

| NASA objective | Implemented feature | Evidence | PASS / PARTIAL / NOT VALIDATED |
|---|---|---|---|
| Authentic historical record | Source versions, UTC chronology and provenance | All 1,515,265 source rows independently reconcile to published point indices; ZIP hashes verified | PASS |
| Preserve product differences | Separate quality rules, standard/NRT provenance and duplicate policy | Threshold and archive-precedence fixtures; source ledgers; no actual duplicates | PASS |
| Interpret thermal anomalies correctly | Vegetation / other / unknown selection | Source classification totals, unknown NRT and original-CSV AOI comparisons | PASS |
| Integrate sensors consistently | Sensor-aware common-grid union | Hand calculations, all 54 partitions, pre-VIIRS equality and shared-cell reconciliation | PASS |
| Sensor-independent historical comparability | Pooled, common-date, seasonal and regularized diagnostics; separate detection-count target | Temporal, north/south, inter-region and partial-2026 tests fail full acceptance; matched-time Jaccard | NOT VALIDATED |
| Historical patterns and unusual periods | Conditional ranges, percentiles and MAD deviations; earlier-years references; seasonal sums and high-month discovery | Independent Lahore distribution; sparse/constant/tied/leap cases; no later-year leakage; anomaly baseline N = 0 | PARTIAL — descriptive statistics validated; formal anomalies not validated |
| Geographic calendar exploration | Draw/edit/reset/numerical rectangles and linked analytics | Edge interaction journey; four authentic cropped windows; inclusive boundary tests | PASS |
| Downloadable analysis | Aggregate CSV, selected hotspot CSV and calendar SVG | 155,825 retained September rows; cropped raw CSV multiset matches original NASA rows; SVG 324 months and selected value verified | PASS within documented export scope |
| Usable calendar and map | Daily drilldown, source inspection, explicit units/states and keyboard controls | Edge desktop 1440×960/mobile 390×844 journey and screenshots; no page errors or mobile horizontal overflow | PASS for tested flows; no full accessibility audit |
| Deployable application | Existing static site and Netlify configuration | Local HTTP journey and static assets pass; production hosting not exercised | PARTIAL — local acceptance only |

Executed after the final validation hardening: **28 Python tests passed**, **22 JavaScript tests passed**, and **the complete desktop/mobile Edge journey passed** at 1440×960 and 390×844. The prior October correction's 26 Python/21 JavaScript results remain superseded by this larger run. New tests reject leaking, reversed, duplicated or invalid calibration panels; verify the exact non-identifiability counterexample using both authentic holdout tables; and distinguish an empirical maximum rank from significance. Existing tests cover the 48 independent October cases, per-year exclusions, target NRT versus insufficient history, date clipping versus record gaps, unchanged zero-retained rules, and calibration/time-matching/statistical calculations. Browser tests verify raw-mode descriptions, both October targets in each region/sensor/measure, exported eligibility JSON, three matching-unit metrics, absent technical panels, simple help, sensor/date/AOI/draw/edit/reset controls, earlier/retrospective references, exact CSV scores, SVG contents, keyboard operation, mobile control sizes and no horizontal page overflow. Tests verify software/math; their success does not validate physical comparability or anomaly significance.

README verification also passed: **39 local evidence links/anchors**, **10 NASA objective rows**, and one **14-node Mermaid workflow** with a single final explorer node. Its unchanged Mermaid source was previously parsed/rendered in local Edge with Mermaid 11.12.0; diagram and desktop/mobile screenshots were visually inspected. This verifies the native Mermaid source locally, not a published GitHub rendering. Optional verification assets are confined to ignored `data/work/`; no additional observation data or application dependency was introduced. The official challenge page could not be retrieved during the earlier check, so the README explicitly attributes its requirement assessment to the supplied summary; it was not repeatedly queried for this pass. The four original ZIP SHA-256 values and every published point projection passed the full Python suite; no original observations or scientific baseline values changed.

## Final identifiability and acceptance findings

The latest pass changes the offline validation code to reject temporal leakage before fitting, adds exact-arithmetic identifiability tests, and adds NASA-sourced satellite limitations plus specific missing-evidence requirements. It makes **no dashboard change**, fits **no new candidate**, and changes **no coefficient or scientific count**. Existing transfer experiments were reproduced by regression tests and matched saved results exactly. The counterexample shows that even adding observed cross-sensor overlap does not identify unobserved cell-days without justified detection assumptions. [Proof, estimands, multiple-comparison limits and required metadata](SCIENCE.md#identifiable-quantities-and-missing-evidence)

| Acceptance question | Finding |
|---|---|
| Is common-grid integration correct? | PASS within declared source/filter/grid semantics; full independent reconciliation retained |
| Is sensor-specific bias reliably reduced? | NOT VALIDATED; some overall errors improve, but critical seasonal/geographic gates fail |
| Is latent sensor-independent activity identifiable? | No, from these positive-only files; demonstrated algebraically even under favorable assumptions |
| Did a calibration pass independent final acceptance? | No; existing held-out fits remain rejected and no untouched full-year final holdout remains |
| Are seasonal/geographic comparisons defensible? | Descriptive, matching-unit comparisons only; unequal exposure/area and sensor sensitivity prevent unbiased intensity claims |
| Are unusualness indicators statistically supported? | Conditional descriptive arithmetic is validated; significance, population confidence and alert error rates are not |
| What evidence is missing? | Actual observation opportunities, collection-matched masks/QA/geolocation, source request receipts, independent reference observations and unexamined validation periods |
| What changed locally? | Validation guard, non-identifiability and rank tests, concise README limitations and detailed scientific documentation; interface/baseline preserved |
| Did tests pass? | 28 Python, 22 JavaScript, full desktop/mobile journey, source hashes and README checks passed |

Numerical before/after results remain the prior frozen experiments: California regularized overall **851.3 → 431.5**, summer **819.3 → 1,032.3**, Lahore **76.5 → 36.9** (N = 17; seasonal support insufficient). California → Lahore is **76.5 → 40.2**; Lahore → California is **851.3 → 1,250.0**. These values did not change in this pass; the deployed calendar applies none of them. The internal alignment score stays **60%**—additional tests and documentation do not earn physical comparability. No new observations were acquired; no push or deployment occurred.

Scientific changes are one fixed regularized transfer audit, inter-region/partial-2026 evaluation, year-block uncertainty, cell-and-time matching, scaled robust deviations, gated unusualness labels and explicit seasonal calendar lengths. Dashboard changes are three metrics in matching units; month selection moved into the calendar; default earlier-year references; a short history message replacing “N = 0”; removal of overlap diagnostics, raw support counters, large coverage prose, calibration tables and source-audit navigation; and concise help linking to GitHub. Detailed ledgers remain in source metadata, scientific exports and documentation. Original grid arithmetic, branding, static architecture, source measurements, map/AOI workflows and CSV/SVG exports are preserved. Record CSVs still omit original HHMM/FRP/confidence and are limited to 31 inclusive days; full original fields remain in the private ZIPs.

Remaining limits are missing request receipts, acquisition/valid-observation masks and per-overpass nondetections; sensor and product biases; unequal-area cells; incomplete periods; and selection bias in descriptive references. Recovering a completed request receipt would not establish complete satellite observations. Netlify publication and a production smoke test remain operator-authorized steps. Reproduce with the [run and verification guide](../README.md); the calendar needs no credentials or remote services.
