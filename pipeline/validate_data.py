"""Check shipped analytics against cell records and raw ZIP inventory."""
import hashlib
import json
from zipfile import ZipFile

import pandas as pd

from .inspect_inputs import PUBLIC, RAW, ROOT, REGIONS
from .science import FIELDS


def validate():
    sources = json.loads((PUBLIC/"sources.json").read_text())
    assert len(sources)==8 and len(set(s["zip"] for s in sources))==4
    for region in REGIONS:
        subset = [s for s in sources if s["region"]==region]
        summary = json.loads((PUBLIC/region/"summary.json").read_text())
        daily = pd.DataFrame(summary["daily"],columns=FIELDS).set_index("period")
        monthly = pd.DataFrame(summary["monthly"],columns=FIELDS).set_index("period")
        pd.testing.assert_frame_equal(daily.groupby(daily.index.str[:7]).sum(),monthly)
        cells = pd.read_csv(ROOT/f"data/work/{region}-cells.csv.gz")
        assert not cells.duplicated(["acq_date","x","y"]).any()
        assert cells.m.ge(0).all() and cells.v.ge(0).all()
        assert (cells.m+cells.v).gt(0).all()
        ledger = cells.assign(only_m=(cells.m>0)&(cells.v==0),only_v=(cells.v>0)&(cells.m==0),
                              both=(cells.m>0)&(cells.v>0)).groupby("acq_date")[["m","v","only_m","only_v","both"]].sum()
        ledger.columns = ["kept_m","kept_v","only_m","only_v","both"]
        assert (ledger.reindex(daily.index,fill_value=0).to_numpy()==daily[ledger.columns].to_numpy()).all()
        for s in subset:
            assert s["rows"]==sum(s[k] for k in ("invalid","clipped","duplicates","quality_excluded","retained"))
            with ZipFile(RAW/s["zip"]) as z:
                with z.open(s["member"]) as f:
                    assert sum(1 for _ in f)-1==s["rows"]
        for sensor,k in [("MODIS","m"),("VIIRS","v")]:
            a,n = sorted((s for s in subset if s["sensor"]==sensor),key=lambda s:s["status"])
            with (RAW/a["zip"]).open("rb") as f:
                assert hashlib.file_digest(f,"sha256").hexdigest()==a["sha256"]==n["sha256"]
            assert a["rows"]==daily["archive_"+k].sum()
            assert a["rows"]+n["rows"]==daily["raw_"+k].sum()
            assert a["retained"]+n["retained"]==daily["kept_"+k].sum()
        assert summary["calibration"]["supported_months"]==0
        for path in (PUBLIC/region/"maps").glob("*.json"):
            for month,points in json.loads(path.read_text()).items():
                for day,hhmm,lat,lon,src,*other in points:
                    assert month.startswith(path.stem) and sources[src]["region"]==region
                    date = f"{month}-{day:02}"
                    assert sources[src]["first"]<=date<=sources[src]["last"]
                    assert len(hhmm)==4 and -90<=lat<=90 and -180<=lon<=180
        print(region, f"{len(cells):,} occupied cell-days verified")
    return sources


if __name__=="__main__":
    validate()
