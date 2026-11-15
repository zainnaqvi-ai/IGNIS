"""Build compact static data directly from local ZIP streams."""
import argparse
import json
from .area_index import pack, publish
from .matched_agreement import calendar_diagnostic
from zipfile import ZipFile

import pandas as pd

from .inspect_inputs import PUBLIC, RAW, REGIONS, ROOT, chunks, inventory, save_json, write_manifest
from .science import FIELDS, calibrate, overlap_diagnostic, cell_counts, deduplicate, integration, prepare


def records(table):
    return [[str(index), *map(int,row)] for index,row in zip(table.index, table.to_numpy())]


def build_region(region, sources):
    output = PUBLIC / region
    raw_series, grids, samples, index_parts = [], [], [], []
    for sensor, suffix in [("MODIS","m"),("VIIRS","v")]:
        frames = []
        for s in (s for s in sources if s["sensor"]==sensor):
            date_counts = []
            s.update(parsed=s["rows"],invalid=0,clipped=0,duplicates=0,quality_excluded=0,retained=0)
            with ZipFile(RAW / s["zip"]) as archive:
                for frame in chunks(archive,s["member"]):
                    date_counts.append(frame.groupby("acq_date").size())
                    frame, invalid = prepare(frame, sensor)
                    s["invalid"] += invalid
                    frames.append(frame.assign(src=s["id"],is_nrt=s["status"]=="nrt"))
            dates = pd.concat(date_counts).groupby(level=0).sum()
            dates = dates[pd.to_datetime(dates.index,format="%Y-%m-%d",errors="coerce").notna()]
            raw_series.append(dates.rename(f"{s['status']}_{suffix}"))
        original = pd.concat(frames,ignore_index=True)
        del frames
        frame, removed = deduplicate(original)
        for s in (s for s in sources if s["sensor"]==sensor):
            s["raw_type_counts"] = original.loc[original.src==s["id"],"type"].value_counts().to_dict()
        index_parts.append(pack(original, frame.index[frame.quality], sensor))
        del original
        for s in (s for s in sources if s["sensor"]==sensor):
            group = frame.loc[frame.src==s["id"]]
            s.update(duplicates=int(removed.get(s["id"],0)),quality_excluded=int((~group.quality).sum()),
                     retained=int(group.quality.sum()))
        grids.append(cell_counts(frame.loc[frame.quality]))
        # Uniform deterministic ordering within each day/sensor/quality group.
        ordered = frame.sample(frac=1,random_state=847785)
        samples.append(ordered.groupby(["acq_date","quality"]).head(8))
        del frame, ordered

    publish(output, index_parts)
    cells, daily = integration(*grids)
    work = ROOT / "data/work"
    work.mkdir(exist_ok=True, parents=True)
    cells.to_csv(work / f"{region}-cells.csv.gz",compression="gzip")
    daily = pd.concat([daily,*raw_series],axis=1).fillna(0).astype(int).sort_index()
    for k in ("m","v"):
        daily["raw_"+k] = daily["archive_"+k]+daily["nrt_"+k]
    daily = daily[FIELDS[1:]]
    monthly = records(daily.groupby(daily.index.str[:7]).sum())
    summary = dict(region=region, first=daily.index[0],last=daily.index[-1],columns=FIELDS,
                   envelope=[f(s["envelope"][i] for s in sources) for i,f in enumerate([min,min,max,max])],
                   daily=records(daily),monthly=monthly,calibration=calibrate(monthly),overlap_diagnostic=overlap_diagnostic(monthly))
    summary["common_date_diagnostic"] = calendar_diagnostic(summary["daily"])
    save_json(output/"summary.json", summary)
    points = pd.concat(samples).sort_values("acq_date",kind="stable")
    overview = []
    for year, group in points.groupby(points.acq_date.str[:4]):
        partitions = {}
        for month, g in group.groupby(group.acq_date.str[:7]):
            rows = []
            for r in g.itertuples(index=False):
                rows.append([int(r.acq_date[-2:]),r.acq_time,r.latitude,r.longitude,int(r.src),
                             r.satellite,r.confidence,None if pd.isna(r.frp) else r.frp,r.daynight,
                             r.type,r.version,int(r.quality)])
            partitions[month] = rows
            # Representatives for the all-history map only. Preserve sensor/quality strata.
            featured = g.groupby(["src","quality"],group_keys=False).head(0)
            for _, candidates in g.groupby(["src","quality"]):
                featured = pd.concat([featured,candidates.sample(min(3,len(candidates)),random_state=709)])
            lookup = {(r[0],r[1],r[2],r[3],r[4]):r for r in rows}
            for r in featured.itertuples(index=False):
                overview.append([month,*lookup[(int(r.acq_date[-2:]),r.acq_time,r.latitude,r.longitude,r.src)]])
        save_json(output/"maps"/f"{year}.json",partitions)
    save_json(output/"overview.json",overview)
    print(region, len(cells), summary["calibration"],flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--audited",action="store_true",help="Reuse inventory just produced for these unchanged inputs")
    args = parser.parse_args()
    sources = json.loads((PUBLIC/"sources.json").read_text()) if args.audited else inventory()
    for region in REGIONS:
        build_region(region,[s for s in sources if s["region"]==region])
    write_manifest(sources)


if __name__ == "__main__":
    main()
