# MODIS–VIIRS agreement on common recording dates

**Decision.** Preserve the common-grid calendar and withhold a historical conversion factor in both regions. California's summer error increased when the common-date factor was applied to the original monthly target. Lahore's scale estimate depended strongly on which dates were included, and the holdout contains only one summer month with any positive common date.

## Measurement and test

For sensor $s$ and UTC date $d$, let $C_s(d)$ contain the occupied 0.02° cells inside the selected study rectangle after the published quality and duplicate rules. The integrated total over dates $D$ is $\sum_{d\in D}|C_M(d)\cup C_V(d)|$, in occupied **cell-days**. One cell observed on two dates contributes two. On a date without VIIRS occupancy the union equals MODIS occupancy. Raw detection counts use individual supplied rows. The common-grid measure describes recorded thermal activity under the available instruments and includes presumed vegetation, other and unknown classes by default.

The prior fit used months with positive occupancy from both sensors. The two sensors can meet this rule on entirely different dates. We changed one fitting rule. In each parent rectangle, keep only UTC dates on which both sensors have positive retained archive occupancy, aggregate by month, and calculate the median monthly ratio of VIIRS to MODIS cell-days over 2013–2023. All classes remain included. We held 2024–2025 out of fitting, retained the original study rectangles, grid and date split, and did no tuning. These are the same evaluation years as the prior retrospective review. They provide temporal separation from training; no new independent deployment dataset was available.

| Region | Training months / common dates | Prior factor | Common-date factor | Held-out common dates / calendar days |
|---|---:|---:|---:|---:|
| California | 132 / 3,659 | 3.366 | 3.263 | 620 / 731 |
| Lahore | 79 / 634 | 5.070 | 2.261 | 95 / 731 |

## Held-out errors

The primary comparison uses the **original monthly target**: each sensor's monthly recorded cell-days over all dates, restricted to holdout months in which both sensors have positive occupancy. This keeps the scoring months, targets and unadjusted MODIS baseline identical to the earlier audit. Error is the absolute difference between estimated and recorded VIIRS cell-days, averaged equally over eligible months. Months without a positive pair are excluded. Values are descriptive MAE in cell-days/month.

| Region and method | All | Winter DJF | Spring MAM | Summer JJA | Autumn SON |
|---|---:|---:|---:|---:|---:|
| California · unadjusted | 851.3 | 716.0 | 801.5 | 819.3 | 1,068.3 |
| California · original factor | 563.0 | 301.6 | 167.4 | 1,433.9 | 349.1 |
| California · common-date factor | 547.3 | 304.8 | 194.9 | 1,352.1 | 337.5 |
| California · scored months | 24 | 6 | 6 | 6 | 6 |
| Lahore · unadjusted | 76.5 | 28.0 | 125.4 | 12.7 | 91.8 |
| Lahore · original factor | 38.3 | 24.6 | 59.4 | 5.9 | 43.9 |
| Lahore · common-date factor | 54.1 | 25.9 | 83.3 | 10.6 | 65.6 |
| Lahore · scored months | 17 | 3 | 5 | 3 | 6 |

For the narrower **common-date target**, score only occupancy on dates when both sensors reported positive activity in the same rectangle. The table reports unadjusted → scaled errors on this same subset. The smaller totals and changed sampling mean its MAE is on a different target from the table above.

| Region | All | DJF | MAM | JJA | SON |
|---|---:|---:|---:|---:|---:|
| California | 819.5 → 343.6 | 615.2 → 215.3 | 732.5 → 135.0 | 899.2 → 706.3 | 1,031.3 → 318.0 |
| Lahore | 39.5 → 20.0 | 1.3 → 1.4 | 81.2 → 41.0 | 0.0 → 1.3 | 30.3 → 15.0 |

California contributes six months per season to this second comparison. Lahore contributes 3, 5, 1 and 6 respectively. Selecting dates by a positive result from both sensors favors times when both record activity. In a MODIS-only historical year the qualifying dates cannot be identified using this rule.

## Agreement at the same place and date

Across all 2024–2025 dates we counted exact intersections and unions of the observed sets of (UTC date, grid cell). California had 5,396 MODIS-only, 25,227 VIIRS-only and 5,605 shared cell-days. The Jaccard overlap was 5,605 / 36,228 = **15.47%**. Lahore had 240, 1,710 and 62 respectively, giving 62 / 2,012 = **3.08%**. Limiting the denominators to dates with positive occupancy from both instruments gives 16.68% and 5.69%. These fractions describe spatial agreement conditional on observed detection. A common date can contain different overpasses or different sources. The tests give no probability of detecting a true physical fire.

Nominal pixel size, detection sensitivity and overpass time differ between instruments. Clouds, smoke, varying viewing geometry, grid-edge placement and missing acquisitions can reduce the overlap. FIRMS point exports lack joint valid-observation masks, per-overpass nondetections and reference fire observations. None of the numerical comparisons establish unbiased historical activity or acquisition completeness. [NASA MODIS attributes](https://firms.modaps.eosdis.nasa.gov/content/descriptions/FIRMS_MODIS_Firehotspots.html) · [NASA VIIRS attributes](https://firms.modaps.eosdis.nasa.gov/content/descriptions/FIRMS_VIIRS_Firehotspots.html)

Reproduce from the verified unsampled daily ledgers with `.\.venv\Scripts\python.exe -m pipeline.matched_agreement`. Validate with `.\.venv\Scripts\python.exe -m pytest -q tests/test_matched_agreement.py`. The hand-calculated fixture distinguishes common-day and whole-month targets. Both real-region tests reconcile the baseline to the published seasonal errors, independently evaluate the candidate on the original monthly ledger and verify that withholding all evaluation dates leaves the factor unchanged.
