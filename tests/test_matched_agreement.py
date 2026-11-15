import json
from statistics import mean

import pytest

from pipeline.inspect_inputs import PUBLIC
from pipeline.matched_agreement import audit


def row(day, m_only, v_only, shared):
    m, v = m_only + shared, v_only + shared
    return [day, m, v, m, v, m_only, v_only, shared, m, v]


def test_common_date_estimator_keeps_evaluation_targets_distinct():
    days = [
        row("2013-05-01", 1, 5, 1),  # training M=2, V=6
        row("2013-05-02", 40, 0, 0),
        row("2013-05-03", 0, 10, 0),
        row("2024-05-01", 1, 2, 1),  # holdout M=2, V=3
        row("2024-05-02", 2, 0, 0),
        row("2024-06-01", 1, 0, 0),
        row("2024-06-02", 0, 5, 0),  # same month only
    ]
    result = audit(days)
    assert result["factor"] == 3
    assert result["matched_dates"] == {"training": 1, "holdout": 1}
    assert result["matched_day_holdout_cells"] == {"only_m":1,"only_v":2,"both":1,"union":4,"jaccard":0.25}
    assert result["all_holdout_cells"] == {"only_m":4,"only_v":7,"both":1,"union":12,"jaccard":1/12}
    assert result["both_positive_dates_only"]["overall"] == {"n":1,"unadjusted":1,"scaled":3}
    assert result["original_monthly_target"]["overall"] == {"n":2,"unadjusted":2.5,"scaled":5.5}
    days[-1][-1] = 0
    with pytest.raises(ValueError, match="Non-standard"):
        audit(days)


@pytest.mark.parametrize("region",["california","lahore"])
def test_identical_original_baseline_and_holdout_independence(region):
    summary = json.loads((PUBLIC/region/"summary.json").read_text())
    result = audit(summary["daily"])
    assert result == summary["common_date_diagnostic"]
    original = summary["overlap_diagnostic"]
    for i, season in enumerate(("DJF","MAM","JJA","SON")):
        assert result["original_monthly_target"][season]["unadjusted"] == pytest.approx(
            original["seasonal_mae"][str(i)]["unadjusted"])
    panel = result["original_monthly_target"]["overall"]
    assert panel["n"] == original["holdout_n"]
    assert panel["unadjusted"] == pytest.approx(original["mae"]["unadjusted"])
    # Independent check from the unsampled monthly ledger for the new factor.
    errors = [
        abs(result["factor"]*(m+b) - (v+b)) for d,_,_,_,_,m,v,b,_,_ in summary["monthly"]
        if "2024-01"<=d<="2025-12" and m+b>0 and v+b>0
    ]
    assert panel["scaled"] == pytest.approx(mean(errors))
    assert audit([r for r in summary["daily"] if r[0]<"2024-01-01"])["factor"] == result["factor"]
