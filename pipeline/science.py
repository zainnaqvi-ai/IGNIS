"""Region-independent grid, support and comparison rules."""
import numpy as np
import pandas as pd

# Fields common to archive/NRT. Source processing and inferred type are metadata.
IDENTITY = ["latitude","longitude","brightness","bright_t31","scan","track","acq_date",
            "acq_time","satellite","instrument","confidence","frp","daynight"]
FIELDS = ["period","raw_m","raw_v","kept_m","kept_v","only_m","only_v","both","archive_m","archive_v"]


def grid_index(coords, origin, cells):
    # FIRMS coordinates are decimal degrees; 1e-7° fixed point prevents a
    # binary floating conversion from moving exact boundaries one bin west.
    ticks = np.rint((coords - origin) * 10_000_000).astype("int64")
    return (ticks // 200_000).clip(0,cells-1)


def prepare(frame, sensor):
    frame = frame.rename(columns={"bright_ti4":"brightness","bright_ti5":"bright_t31"}).copy()
    if "type" not in frame:
        frame["type"] = "UNKNOWN"
    for col in ["latitude","longitude","scan","track","frp","brightness","bright_t31"]:
        frame[col] = pd.to_numeric(frame[col], errors="coerce")
    date = pd.to_datetime(frame.acq_date, format="%Y-%m-%d", errors="coerce")
    hhmm = frame.acq_time.str.zfill(4)
    frame["acq_time"] = hhmm
    valid = (date.notna() & frame.acq_date.str.fullmatch(r"\d{4}-\d{2}-\d{2}") &
             hhmm.str.fullmatch(r"(?:[01]\d|2[0-3])[0-5]\d") &
             frame.latitude.between(-90,90) & frame.longitude.between(-180,180))
    if sensor == "MODIS":
        conf = pd.to_numeric(frame.confidence, errors="coerce")
        valid &= conf.between(0,100) & frame.satellite.isin(["Aqua","Terra"]) & frame.instrument.eq("MODIS")
        frame["quality"] = conf.ge(30)
    else:
        valid &= frame.confidence.isin(["l","n","h"]) & frame.satellite.eq("SNPP") & frame.instrument.isin(["SNPP","VIIRS"])
        frame["quality"] = frame.confidence.isin(["n","h"])
    return frame.loc[valid].copy(), int((~valid).sum())


def deduplicate(frame):
    frame = frame.sort_values("is_nrt", kind="stable")
    within = frame.duplicated([*IDENTITY,"is_nrt","version","type"])
    cross = pd.Series(False, index=frame.index)
    archives = frame.loc[~frame.is_nrt]
    nrt = frame.loc[frame.is_nrt]
    common_dates = set(archives.acq_date.unique()) & set(nrt.acq_date.unique())
    if common_dates:
        a = archives.loc[archives.acq_date.isin(common_dates), IDENTITY]
        n = nrt.loc[nrt.acq_date.isin(common_dates), IDENTITY]
        cross.loc[n.index] = pd.MultiIndex.from_frame(n).isin(pd.MultiIndex.from_frame(a))
    removed = within | cross
    return frame.loc[~removed], frame.loc[removed].groupby("src").size().to_dict()


def cell_counts(frame):
    return (frame.assign(x=grid_index(frame.longitude,-180,18000), y=grid_index(frame.latitude,-90,9000))
            .groupby(["acq_date","x","y"]).size())


def integration(m, v):
    cells = pd.concat([m.rename("m"), v.rename("v")],axis=1).fillna(0).astype(int)
    mm, vv = cells.m.gt(0), cells.v.gt(0)
    daily = pd.DataFrame(dict(kept_m=cells.m,kept_v=cells.v,only_m=mm & ~vv,
                              only_v=vv & ~mm,both=mm & vv)).groupby(level=0).sum()
    return cells, daily


def calibrate(months, supported=()):
    table = pd.DataFrame(months, columns=FIELDS).set_index("period")
    pairs = pd.DataFrame(dict(m=table.only_m+table.both, v=table.only_v+table.both))
    pairs = pairs[(pairs.m>0) & (pairs.v>0)]
    counts = pairs.groupby(pairs.index.str[:4]).size().to_dict()
    verified = pairs.loc[pairs.index.isin(supported)]
    years = sorted(y for y, group in verified.groupby(verified.index.str[:4]) if len(group)==12)
    report = dict(status="unavailable",paired_months=len(pairs),paired_by_year=counts,
                  supported_months=len(verified),complete_years=years)
    if len(years)<6:
        report["reason"] = "Fewer than six full years of independently documented, comparable paired months."
        return report
    train = verified.loc[verified.index.str[:4].isin(years[:-2])]
    test = verified.loc[verified.index.str[:4].isin(years[-2:])]
    ratios = train.v/train.m
    factor = float(ratios.median())
    base = test.m-test.v
    residual = test.m*factor-test.v
    season = ((test.index.str[5:7].astype(int)%12)//3)
    seasonal = pd.DataFrame(dict(baseline=base.abs(),model=residual.abs(),bias=residual)).groupby(season).mean()
    q1,q3 = ratios.quantile([.25,.75])
    passed = (residual.abs().mean()<base.abs().mean() and (seasonal.model<=seasonal.baseline).all() and q3-q1<=factor)
    report.update(status="validated" if passed else "unavailable",train_years=years[:-2],holdout_years=years[-2:],
                  train_n=len(train),holdout_n=len(test),training_ratio_iqr=[q1,q3],
                  candidate=factor,mae=float(residual.abs().mean()),baseline_mae=float(base.abs().mean()),
                  seasonal=seasonal.to_dict("index"),reason="Passed held-out checks." if passed else "Held-out or stability gate failed.")
    return report
