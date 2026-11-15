"""Fixed retrospective spatial/seasonal/temporal transfer audit; never changes counts.

Run after build_data. Uses the independently reconciled unsampled cell ledger.
Fixed candidates: pooled, seasonal and regularized seasonal median-ratio fits.
All predictions target recorded VIIRS occupancy, not physical fire or completeness.
"""
import json
import re
from collections import defaultdict
from zipfile import ZipFile
import numpy as np
import pandas as pd

from .inspect_inputs import PUBLIC, ROOT, RAW, REGIONS, chunks, save_json

SEASONS = ("DJF", "MAM", "JJA", "SON")


def season(month):
    return SEASONS[(int(month[5:7]) % 12) // 3]


def monthly_panel(cells, measure="cells"):
    """One occupied cell counts once per day regardless of within-cell detections."""
    x = cells.assign(month=cells.acq_date.str[:7])
    if measure == "cells":
        x = x.assign(m=cells.m.gt(0).astype(int), v=cells.v.gt(0).astype(int))
    return x.groupby("month")[["m", "v"]].sum()


def fit(panel, method):
    if method not in ("pooled", "seasonal", "regularized"):
        raise ValueError("Unknown calibration method")
    paired = panel[(panel.m > 0) & (panel.v > 0)]
    groups = {"all": paired} if method == "pooled" else {
        s: paired[[season(m) == s for m in paired.index]] for s in SEASONS}
    result = {}
    for name, frame in groups.items():
        years = sorted(set(frame.index.str[:4]))
        ratios = frame.v / frame.m
        # Six distinct training years is an explicit screening rule, not a
        # claim of complete coverage. Unsupported coefficients stay absent.
        result[name] = {"n": len(frame), "years": years,
                        "factor": float(ratios.median()) if len(years) >= 6 else None,
                        "ratio_q25_q75": ratios.quantile([.25, .75]).tolist() if len(frame) else []}
    if method == "regularized":
        pooled_log = float(np.log(paired.v/paired.m).median()) if len(paired) else None
        for name, frame in groups.items():
            r = result[name]
            r["shrinkage_weight"] = r["n"]/(r["n"]+24)
            if r["factor"] is not None:
                seasonal_log = float(np.log(frame.v/frame.m).median())
                r["factor"] = float(np.exp(r["shrinkage_weight"]*seasonal_log+(1-r["shrinkage_weight"])*pooled_log))
    return result


def block_uncertainty(scored):
    """Paired year-block bootstrap of candidate-minus-baseline monthly MAE."""
    years = [r for r in scored["years"].values() if r["n"]]
    if len(years)<2:
        return {"years":len(years),"delta_mae_95_interval":None,"interpretation":"Too few held-out years"}
    delta=np.array([(r["candidate"]-r["baseline"])*r["n"] for r in years])
    n=np.array([r["n"] for r in years])
    draw=np.random.default_rng(847785).integers(0,len(years),size=(2000,len(years)))
    samples=delta[draw].sum(axis=1)/n[draw].sum(axis=1)
    return {"years":len(years),"delta_mae_95_interval":np.quantile(samples,[.025,.975]).tolist(),
            "interpretation":"Paired year-block bootstrap; few years limit uncertainty estimation, not a significance test"}


def regularized_evaluation(train,test):
    validate_temporal_split(train,test)
    result={}
    for method in ("pooled","regularized"):
        coefficients=fit(train,method)
        scored=score(test,coefficients,method)
        result[method]={"coefficients":coefficients,**scored,"numerical_gate":acceptance(scored),
                        "uncertainty":block_uncertainty(scored)}
    return result


def final_refinement():
    panels={}
    for region in REGIONS:
        s=json.loads((PUBLIC/region/"summary.json").read_text())
        assert all(r[1:3]==r[8:10] for r in s["daily"] if "2026-01-01"<=r[0]<="2026-05-31")
        cells=pd.read_csv(ROOT/"data/work"/f"{region}-cells.csv.gz")
        cut=round(((s["envelope"][1]+s["envelope"][3])/2+90)/.02)
        panels[region]={"whole":monthly_panel(cells),"north":monthly_panel(cells[cells.y>=cut]),"south":monthly_panel(cells[cells.y<cut])}
    results={}
    for region,p in panels.items():
        other="lahore" if region=="california" else "california"
        a=p["whole"]
        cases={"temporal_2024_2025":(a.loc["2013":"2023-12"],a.loc["2024":"2025-12"]),
               "forward_2020_2023":(a.loc["2013":"2019-12"],a.loc["2020":"2023-12"]),
               "new_partial_2026":(a.loc["2013":"2023-12"],a.loc["2026-01":"2026-05"]),
               "north_to_south":(p["north"].loc["2013":"2023-12"],p["south"].loc["2024":"2025-12"]),
               "south_to_north":(p["south"].loc["2013":"2023-12"],p["north"].loc["2024":"2025-12"]),
               "from_"+other:(panels[other]["whole"].loc["2013":"2023-12"],a.loc["2024":"2025-12"])}
        results[region]={k:regularized_evaluation(train,test) for k,(train,test) in cases.items()}
    return {"penalty_pseudo_months":24,"regions":results,"deployed":False,
            "hierarchical_status":"NOT_IDENTIFIABLE: two regions and no valid-observation effort; no hierarchical latent model fitted",
            "holdout_status":"2024-2025 reused retrospective tests; 2026 Jan-May new partial evaluation has no JJA/SON and no complete year"}


def match_minutes(m,v,tolerance=30):
    """Maximum cardinality one-to-one matching in ordered time lists."""
    m,v=sorted(set(m)),sorted(set(v));i=j=matches=0
    while i<len(m) and j<len(v):
        if abs(m[i]-v[j])<=tolerance:
            matches+=1;i+=1;j+=1
        elif m[i]<v[j]:i+=1
        else:j+=1
    union=len(m)+len(v)-matches
    return {"matched":matches,"unmatched_modis":len(m)-matches,"unmatched_viirs":len(v)-matches,
            "union":union,"jaccard":matches/union if union else None}


def matched_timing(region):
    from .science import prepare, deduplicate, grid_index
    tokens={sensor:defaultdict(set) for sensor in ("MODIS","VIIRS")}
    for s in json.loads((PUBLIC/"sources.json").read_text()):
        if s["region"]!=region or s["status"]!="archive":continue
        frames=[]
        with ZipFile(RAW/s["zip"]) as archive:
            for frame in chunks(archive,s["member"]):
                frames.append(frame[frame.acq_date.between("2024-01-01","2025-12-31")])
        f,_=prepare(pd.concat(frames,ignore_index=True),s["sensor"])
        f,_=deduplicate(f.assign(is_nrt=False,src=s["id"]))
        f=f.loc[f.quality].copy()
        f["x"],f["y"]=grid_index(f.longitude,-180,18000),grid_index(f.latitude,-90,9000)
        for r in f.itertuples():
            h=int(r.acq_time)
            tokens[s["sensor"]][(r.acq_date,r.x,r.y)].add(h//100*60+h%100)
    keys=set(tokens["MODIS"])|set(tokens["VIIRS"])
    result=dict(matched=0,unmatched_modis=0,unmatched_viirs=0,union=0)
    for key in keys:
        local=match_minutes(tokens["MODIS"].get(key,()),tokens["VIIRS"].get(key,()))
        for k in result:result[k]+=local[k]
    shared=len(set(tokens["MODIS"])&set(tokens["VIIRS"]))
    return {**result,"jaccard":result["matched"]/result["union"] if result["union"] else None,
            "daily_shared":shared,"daily_union":len(keys),"daily_jaccard":shared/len(keys) if keys else None,
            "unit":"unique sensor/cell/date/minute tokens; all MODIS platforms pooled", "tolerance_minutes":30,
            "limitation":"Within one UTC date only; cross-midnight pairs remain unmatched. Same cell/time does not prove the same physical fire; no nondetection or cloud-mask denominator."}


def score(panel, coefficients, method):
    pairs = panel[(panel.m > 0) & (panel.v > 0)]
    rows = []
    for month, r in pairs.iterrows():
        coefficient = coefficients["all" if method == "pooled" else season(month)]["factor"]
        if coefficient is not None:
            rows.append({"month": month, "baseline": abs(float(r.m - r.v)),
                         "candidate": abs(float(coefficient * r.m - r.v)),
                         "bias": float(coefficient * r.m - r.v)})

    def stats(group):
        return {"n": len(group), "years": sorted({r["month"][:4] for r in group}),
                **({k: float(np.mean([r[k] for r in group])) for k in ("baseline", "candidate", "bias")} if group else {})}

    return {"positive_pair_months": len(pairs), "overall": stats(rows),
            "seasons": {s: stats([r for r in rows if season(r["month"]) == s]) for s in SEASONS},
            "years": {y: stats([r for r in rows if r["month"][:4] == y]) for y in sorted(set(pairs.index.str[:4]))}}


def acceptance(result):
    """Require improved MAE and no seasonal deterioration on adequate test support."""
    overall = result["overall"]
    enough = overall["n"] == result["positive_pair_months"] and all(
        r["n"] >= 4 and len(r["years"]) >= 2 for r in result["seasons"].values())
    improved = bool(overall["n"] and overall["candidate"] < overall["baseline"] and all(
        r["n"] and r["candidate"] <= r["baseline"] for r in result["seasons"].values()))
    return "PASS" if enough and improved else "FAIL" if enough else "INSUFFICIENT_SUPPORT"


def evaluate(train, test):
    validate_temporal_split(train,test)
    results = {}
    for method in ("pooled", "seasonal"):
        coefficients = fit(train, method)
        result = score(test, coefficients, method)
        results[method] = {"coefficients": coefficients, **result, "numerical_gate": acceptance(result)}
    return results


def validate_temporal_split(train, test):
    """Reject leakage/pseudoreplication before fitting any audit candidate.

    All present spatial/seasonal evaluations also hold out later years. Empty
    panels are permitted so existing insufficient-support results stay explicit.
    This verifies the split, not that a holdout has never previously been seen.
    """
    for name, panel in (("training", train), ("test", test)):
        if not panel.index.is_unique:
            raise ValueError(f"{name} must contain one row per calendar month")
        if any(not isinstance(m, str) or not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", m) for m in panel.index):
            raise ValueError(f"{name} requires YYYY-MM calendar labels")
        values=panel[["m", "v"]].to_numpy(dtype=float)
        if not np.isfinite(values).all() or (values < 0).any():
            raise ValueError(f"{name} requires finite nonnegative recorded counts")
    if len(train) and len(test) and max(train.index) >= min(test.index):
        raise ValueError("Training must end before every held-out test month")


def experiments(whole, south, north):
    return {
        "temporal_2024_2025": evaluate(whole.loc["2013":"2023-12"], whole.loc["2024":"2025-12"]),
        "forward_2020_2023": evaluate(whole.loc["2013":"2019-12"], whole.loc["2020":"2023-12"]),
        "north_to_south": evaluate(north.loc["2013":"2023-12"], south.loc["2024":"2025-12"]),
        "south_to_north": evaluate(south.loc["2013":"2023-12"], north.loc["2024":"2025-12"]),
    }


def transition_diagnostic(daily):
    rows = []
    for row in daily:
        day, _, _, _, _, only_m, only_v, both, _, _ = row
        rows.append({"month": day[:7], "m": only_m + both, "extra": only_v})
    panel = pd.DataFrame(rows).groupby("month")[["m", "extra"]].sum()
    before_extra = sum(r[6] for r in daily if r[0] < "2012-01-20")
    assert before_extra == 0, "Unexpected VIIRS occupancy before its record begins"
    result = {}
    for label, part in (("entry_month", panel.loc["2012-01":"2012-01"]),
                        ("holdout", panel.loc["2024-01":"2025-12"])):
        modis, extra = int(part.m.sum()), int(part.extra.sum())
        result[label] = {"modis": modis, "viirs_only_increment": extra,
                         "integrated": modis + extra, "increment_percent": 100 * extra / modis if modis else None}
    return {"pre_viirs_extra": int(before_extra), **result,
            "interpretation": "Same-period union minus MODIS counterfactual. Not a causal change in burning at the transition."}


def timing_audit(region):
    """Read-only original-CSV schedule diagnostic, not a new calibration fit.

    Unique recorded UTC minutes avoid weighting a large fire by its pixel count.
    A nearby time elsewhere in the same study rectangle is not a matched fire.
    """
    times = {"Terra": set(), "Aqua": set(), "SNPP": set()}
    sources = json.loads((PUBLIC / "sources.json").read_text())
    for source in sources:
        if source["region"] != region or source["status"] != "archive":
            continue
        with ZipFile(RAW / source["zip"]) as archive:
            for frame in chunks(archive, source["member"]):
                quality = pd.to_numeric(frame.confidence, errors="coerce").ge(30) if source["sensor"] == "MODIS" else frame.confidence.isin(["n", "h"])
                f = frame.loc[quality & frame.acq_date.between("2013-01-01", "2025-12-31")]
                for platform, group in f.groupby("satellite"):
                    day = pd.to_datetime(group.acq_date).to_numpy(dtype="datetime64[D]").astype("int64")
                    hhmm = group.acq_time.astype(int).to_numpy()
                    times[platform].update((day*1440 + (hhmm//100)*60 + hhmm%100).tolist())
    viirs = np.array(sorted(times["SNPP"]))
    result = {"recording_minutes": {k: len(v) for k, v in times.items()}, "nearest_viirs": {}}
    for platform in ("Terra", "Aqua"):
        modis = np.array(sorted(times[platform]))
        if not len(modis) or not len(viirs):
            result["nearest_viirs"][platform] = {"status": "insufficient recorded times"}
            continue
        i = np.searchsorted(viirs, modis)
        distance = np.minimum(abs(modis-viirs[np.clip(i,0,len(viirs)-1)]),
                              abs(modis-viirs[np.clip(i-1,0,len(viirs)-1)]))
        result["nearest_viirs"][platform] = {"n": len(modis), "median_minutes": float(np.median(distance)),
            "within_30_minutes": int((distance<=30).sum()), "within_60_minutes": int((distance<=60).sum())}
    result["interpretation"] = "Nearest recorded VIIRS UTC minute anywhere in the same parent rectangle, 2013-2025. Asymmetric and conditional on detections; no cloud mask, pass completeness, shared footprint or physical-fire match is established."
    return result


def audit_region(region):
    summary = json.loads((PUBLIC / region / "summary.json").read_text())
    assert all(r[1:3] == r[8:10] for r in summary["daily"] if "2013" <= r[0][:4] <= "2025"), "NRT in audit years"
    cells = pd.read_csv(ROOT / "data/work" / f"{region}-cells.csv.gz")
    whole = monthly_panel(cells)
    # Fail closed if the local intermediate is stale relative to shipped data.
    for d, _, _, _, _, m, v, b, _, _ in summary["monthly"]:
        assert (whole.loc[d].tolist() if d in whole.index else [0, 0]) == [m + b, v + b]
    w, s, e, n = summary["envelope"]
    cut = int(round(((s + n) / 2 + 90) / .02))
    south = monthly_panel(cells[cells.y < cut])
    north = monthly_panel(cells[cells.y >= cut])
    pd.testing.assert_frame_equal(south.add(north, fill_value=0).astype(int), whole)
    count_panel = monthly_panel(cells, "detections")
    for d, _, _, m, v, *_ in summary["monthly"]:
        assert (count_panel.loc[d].tolist() if d in count_panel.index else [0, 0]) == [m, v]
    omitted_seasons = {}
    for omitted in SEASONS:
        train = whole.loc["2013":"2023-12"]
        test = whole.loc["2024":"2025-12"]
        train = train[[season(m) != omitted for m in train.index]]
        test = test[[season(m) == omitted for m in test.index]]
        validate_temporal_split(train, test)
        coefficient = fit(train, "pooled")
        omitted_seasons[omitted] = {"pooled": score(test, coefficient, "pooled"),
                                   "coefficients": coefficient,
                                   "seasonal": "UNSUPPORTED: no training examples from the omitted season"}
    return {"region": region, "split_latitude": cut * .02 - 90,
            "spatial_split": "Disjoint grid-aligned north/south sectors; boundary cells never shared. Adjacent sectors are not independent ecosystems.",
            "experiments": experiments(whole, south, north), "leave_one_season_out": omitted_seasons,
            "retained_detection_count_experiments": experiments(count_panel,
                monthly_panel(cells[cells.y < cut], "detections"), monthly_panel(cells[cells.y >= cut], "detections")),
            "count_target": "Quality-retained individual VIIRS detections/month, distinct from occupied cell-days and physical fires",
            "transition": transition_diagnostic(summary["daily"]),
            "deployed": False,
            "coverage_status": "UNKNOWN: detections provide no valid-observation or acquisition masks",
            "evaluation_status": "Retrospective; 2024-2025 have been used in earlier diagnostics, not a new blind dataset"}


def main():
    result = {"version": 1, "methods": ["pooled median VIIRS/MODIS ratio", "four seasonal median ratios"],
              "occupancy_units": "recorded VIIRS occupied cell-days per month", "count_units": "retained VIIRS detections per month", "regions": {}, "recorded_timing": {}}
    for region in REGIONS:
        report = audit_region(region)
        result["regions"][region] = report
        result["recorded_timing"][region] = timing_audit(region)
        print(region, {split: {method: r["numerical_gate"] for method, r in methods.items()}
                       for split, methods in report["experiments"].items()})
    result["final_refinement"]=final_refinement()
    result["matched_timing"]={region:matched_timing(region) for region in REGIONS}
    save_json(PUBLIC / "transfer-validation.json", result)


if __name__ == "__main__":
    main()
