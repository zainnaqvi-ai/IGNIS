"""Audit one fixed common-date scale factor without changing calendar data.

Run with python -m pipeline.matched_agreement. Inputs are the published,
unsampled parent-region daily ledgers, including only the fixed 2013–2025
window. Positive records establish activity, not acquisition completeness.
"""
import json
from collections import defaultdict
from statistics import mean, median

from .inspect_inputs import PUBLIC, REGIONS
from .science import FIELDS


def heldout_errors(months, factor):
    """Unweighted monthly MAE for every season that has an eligible month."""
    errors = defaultdict(list)
    for month, (modis, viirs) in months.items():
        season = ("DJF", "MAM", "JJA", "SON")[(int(month[5:]) % 12) // 3]
        pair = (abs(modis - viirs), abs(factor * modis - viirs))
        errors[season].append(pair)
        errors["overall"].append(pair)
    return {
        label: {"n": len(rows), "unadjusted": mean(row[0] for row in rows),
                "scaled": mean(row[1] for row in rows)}
        for label, rows in errors.items()
    }


def spatial_overlap(only_m, only_v, both):
    union = only_m + only_v + both
    return {"only_m":only_m, "only_v":only_v, "both":both, "union":union,
            "jaccard":both/union if union else None}


def audit(daily):
    all_days = defaultdict(lambda: [0, 0])
    common_days = defaultdict(lambda: [0, 0])
    matched_dates = {"training": 0, "holdout": 0}
    holdout_cells = [0, 0, 0]
    joint_holdout_cells = [0, 0, 0]
    for day, raw_m, raw_v, _, _, only_m, only_v, both, archive_m, archive_v in daily:
        if day < "2013-01-01" or day > "2025-12-31":
            continue
        if (raw_m, raw_v) != (archive_m, archive_v):
            raise ValueError(f"Non-standard records inside the fixed audit window: {day}")
        month = day[:7]
        modis, viirs = only_m + both, only_v + both
        all_days[month][0] += modis
        all_days[month][1] += viirs
        if month >= "2024-01":
            holdout_cells[0] += only_m
            holdout_cells[1] += only_v
            holdout_cells[2] += both
        if modis and viirs:
            common_days[month][0] += modis
            common_days[month][1] += viirs
            period = "training" if month < "2024-01" else "holdout"
            matched_dates[period] += 1
            if period == "holdout":
                joint_holdout_cells[0] += only_m
                joint_holdout_cells[1] += only_v
                joint_holdout_cells[2] += both

    ratios = [v/m for month, (m, v) in common_days.items() if month < "2024-01"]
    if not ratios:
        raise ValueError("No training months with a common positive UTC date")
    factor = median(ratios)
    paired = {month: counts for month, counts in common_days.items() if month >= "2024-01"}
    full = {month: counts for month, counts in all_days.items() if month >= "2024-01" and all(counts)}
    return {
        "train_months": len(ratios), "factor": factor, "matched_dates": matched_dates,
        "all_holdout_cells": spatial_overlap(*holdout_cells),
        "matched_day_holdout_cells": spatial_overlap(*joint_holdout_cells),
        "both_positive_dates_only": heldout_errors(paired, factor),
        "original_monthly_target": heldout_errors(full, factor),
    }


def main():
    for region in REGIONS:
        summary = json.loads((PUBLIC / region / "summary.json").read_text())
        if summary["columns"] != FIELDS:
            raise ValueError("Unknown daily ledger schema")
        print(json.dumps({"region": region, **audit(summary["daily"])}, indent=2))


def calendar_diagnostic(daily):
    """Publish diagnostics separately from the scientific totals."""
    try:
        return audit(daily)
    except ValueError as exc:
        # A source refresh can remove training support. The calendar still works.
        return {"unavailable_reason": str(exc)}


if __name__ == "__main__":
    main()
