# Supplied FIRMS exports

The four local ZIPs passed CRC inspection. Their SHA-256 hashes match the separately supplied download files byte for byte. Data processing reads named CSV members in chunks without extracting them. The California MODIS ZIP also contains an unrelated text document. Its name appears in the manifest; the pipeline ignores its content. Each readme points to the same generic FIRMS page. None includes a request polygon, requested period or acquisition schedule.

| Area | Product | Member | First positive UTC | Last positive UTC | Raw rows | Quality excluded | Retained |
|---|---|---|---|---|---:|---:|---:|
| Lahore | MODIS | Archive | 2000-11-14 | 2026-06-26 | 6,458 | 124 | 6,334 |
| Lahore | MODIS | NRT | 2026-09-07 | 2026-11-13 | 85 | 2 | 83 |
| Lahore | S-NPP | Archive | 2012-01-20 | 2026-07-08 | 23,259 | 4,228 | 19,031 |
| Lahore | S-NPP | NRT | 2026-08-15 | 2026-11-02 | 241 | 10 | 231 |
| California | MODIS | Archive | 2000-11-01 | 2026-08-31 | 364,139 | 21,529 | 342,610 |
| California | MODIS | NRT | 2026-09-01 | 2026-11-13 | 1,308 | 79 | 1,229 |
| California | S-NPP | Archive | 2012-01-20 | 2026-07-31 | 1,106,611 | 52,432 | 1,054,179 |
| California | S-NPP | NRT | 2026-08-01 | 2026-11-02 | 13,164 | 876 | 12,288 |

The audit found 1,515,265 rows, 79,280 confidence exclusions and 1,435,985 retained observations. There were zero invalid, clipped or duplicate rows and no empty cells in the supplied column sets. Within each region/product the archive and NRT detection date spans do not overlap. Gaps between positive records carry unknown coverage. MODIS archive versions are 6.03 and 61.03, NRT 6.1NRT. S-NPP archive version is 2, NRT 2.0NRT. Read the on-disk platform and instrument fields together with the FIRMS product codes. S-NPP CSVs use SNPP for both fields and brightness/bright_t31 for the two thermal bands. Archive classification includes static sources. Type is absent from every NRT header. Original rows, including FRP and classification, are preserved in the untouched ZIPs.

| Pooled observed-point envelope | West | South | East | North |
|---|---:|---:|---:|---:|
| Lahore area | 74.02003 | 31.25001 | 74.65 | 31.75 |
| California area | -124.39342 | 32.5 | -114.1 | 42.1 |

| Region | MODIS only cell-days | VIIRS only cell-days | Both | Union | Highest recorded month | Paired positive months |
|---|---:|---:|---:|---:|---|---:|
| Lahore | 4,878 | 13,996 | 850 | 19,724 | November 2021 · 564 cell-days | 116 |
| California | 99,826 | 206,932 | 75,513 | 382,271 | September 2020 · 17,272 cell-days | 179 |

Both overlap records span 15 calendar years, with zero independently verified, comparable months. Calibration and same-month anomaly gates therefore fail eligibility in both areas. Positive counts are exact for the supplied files. The map display is sampled and cannot establish event perimeters or tactical conditions.

The eight-row machine-readable inventory includes original headers, confidence domains and values, per-member field null counts and coordinate extrema, dates, versions, hashes and QA counters. See [CSV manifest](../config/source_manifest.csv), [published manifest](../site/data/sources.json) and [scientific methods](SCIENCE.md).
