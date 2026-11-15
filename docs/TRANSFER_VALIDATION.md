# Extended transfer validation · 15 November 2026

## Prespecified final refinement protocol

Frozen before executing the additional experiments: retain the previous raw occupancy baseline and pooled median-ratio fit; evaluate one regularized seasonal candidate. Let g be the median training log(V/M), g_s its seasonal counterpart, n_s the number of positive training pairs in that season, and λ = 24 pseudo-months. Set log(f_s) = [n_s/(n_s+24)] g_s + [24/(n_s+24)] g. The fixed penalty is two annual cycles of monthly pairs; it is an explicit conservative shrinkage choice, not fitted from validation performance. At least six distinct training years per season are required. No penalty search or later coefficient adjustment is allowed.

Train on 2013–2023; evaluate separately on the previously used 2024–2025 period, the earlier 2013–2019 → 2020–2023 block, both north/south geographic directions, and California → Lahore and Lahore → California. A separately labeled 2026 January–May block has not been scored by earlier transfer experiments. Both products have standard archive records spanning those months in both regions, but this is still not evidence of complete acquisition. This block is only five months of one year, omits summer/autumn, and cannot independently validate seasonal generalization. No untouched full-year final holdout exists in these supplied records.

Keep the numerical gates fixed: improve overall MAE; do not worsen any seasonal MAE; have predictions for every positive test pair; at least four test months in at least two years for every season. Deployment additionally requires these gates across all temporal/geographic directions and independently justified observation comparability. A 2026 partial-block improvement alone cannot pass. Report per-year errors and paired year-block bootstrap intervals for MAE change (fixed seed, 2,000 resamples); intervals with only two held-out years are weak descriptive uncertainty, not an independent significance claim. A hierarchical region-and-season latent model is not identifiable from only two disparate regions and positive detections without observation opportunities. Do not fit it or borrow unsupported seasonal coefficients.

An additional timing diagnostic will match occupied **cell-date-minute** tokens within the same 0.02° cell and UTC date using a fixed ±30-minute tolerance and one-to-one maximum-cardinality matching. Exact daily Jaccard remains the baseline. Report unmatched tokens and null Jaccard for an empty union. This is a sampling diagnostic, not proof of matching physical fires. Neither it nor the latent-model discussion changes calendar units or counts.

## Decision and scope

Keep the existing 0.02° cell-day union unchanged. Neither a seasonal occupancy conversion nor a separate harmonized hotspot-count estimate passes the complete validation protocol. No model is applied to historical observations. All calculations use only the four existing NASA FIRMS ZIPs and their reconciled local derivatives. Original CSV members remain read-only; no new observations were acquired or generated.

The final validation hardening adds an executed guard to pooled/seasonal, regularized and season-exclusion evaluation: training must end before every test month, with unique YYYY-MM month labels and finite nonnegative counts. Overlap, reversed chronology, duplicate months and invalid values are rejected before fitting. Previously reported splits already satisfy this guard and their metrics remain exactly unchanged. Tests also demonstrate the non-identifiability of unseen cell-days using exact arithmetic on both authentic holdout tables; see [estimands and missing evidence](SCIENCE.md#identifiable-quantities-and-missing-evidence). This is a mathematical counterexample, not a generated observation dataset or a new fit. No new nested model search is warranted without a distinct, defensible hypothesis or an untouched complete final holdout.

The executable audit is `pipeline/transfer_validation.py`. Its published output is [transfer-validation.json](../site/data/transfer-validation.json), retained in the repository. Detailed diagnostic tables are intentionally absent from the simplified public dashboard. This extends the [earlier fixed/common-date experiments](MATCHED_AGREEMENT.md), whose evidence remains intact.

## Two distinct targets

1. **Occupied cell-days:** for each sensor, count a cell once on each UTC date, then sum those cell-days by month. The unadjusted baseline compares MODIS occupancy with VIIRS occupancy in the same place and month.
2. **Quality-retained detections:** sum individual retained observation rows by month, preserving repeat detections within a cell. This separately evaluates a possible VIIRS-scale detection-count estimate. It is not a relabeling of occupancy, an estimate of unique fires, or a conversion to burned area.

Both use MODIS confidence ≥30 and VIIRS nominal/high, all inferred classes, standard archive data only in 2013–2025, and months where both sensors have positive retained totals. A positive-pair restriction conditions the analysis on jointly recorded activity; it does not establish complete sampling or validate extrapolation to silent months. The baseline and candidate always use identical scoring months and units. Missing model support is reported, never replaced by a coefficient.

## Fixed protocol

The new alternative has four factors, one for each meteorological season, fitted as median monthly VIIRS/MODIS ratios. The pooled median ratio is retained as a comparison. Neither has an intercept, coefficient clipping, optimization search or post-evaluation adjustment.

- Temporal test: train 2013–2023; evaluate 2024–2025.
- Earlier forward test: train 2013–2019; evaluate 2020–2023.
- Spatial tests: train on one north/south sector in 2013–2023; evaluate the other in 2024–2025, in both directions. Split at the study-envelope midpoint rounded to the existing grid boundary: California 37.30°N; Lahore 31.50°N. Every grid cell belongs to one sector. Their totals reconcile exactly to the parent ledger. Adjacent sectors can share weather and are not independent ecosystems.
- Season exclusion: fit a pooled ratio without one season in 2013–2023; evaluate only that season in 2024–2025. A seasonal model without examples from the omitted season is explicitly unsupported.

A coefficient requires six distinct training years. A numerical acceptance requires predictions for every eligible test pair, at least four scored months and two years in every season, improved overall MAE, and no seasonal MAE deterioration. These are declared conservative project screening rules, not NASA standards or significance tests. Training-ratio quartiles and year-specific errors are published; quartiles are variability measures, not confidence bounds. Only two final evaluation years limit precision. The 2024–2025 observations were already used in earlier retrospective audits: fit/test separation is enforced, but these are not new blind validation data.

## Occupancy results

MAE in **recorded VIIRS cell-days/month**; baseline → seasonal fit:

| Region / temporal 2024–2025 | Overall | DJF | MAM | JJA | SON |
|---|---:|---:|---:|---:|---:|
| California | 851.3 → 404.4 | 716.0 → 285.9 | 801.5 → 94.7 | **819.3 → 889.3** | 1,068.3 → 347.7 |
| Lahore | 76.5 → 35.6 | 28.0 → 22.7 | 125.4 → 53.3 | 12.7 → 3.3 | 91.8 → 43.5 |

California has 24 pairs, six per season. The seasonal fit improves overall error but increases summer error by 8.5%, failing the prespecified gate. Lahore has 17 pairs (3/5/3/6 by season), insufficient winter/summer validation support.

| California test | Overall baseline → seasonal fit | Summer baseline → seasonal fit | Numerical gate |
|---|---:|---:|---|
| Forward 2020–2023 | 1,228.8 → 816.2 | 1,435.8 → 1,304.6 | PASS |
| North → south | 500.9 → 291.7 | 495.3 → 336.4 | PASS |
| South → north | **364.5 → 584.5** | **380.3 → 1,503.8** | FAIL |

No candidate passes all tests. Lahore lacks sufficient seasonal support in all four splits; south-to-north seasonal prediction also lacks a supported summer coefficient. Omitting summer entirely from pooled fitting increases California summer MAE from 819.3 to 1,584.3. Seasonal structure and geography materially affect transfer; a single globally meaningful conversion is not demonstrated.

## Additional detection-count metric

California's seasonal detection-count fit improves full-region 2024–2025 MAE from **2,530.3 to 1,005.7 retained detections/month**, and summer MAE from **4,231.2 to 3,040.8**. However, south-to-north transfer worsens overall MAE from **1,047.7 to 1,052.8**, and summer from **2,027.2 to 3,228.8**. Even the simpler pooled detection-count factor fails that geographic summer test (2,027.2 → 3,045.9). Lahore remains sparsely supported. Thus a broadly applicable harmonized hotspot-count metric is **not validated**, despite encouraging full-region count correlations. Authentic raw counts remain available without adjustment.

## Timing and transition evidence

The read-only timestamp audit deduplicates recorded UTC minutes per platform in 2013–2025. It measures the distance from each recorded MODIS minute to the nearest recorded S-NPP minute anywhere in the same study rectangle:

| Region | Terra minutes / median separation | Aqua minutes / median separation | S-NPP recorded minutes |
|---|---:|---:|---:|
| California | 10,070 / 130 min | 9,701 / 26 min | 35,264 |
| Lahore | 358 / 132.5 min | 587 / 31 min | 3,363 |

These asymmetric, detection-conditioned distances are not actual pass counts, shared footprints or physical-fire matches. They demonstrate why grouping by UTC date does not align observation times. NASA describes distinct MODIS morning/afternoon platforms, variable off-nadir pixel size, and separate confidence quantities. VIIRS has finer nominal pixels and greater sensitivity to small fires, with its own confidence categories. Thresholding and spatial binning cannot correct all these differences. [MODIS attributes](https://firms.modaps.eosdis.nasa.gov/content/descriptions/FIRMS_MODIS_Firehotspots.html), [VIIRS attributes](https://firms.modaps.eosdis.nasa.gov/content/descriptions/FIRMS_VIIRS_Firehotspots.html)

The sensor-transition diagnostic compares Integrated and MODIS **within the same period**, isolating added recorded occupancy rather than comparing different fire seasons. Before VIIRS begins, added occupancy is zero. In January 2012, California has 279 MODIS cell-days plus 252 VIIRS-only cell-days; Lahore has 2 plus 20. In 2024–2025, California has 11,001 MODIS plus 25,227 VIIRS-only cell-days (+229.3%); Lahore has 302 plus 1,710 (+566.2%). These differences are not causal estimates of changes in burning. The increment is retained in diagnostic JSON and scientific CSV components; its former dashboard panel was removed to simplify the public interface.

Cloud and valid-observation masks, nondetection pixels, complete acquisition metadata and reference fire observations are absent. The existing timestamps cannot recover them. No additional fit is warranted by the failed transfer tests. Reproduction:

```powershell
.\.venv\Scripts\python.exe -m pipeline.transfer_validation
.\.venv\Scripts\python.exe -m pytest -q tests/test_transfer_validation.py
```

The command reads original ZIPs for timing and verified unsampled cell ledgers for transfer, and writes only the derived diagnostic JSON. It does not rebuild or modify the calendar.

## Regularized candidate: executed results

The frozen refinement protocol above was executed once. No penalty was retuned. Values below are monthly occupancy MAE and signed bias in recorded VIIRS cell-days; N counts scored positive-pair months. Negative bias is underprediction.

| Target / test | N | Baseline MAE | Regularized MAE | Bias | JJA baseline → regularized | Gate |
|---|---:|---:|---:|---:|---:|---|
| California, 2024–2025 | 24 | 851.3 | 431.5 | +135.0 | 819.3 → 1,032.3 | FAIL |
| Lahore, 2024–2025 | 17 | 76.5 | 36.9 | −12.5 | 12.7 → 4.5 | Insufficient seasonal support |
| California, forward 2020–2023 | 48 | 1,228.8 | 1,074.8 | +927.2 | 1,435.8 → 1,935.2 | FAIL |
| Lahore, forward 2020–2023 | 29 | 100.0 | 41.4 | +19.3 | 11.7 → 6.5 | Insufficient seasonal support |
| California, north → south | 24 | 500.9 | 299.5 | −181.5 | 495.3 → 352.4 | Numerical PASS only |
| California, south → north | 24 | 364.5 | 567.4 | +554.8 | 380.3 → 1,498.7 | FAIL |
| Lahore, north → south | 10 | 34.2 | 20.3 | +20.2 | 3.5 → 1.8 | Insufficient seasonal support |
| Lahore, south → north | 12 of 13 | 71.7 | 40.0 | −40.0 | No supported summer coefficient | Insufficient support |
| California trained → Lahore tested | 17 | 76.5 | 40.2 | −33.5 | 12.7 → 9.6 | Insufficient seasonal support |
| Lahore trained → California tested | 24 | 851.3 | 1,250.0 | +1,241.5 | 819.3 → 3,638.9 | FAIL |
| California, new January–May 2026 | 5 | 822.2 | 258.2 | −258.2 | Summer absent | Insufficient support |
| Lahore, new January–May 2026 | 4 | 81.5 | 69.7 | −69.7 | Summer absent | Insufficient support |

Where an unsupported seasonal coefficient excludes a month, the baseline in the table is evaluated on that same reduced scored set; the report also preserves `positive_pair_months`. This does not constitute an accepted prediction for the omitted month. No missing observation or coefficient is imputed.

| 2024–2025 regularized test | DJF MAE | MAM MAE | JJA MAE | SON MAE | Seasonal N |
|---|---:|---:|---:|---:|---|
| California within-region | 292.8 | 87.2 | 1,032.3 | 313.5 | 6 / 6 / 6 / 6 |
| Lahore within-region | 24.0 | 56.2 | 4.5 | 43.7 | 3 / 5 / 3 / 6 |
| California → Lahore | 25.1 | 53.1 | 9.6 | 52.2 | 3 / 5 / 3 / 6 |
| Lahore → California | 510.8 | 119.5 | 3,638.9 | 730.8 | 6 / 6 / 6 / 6 |

The paired year-block 95% bootstrap intervals for overall MAE change (candidate minus baseline) are California within-region **[−486.6, −353.1]**, Lahore within-region **[−46.8, −33.0]**, and Lahore → California **[+202.9, +594.5]**. Each uses only two held-out years, so these are limited empirical resampling summaries, not reliable population confidence guarantees. Per-year and seasonal bias, training support and all intervals remain in JSON. Overall improvement cannot override summer degradation. The new partial 2026 block has one year and receives no interval.

**No calibration passes deployment acceptance.** A hierarchical latent-activity model is not fitted. In even a simplified model `observed_s ≈ detection_probability_s × latent_activity`, many different latent series and sensor probabilities explain the same two observed counts. Clouds, overpasses, false positives and correlated detections add further unknowns. Positive-only FIRMS records do not identify these terms. Capture–recapture would require defensible independence, common population and detection-probability assumptions that these observations do not establish. Two heterogeneous study regions are also inadequate for a validated population-level regional hierarchy. A flexible regression could fit the counts but would not resolve this physical identifiability problem.

## Cell and acquisition-time matching

With a fixed ±30-minute tolerance, one-to-one matching on identical UTC date and cell gives:

| Region | Matched tokens | Unmatched MODIS | Unmatched VIIRS | Matched-token union | Time-matched Jaccard |
|---|---:|---:|---:|---:|---:|
| California | 1,382 | 13,420 | 36,085 | 50,887 | 2.716% |
| Lahore | 14 | 289 | 1,791 | 2,094 | 0.669% |

Here a token is a unique sensor/cell/date/UTC-minute record after the original quality and duplicate policy, with MODIS platforms pooled. It is deliberately a different unit from daily occupied cell-days. Daily Jaccard remains **15.471%** and **3.082%**, respectively, and reconciles exactly with the prior audit. Empty unions return null, not zero or perfect agreement. Multiple timestamps cannot reuse one matching token; cross-midnight candidates remain unmatched. Greedy ordered matching yields maximum cardinality under the fixed interval tolerance. Tests cover empty, competing, duplicate and boundary cases. Neither Jaccard is physical fire agreement or a detection-probability estimate.
