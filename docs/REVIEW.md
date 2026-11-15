# IGNIS scientific acceptance review · 15 November 2026

## Verdict

The downloaded Lahore and California study rectangles support a reproducible historical calendar of recorded thermal detections and occupied 0.02° cell-days. Both series retain sensitivity to orbit, resolution, cloud, background thermal sources, product changes and observation effort. The calibrated reference-scale index and formal anomaly claims remain unsupported. Challenge alignment was evaluated against the supplied objectives. The public challenge URL returned HTTP 502. See [objective-to-feature mapping](CHALLENGE_ALIGNMENT.md).

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

MAE is measured in recorded VIIRS cell-days/month. California's summer MAE increased from 819.3 to 1,433.9. Lahore's training interquartile width exceeds its median and seven of the 24 holdout months lack a positive pair. Both fail the independent sampling-support gate. The diagnostic coefficients are never applied to the calendar. Per-season errors, paired-year counts and sample sizes are published in the regional summary files.

## What the historical reference can support

The ZIP readmes and local files matching the four request IDs contain no original request receipts with dates and extents. An ID and first/last detection cannot establish complete acquisition. A recovered request receipt could document query coverage. Independent acquisition and valid-observation masks would still be needed to compare observation effort. The UI flags possible historical MODIS gaps for June–July 2001, 2002, August 2007 and 21–22 April 2009 using conservative intervals for approximate NASA dates. These are product advisories, not assertions of local outages. [FIRMS archive readme](https://firms.modaps.eosdis.nasa.gov/download/Readme.txt)

For a **descriptive median of recorded activity**, target and reference intervals must have positive archive detections on every matched UTC day for every active selected sensor, the same day-of-month bounds and era, and no flagged gap. Five other years are required. This positive-detection condition favors frequently active places. It measures neither clear-sky coverage nor total burning. With full parent rectangles, all classes and the default integrated metric, 66 California target months and zero Lahore target months qualify. California September 2020 has seven reference Septembers with median 2,269 recorded cell-days. No scientifically verified anomaly baseline is available in either region. Seasonal charts sum the selected archive and distinguish absent records from measured zero retained occupancy.

## Release checks

| Acceptance group | Evidence | Result |
|---|---|---|
| Source integrity and chronology | ZIP hashes, CSV rows, schema, UTC validation, source date limits | PASS |
| Sensor quality and duplicates | Per-sensor confidence fixtures, archive precedence, source ledgers | PASS |
| Class handling | Source type counts, unknown NRT, classified AOIs and CSV | PASS |
| Grid arithmetic | Hand-calculated union, repeated days, boundary tests | PASS |
| Historical integration | All 54 unsampled partitions reconcile to the original daily series | PASS |
| Cross-sensor agreement | Independent verification of held-out errors; calibrated index | Diagnostic PASS; index NOT VALIDATED |
| Historical context | Partial windows, platform availability, matched years and archive-supported median | Descriptive checks PASS; anomalies NOT VALIDATED |
| Geographic scope | Draw, edit, coordinate entry, out-of-envelope rejection, reset and CSV reference | PASS |
| Interface and exports | Edge desktop/mobile viewport, keyboard navigation, map inspection and downloaded CSV checks | PASS |
| Hosting | Local static HTTP journey and asset checks; Netlify production deployment | Local PASS; hosted deployment untested |

Reproduce with the commands in the [run and verification guide](../README.md). The local Python tests for actual CSV windows invoke Node. No credentials, API keys or remote services are needed for the calendar.
