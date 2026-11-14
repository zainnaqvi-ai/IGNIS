"""Inventory only configured exports. Never extract or execute ZIP contents."""
import csv
import hashlib
import json
import re
from pathlib import Path
from zipfile import ZipFile

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data/raw"
PUBLIC = ROOT / "site/data"
REGIONS = json.loads((ROOT / "config/regions.json").read_text())
MANIFEST = ROOT / "config/source_manifest.csv"


def save_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, separators=(",", ":"), allow_nan=False), encoding="utf-8")


def chunks(archive, member):
    with archive.open(member) as stream:
        yield from pd.read_csv(stream, dtype=str, chunksize=100_000, keep_default_na=False)


def inventory():
    sources = []
    for region, config in REGIONS.items():
        for sensor, name in config["files"].items():
            path = RAW / name
            with path.open("rb") as stream:
                sha = hashlib.file_digest(stream, "sha256").hexdigest()
            with ZipFile(path) as archive:
                if archive.testzip():
                    raise ValueError(f"CRC failure: {name}")
                names = archive.namelist()
                readme = archive.read("Readme.txt").decode("utf-8-sig").strip()
                members = sorted(n for n in names if re.fullmatch(r"fire_(archive|nrt)_[\w-]+\.csv", n))
                if len(members) != 2 or not all(sum(f"_{k}_" in n for n in members) == 1 for k in ("archive", "nrt")):
                    raise ValueError(f"Unexpected CSV member set: {names}")
                for member in members:
                    s = dict(id=len(sources), region=region, sensor=sensor, zip=name, member=member,
                             status=member.split("_")[1], sha256=sha, request_id=re.search(r"_(\d+)\.csv",member)[1],
                             request_window="UNKNOWN", request_bounds="UNKNOWN", readme=readme,
                             extra_members=[n for n in names if n not in [*members,"Readme.txt"]])
                    rows, nulls, values, bounds, dates = 0, {}, {}, [], []
                    for frame in chunks(archive, member):
                        rows += len(frame)
                        s["fields"] = list(frame)
                        for col, count in frame.eq("").sum().items():
                            nulls[col] = nulls.get(col, 0) + int(count)
                        for col in ("version","satellite","instrument","confidence","daynight","type"):
                            values.setdefault(col,set()).update(frame[col].unique() if col in frame else ["UNKNOWN"])
                        x = pd.to_numeric(frame.longitude, errors="coerce")
                        y = pd.to_numeric(frame.latitude, errors="coerce")
                        bounds.append([x.min(), y.min(), x.max(), y.max()])
                        valid_dates = pd.to_datetime(frame.acq_date,format="%Y-%m-%d",errors="coerce").dropna()
                        if len(valid_dates):
                            dates.extend([valid_dates.min().date().isoformat(),valid_dates.max().date().isoformat()])
                    s.update(rows=rows, nulls=nulls, values={k:sorted(v) for k,v in values.items()},
                             first=min(dates,default=None),last=max(dates,default=None),
                             envelope=[f(a[i] for a in bounds) for i,f in enumerate([min,min,max,max])])
                    sources.append(s)
    write_manifest(sources)
    return sources


def write_manifest(sources):
    with MANIFEST.open("w", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(sources[0]))
        writer.writeheader()
        for s in sources:
            writer.writerow({k:json.dumps(v) if isinstance(v,(list,dict)) else v for k,v in s.items()})
    save_json(PUBLIC / "sources.json", sources)


if __name__ == "__main__":
    for item in inventory():
        print(item["region"], item["member"], item["rows"], item["first"], item["last"])
