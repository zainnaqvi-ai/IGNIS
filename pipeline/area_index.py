"""Publish sufficient statistics for exact point-centre rectangle queries."""
import numpy as np
import pandas as pd

# 12-byte little-endian records. Padding keeps coordinates aligned.
DTYPE = np.dtype([("lon", "<i4"), ("lat", "<i4"), ("day", "<u2"), ("flags", "u1"), ("type_code", "u1")])


def pack(frame, retained_indices, sensor):
    points = np.zeros(len(frame), dtype=DTYPE)
    for col, field in [("longitude", "lon"), ("latitude", "lat")]:
        values = frame[col].to_numpy()
        ticks = np.rint(values * 10_000_000).astype("int32")
        if not np.array_equal(ticks / 10_000_000, values):
            raise ValueError("Input precision exceeds the spatial index contract")
        points[field] = ticks
    days = pd.to_datetime(frame.acq_date).to_numpy(dtype="datetime64[D]").astype("int64")
    if days.min()<0 or days.max()>65535:
        raise ValueError("Date outside index encoding")
    points["day"] = days
    points["flags"] = ((2 if sensor=="VIIRS" else 0) + frame.is_nrt.to_numpy(dtype="uint8")
                       + 4 * frame.index.isin(retained_indices).astype("uint8"))
    # 0 = unknown; codes 1..4 represent FIRMS types 0..3.
    points["type_code"] = frame.type.map({"0":1,"1":2,"2":3,"3":4}).fillna(0).astype("uint8")
    return points


def publish(output, parts):
    points = np.concatenate(parts)
    points = points[np.argsort(points["day"], kind="stable")]
    years = points["day"].astype("datetime64[D]").astype("datetime64[Y]").astype(int) + 1970
    directory = output / "area"
    directory.mkdir(exist_ok=True, parents=True)
    for year in np.unique(years):
        points[years==year].tofile(directory/f"{year}.bin")
