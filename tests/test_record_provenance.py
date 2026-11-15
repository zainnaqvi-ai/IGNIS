"""Check the complete point projection offered by the limited-field download."""
import hashlib
import json
from collections import defaultdict
from zipfile import ZipFile

import numpy as np
import pandas as pd
import pytest

from pipeline.inspect_inputs import PUBLIC, RAW


@pytest.mark.parametrize("region", ["lahore", "california"])
def test_every_indexed_record_matches_a_supplied_detection(region):
    sources = json.loads((PUBLIC / "sources.json").read_text())
    expected = defaultdict(list)
    # Interpret the file contract independently of the production packer.
    layout = [("lon", "<i4"), ("lat", "<i4"), ("date", "<u2"),
              ("flags", "u1"), ("class", "u1")]
    for name in {s["zip"] for s in sources if s["region"] == region}:
        with (RAW / name).open("rb") as stream:
            digest = hashlib.file_digest(stream, "sha256").hexdigest()
        with ZipFile(RAW / name) as archive:
            for source in (s for s in sources if s["zip"] == name):
                assert digest == source["sha256"]
                assert source["invalid"] == source["duplicates"] == source["clipped"] == 0
                nrt = source["member"].startswith("fire_nrt_")
                viirs = "SV-C2" in name
                assert source["status"] == ("nrt" if nrt else "archive")
                assert source["sensor"] == ("VIIRS" if viirs else "MODIS")
                read_rows = 0
                with archive.open(source["member"]) as stream:
                    for frame in pd.read_csv(stream, dtype=str, chunksize=100_000, keep_default_na=False):
                        read_rows += len(frame)
                        points = np.empty(len(frame), dtype=layout)
                        for column, field in [("longitude", "lon"), ("latitude", "lat")]:
                            values = frame[column].astype(float)
                            points[field] = np.rint(values * 1e7).astype("int32")
                            assert np.array_equal(points[field] / 1e7, values)
                        dates = pd.to_datetime(frame.acq_date, format="%Y-%m-%d")
                        points["date"] = (dates - pd.Timestamp("1970-01-01")).dt.days
                        valid_quality = (frame.confidence.isin(["n", "h"]) if viirs
                                         else frame.confidence.astype(int).ge(30))
                        points["flags"] = int(nrt) + 2 * int(viirs) + 4 * valid_quality.astype(int)
                        assert ("type" not in frame) == nrt
                        points["class"] = 0 if nrt else frame.type.astype(int) + 1
                        for year, pos in frame.groupby(dates.dt.year).indices.items():
                            expected[int(year)].append(points[pos])
                assert read_rows == source["rows"]
    files = {int(p.stem): p for p in (PUBLIC / region / "area").glob("*.bin")}
    assert set(expected) == set(files)
    for year, chunks in expected.items():
        original = np.concatenate(chunks).view("V12")
        published = np.fromfile(files[year], dtype="V12")
        # Multiset equality covers multiplicity, including detections which
        # differ in raw columns outside the 12-byte projection.
        assert np.array_equal(np.sort(original), np.sort(published)), year
