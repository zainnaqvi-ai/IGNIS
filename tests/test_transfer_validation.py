"""Independent arithmetic, leakage checks and authentic-ledger reconciliation."""
import json
import csv
import io
from bisect import bisect_left
from datetime import date
from zipfile import ZipFile
from statistics import mean, median

import pandas as pd
import pytest

from pipeline.inspect_inputs import PUBLIC, RAW
from pipeline.transfer_validation import audit_region, evaluate, fit, monthly_panel, score, season, transition_diagnostic, final_refinement, match_minutes, block_uncertainty, regularized_evaluation, validate_temporal_split


def test_calibration_rejects_invalid_or_leaking_validation_panels():
    train=pd.DataFrame({"m":[1,2],"v":[2,4]},index=["2020-01","2020-02"])
    valid=pd.DataFrame({"m":[3],"v":[6]},index=["2021-01"])
    validate_temporal_split(train,valid)
    for evaluator in (evaluate,regularized_evaluation):
        for invalid in (train,valid.rename(index={"2021-01":"2019-01"})):
            with pytest.raises(ValueError,match="before every held-out"):
                evaluator(train,invalid)
        with pytest.raises(ValueError,match="one row per calendar month"):
            evaluator(pd.concat([train,train]),valid)
        with pytest.raises(ValueError,match="YYYY-MM"):
            evaluator(train,valid.rename(index={"2021-01":"2021-13"}))
        for bad in (-1,float("nan"),float("inf")):
            with pytest.raises(ValueError,match="finite nonnegative"):
                evaluator(train,valid.assign(v=bad))
        assert all(r["numerical_gate"]=="INSUFFICIENT_SUPPORT" for r in evaluator(train,valid.iloc[:0]).values())
    with pytest.raises(ValueError,match="Unknown calibration method"):
        fit(train,"typo")


def test_observed_overlap_does_not_identify_unseen_activity():
    """Exact algebraic counterexample, not generated observation records.

    Even assuming perfect specificity, varying the unobserved population can
    preserve all three observed cells of the two-sensor contingency table.
    """
    from fractions import Fraction
    for region in ("california","lahore"):
        s=json.loads((PUBLIC/region/"summary.json").read_text())
        rows=[r for r in s["daily"] if "2024-01-01"<=r[0]<="2025-12-31"]
        a,b,c=(sum(r[i] for r in rows) for i in (5,6,7))
        union=a+b+c
        assert union == (36228 if region=="california" else 2012)
        probabilities=[]
        # Hypothetical unseen cell-days are an algebraic free parameter only.
        for h in (0,union):
            population=union+h
            q=[Fraction(n,population) for n in (a,b,c,h)]
            assert sum(q)==1 and all(0<=p<=1 for p in q)
            assert [population*p for p in q[:3]]==[a,b,c]
            assert population*(q[0]+q[2])==a+c
            assert population*(q[1]+q[2])==b+c
            probabilities.append(q)
        assert probabilities[0]!=probabilities[1]


def test_occupancy_and_detection_targets_are_distinct():
    cells = pd.DataFrame({"acq_date": ["2020-06-01", "2020-06-01", "2020-06-02"],
                          "m": [5, 0, 2], "v": [1, 4, 0]})
    assert monthly_panel(cells).loc["2020-06"].tolist() == [2, 2]
    assert monthly_panel(cells, "detections").loc["2020-06"].tolist() == [7, 5]


def test_transition_includes_january_days_before_viirs_entry():
    rows=[["2012-01-19",2,0,2,0,2,0,0,2,0],
          ["2012-01-20",3,4,3,4,1,2,2,3,4]]
    result=transition_diagnostic(rows)
    assert result["pre_viirs_extra"]==0
    assert result["entry_month"]=={"modis":5,"viirs_only_increment":2,"integrated":7,"increment_percent":40}
    rows[0][6]=1
    with pytest.raises(AssertionError,match="before its record"):
        transition_diagnostic(rows)


def test_timing_matching_retains_unmatched_tokens_and_empty_union():
    assert match_minutes([],[])["jaccard"] is None
    assert match_minutes([0,0,60,120],[25,100,200]) == {"matched":2,"unmatched_modis":1,"unmatched_viirs":1,"union":4,"jaccard":.5}
    assert match_minutes([0,30],[20])["matched"]==1
    assert match_minutes([0],[31])["matched"]==0
    assert match_minutes([0],[30])["matched"]==1


def test_regularization_penalty_and_holdout_separation():
    import numpy as np
    months=[f"{y}-{m:02}" for y in range(2013,2024) for m in range(1,13)]
    p=pd.DataFrame({"m":10,"v":[20 if season(m)=="JJA" else 80 for m in months]},index=months)
    f=fit(p,"regularized")
    assert f["JJA"]["factor"]==pytest.approx(np.exp(33/57*np.log(2)+24/57*np.log(8)))
    later=pd.DataFrame({"m":[1],"v":[9999]},index=["2026-01"])
    assert fit(pd.concat([p,later]).loc[:"2023-12"],"regularized")==f
    assert block_uncertainty({"years":{"2026":{"n":1,"candidate":2,"baseline":1}}})["delta_mae_95_interval"] is None


def test_real_final_refinement_and_spatial_timing_reconciliation():
    saved=json.loads((PUBLIC/"transfer-validation.json").read_text())
    assert final_refinement()==saved["final_refinement"]
    for region,tests in saved["final_refinement"]["regions"].items():
        assert tests["new_partial_2026"]["regularized"]["numerical_gate"]=="INSUFFICIENT_SUPPORT"
        other="lahore" if region=="california" else "california"
        # Transfer coefficients depend solely on the source-region training data.
        assert tests["from_"+other]["regularized"]["coefficients"]==saved["final_refinement"]["regions"][other]["temporal_2024_2025"]["regularized"]["coefficients"]
        assert any(x["regularized"]["numerical_gate"]!="PASS" for x in tests.values())
        m=saved["matched_timing"][region]
        assert m["union"]==m["matched"]+m["unmatched_modis"]+m["unmatched_viirs"]
        s=json.loads((PUBLIC/region/"summary.json").read_text())["common_date_diagnostic"]["all_holdout_cells"]
        assert (m["daily_shared"],m["daily_union"])==(s["both"],s["union"])


def test_seasonal_fit_has_no_test_leakage_and_does_not_invent_unseen_seasons():
    assert [season("2024-"+m) for m in ("01","03","06","09","12")] == ["DJF","MAM","JJA","SON","DJF"]
    months = [f"{y}-{m:02}" for y in range(2013, 2021) for m in range(1, 13)]
    panel = pd.DataFrame({"m": 10, "v": [20 if season(m) == "JJA" else 40 for m in months]}, index=months)
    train, test = panel.loc[:"2018-12"], panel.loc["2019":]
    model = evaluate(train, test)["seasonal"]
    assert model["numerical_gate"] == "PASS" and model["overall"]["candidate"] == 0
    assert model["coefficients"]["JJA"]["factor"] == 2
    modified = test.copy();modified.v *= 9
    assert evaluate(train, modified)["seasonal"]["coefficients"] == model["coefficients"]
    without_summer = train[[season(m) != "JJA" for m in train.index]]
    no_summer = fit(without_summer, "seasonal")
    assert no_summer["JJA"]["factor"] is None
    assert score(test, no_summer, "seasonal")["seasons"]["JJA"]["n"] == 0


@pytest.mark.parametrize("region", ["california", "lahore"])
def test_authentic_transfer_report_and_unchanged_baseline(region):
    report = audit_region(region)
    saved = json.loads((PUBLIC / "transfer-validation.json").read_text())["regions"][region]
    assert report == saved
    summary = json.loads((PUBLIC / region / "summary.json").read_text())
    result = report["experiments"]["temporal_2024_2025"]
    assert result["pooled"]["overall"]["baseline"] == pytest.approx(summary["overlap_diagnostic"]["mae"]["unadjusted"])
    # Compute the seasonal coefficients and held-out errors without calling fit/score.
    train, hold = {s: [] for s in ("DJF", "MAM", "JJA", "SON")}, []
    for d, _, _, _, _, om, ov, b, _, _ in summary["monthly"]:
        m, v = om+b, ov+b
        if not (m and v):
            continue
        if "2013" <= d[:4] <= "2023":
            train[season(d)].append(v/m)
        elif d[:4] in ("2024", "2025"):
            hold.append(abs(m*median(train[season(d)])-v))
    assert result["seasonal"]["overall"]["candidate"] == pytest.approx(mean(hold))
    assert not report["deployed"] and report["transition"]["pre_viirs_extra"] == 0
    for target in ("experiments", "retained_detection_count_experiments"):
        assert any(v["seasonal"]["numerical_gate"] != "PASS" for v in report[target].values())
    assert summary["calibration"]["status"] == "unavailable"


def test_lahore_recording_times_independently_from_original_csvs():
    sources=json.loads((PUBLIC/"sources.json").read_text())
    times={p:set() for p in ("Terra","Aqua","SNPP")}
    for s in sources:
        if s["region"]!="lahore" or s["status"]!="archive":
            continue
        with ZipFile(RAW/s["zip"]) as archive, archive.open(s["member"]) as member:
            for r in csv.DictReader(io.TextIOWrapper(member,encoding="utf-8")):
                if not "2013-01-01"<=r["acq_date"]<="2025-12-31":
                    continue
                if not (int(r["confidence"])>=30 if s["sensor"]=="MODIS" else r["confidence"] in ("n","h")):
                    continue
                hhmm=int(r["acq_time"])
                times[r["satellite"]].add(date.fromisoformat(r["acq_date"]).toordinal()*1440+hhmm//100*60+hhmm%100)
    saved=json.loads((PUBLIC/"transfer-validation.json").read_text())["recorded_timing"]["lahore"]
    assert saved["recording_minutes"]=={k:len(v) for k,v in times.items()}
    viirs=sorted(times["SNPP"])
    for platform in ("Terra","Aqua"):
        distances=[]
        for t in times[platform]:
            i=bisect_left(viirs,t)
            candidates=viirs[max(0,i-1):min(len(viirs),i+1)]
            distances.append(min(abs(t-v) for v in candidates))
        result=saved["nearest_viirs"][platform]
        assert result["n"]==len(distances)
        assert result["median_minutes"]==median(distances)
        assert result["within_30_minutes"]==sum(d<=30 for d in distances)
        assert result["within_60_minutes"]==sum(d<=60 for d in distances)
