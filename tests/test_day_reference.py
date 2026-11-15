"""Independently compare exported reference values to original FIRMS CSVs."""
import csv
import io
import json
import statistics
import numpy as np
import pytest
import subprocess
from collections import defaultdict
from decimal import Decimal
from zipfile import ZipFile

from pipeline.inspect_inputs import PUBLIC, RAW, ROOT


def test_lahore_november_5_day_reference():
    index = json.loads((PUBLIC / "sources.json").read_text())
    sensors, nrt, occupied = defaultdict(set), set(), defaultdict(set)
    for source in index:
        if source["region"] != "lahore":
            continue
        with ZipFile(RAW / source["zip"]) as archive, archive.open(source["member"]) as f:
            for row in csv.DictReader(io.TextIOWrapper(f, encoding="utf-8")):
                date = row["acq_date"]
                # Nov 5 after S-NPP's start and before the end of its mission.
                if date[5:] != "11-05" or not "2012" <= date[:4] <= "2025":
                    continue
                if source["status"] == "nrt":
                    nrt.add(date)
                    continue
                sensors[date].add(source["sensor"])
                kept = (int(row["confidence"]) >= 30 if source["sensor"] == "MODIS"
                        else row["confidence"] in ("n", "h"))
                if kept:
                    x = (Decimal(row["longitude"]) + 180) // Decimal(".02")
                    y = (Decimal(row["latitude"]) + 90) // Decimal(".02")
                    occupied[date].add((x, y))
    target = "2021-11-05"
    peers = [len(occupied[d]) for d, seen in sensors.items()
             if d != target and d not in nrt and seen == {"MODIS", "VIIRS"}]
    script = """
        import fs from "node:fs";
        import {rowsForExport} from "./site/model.js";
        const s=JSON.parse(fs.readFileSync("site/data/lahore/summary.json"));
        for(const frequency of ["daily","monthly"]){
          const [r]=rowsForExport({daily:s.daily,start:"2021-11-05",end:"2021-11-05",
            contextStart:s.first,contextEnd:s.last,frequency,mode:"integrated",sourceIds:[]});
          console.log(JSON.stringify(r));
        }
    """
    result = subprocess.check_output(["node", "--input-type=module", "-e", script], cwd=ROOT)
    assert len(result.splitlines()) == 2
    for text in result.splitlines():
        row = json.loads(text)
        assert row["reference_from_utc"] == row["reference_to_utc"] == target
        assert row["recorded_value"] == len(occupied[target]) == 57
        assert row["recorded_reference_n"] == len(peers) == 8
        assert row["recorded_reference_median"] == statistics.median(peers) == 22
        assert row["recorded_reference_q25"] == pytest.approx(np.quantile(peers,.25))
        assert row["recorded_reference_q75"] == pytest.approx(np.quantile(peers,.75))
        assert row["recorded_reference_p10"] == pytest.approx(np.quantile(peers,.1))
        assert row["recorded_reference_p90"] == pytest.approx(np.quantile(peers,.9))
        mad=statistics.median(abs(v-22) for v in peers)
        assert row["recorded_reference_mad"] == mad
        assert row["recorded_mad_units"] == pytest.approx((57-22)/mad)
        assert row["recorded_robust_deviation"] == pytest.approx((57-22)/(1.4826*mad))
        assert row["recorded_unusualness"] == "Higher than usual recorded activity"
        assert row["recorded_midrank_percentile"] == 100*(sum(v<57 for v in peers)+.5*peers.count(57))/len(peers)
        assert row["comparable_baseline_n"] == 0
