"""Independent October support and occupancy audit from every original ZIP.

No model eligibility helpers or precomputed ledgers are used for expectations.
Parent and interior AOIs are checked against the browser's unsampled indices.
"""
import csv
import io
import json
import subprocess
from collections import Counter, defaultdict
from decimal import Decimal
from zipfile import ZipFile

from pipeline.inspect_inputs import PUBLIC, RAW, ROOT


def test_october_reference_reasons_from_original_observations():
    bounds = {"california": [-123, 35, -119, 40], "lahore": [74.2, 31.4, 74.5, 31.6]}
    counts, nrt, cells = Counter(), Counter(), defaultdict(set)
    for source in json.loads((PUBLIC / "sources.json").read_text()):
        region, sensor = source["region"], source["sensor"]
        w, s, e, n = bounds[region]
        with ZipFile(RAW / source["zip"]) as archive, archive.open(source["member"]) as f:
            for row in csv.DictReader(io.TextIOWrapper(f, encoding="utf-8")):
                date = row["acq_date"]
                if date[5:7] != "10":
                    continue
                lon, lat = Decimal(row["longitude"]), Decimal(row["latitude"])
                scopes = ["parent"] + (["aoi"] if w <= lon <= e and s <= lat <= n else [])
                retained = int(row["confidence"]) >= 30 if sensor == "MODIS" else row["confidence"] in ("n", "h")
                for scope in scopes:
                    k = (region, scope, date, sensor)
                    counts[k] += 1
                    if source["status"] == "nrt":
                        nrt[k] += 1
                    if retained:
                        cells[k].add(((lon+180)//Decimal(".02"), (lat+90)//Decimal(".02")))
    script = """
      import fs from 'node:fs';
      import {referencePeriods,recordedDistribution,referenceAudit} from './site/model.js';
      import {queryYear} from './site/area.js';
      const bounds={california:[-123,35,-119,40],lahore:[74.2,31.4,74.5,31.6]};
      for(const region of ['california','lahore'])for(const scope of ['parent','aoi']){
        const s=JSON.parse(fs.readFileSync(`site/data/${region}/summary.json`));
        let daily=s.daily;
        if(scope==='aoi'){
          daily=[];
          for(let year=2000;year<=2026;year++){
            const b=fs.readFileSync(`site/data/${region}/area/${year}.bin`);
            daily.push(...queryYear(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),bounds[region],0,65535));
          }
        }
        for(const month of ['2003-10','2026-10'])for(const mode of ['integrated','MODIS','VIIRS'])for(const measure of ['raw','cells']){
          const periods=referencePeriods(daily,month,s.first,s.last,mode,measure);
          const values=periods.filter(x=>x.comparable);
          const ref=recordedDistribution(values,month,'earlier');
          console.log(JSON.stringify({region,scope,month,mode,measure,periods,ref,audit:referenceAudit(periods,month,'earlier')}));
        }
      }
    """
    output = subprocess.check_output(["node", "--input-type=module", "-e", script], cwd=ROOT)
    results = [json.loads(line) for line in output.splitlines()]
    assert len(results) == 48
    for result in results:
        region, scope, mode = result["region"], result["scope"], result["mode"]
        target_year = int(result["month"][:4])
        eligible = []
        for period in result["periods"]:
            year = int(period["m"][:4])
            issues = []
            if year == 2000:
                issues.append("outside_date_filter")
            # October is always entirely in a single configuration.
            def era(y):
                if mode == "VIIRS":
                    return y >= 2012
                return (y >= 2002, y >= 2012 if mode == "integrated" else None)
            if era(year) != era(target_year):
                issues.append("sensor_configuration")
            if issues:
                assert not period["comparable"] and period["referenceIssues"] == issues
                continue
            active = [s for s in ("MODIS", "VIIRS") if (mode == "integrated" or mode == s) and (s == "MODIS" or year >= 2012)]
            if not active:
                issues.append("platform_unavailable")
            if year == 2002 and mode != "VIIRS":
                issues.append("historical_gap_advisory")
            dates = [f"{year}-10-{day:02}" for day in range(1, 32)]
            expected_value = 0
            support = {}
            for sensor in ("MODIS", "VIIRS"):
                keys = [(region, scope, d, sensor) for d in dates] if sensor in active else []
                support[sensor] = {"requiredDays": len(keys), "daysWithRecords": sum(counts[k] > 0 for k in keys), "nrtDays": sum(nrt[k] > 0 for k in keys)}
            for date in dates:
                keys = [(region, scope, date, sensor) for sensor in active]
                expected_value += sum(counts[k] for k in keys) if result["measure"] == "raw" else len(set().union(*(cells[k] for k in keys)))
            if any(s["nrtDays"] for s in support.values()):
                issues.append("nrt_records")
            if any(s["daysWithRecords"] < s["requiredDays"] for s in support.values()):
                issues.append("record_gaps")
            assert period["support"] == support
            assert period["referenceIssues"] == issues
            assert period["v"] == expected_value
            assert period["dailyArchiveSupport"] == (not issues)
            if not issues and year < target_year:
                eligible.append(str(year))
        assert result["ref"]["years"] == eligible
        assert result["ref"]["n"] == len(eligible)
        assert not result["ref"]["available"]
        assert [r["period"][:4] for r in result["audit"] if r["eligible"]] == eligible
    ca = next(r for r in results if r["region"] == "california" and r["scope"] == "parent" and r["month"] == "2026-10" and r["mode"] == "integrated")
    assert ca["ref"]["years"] == ["2013", "2015", "2016", "2017", "2019", "2020", "2023", "2024"]
    assert ca["ref"]["reasonCode"] == "nrt_records"
