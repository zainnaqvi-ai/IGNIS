import json
from pathlib import Path
from zipfile import ZipFile

import pandas as pd
import pytest

from pipeline.inspect_inputs import PUBLIC, RAW, ROOT
from pipeline.science import FIELDS, calibrate, cell_counts, deduplicate, grid_index, integration, prepare


def fixture(sensor="MODIS", **edits):
    row = dict(latitude="31.50",longitude="74.30",brightness="313",bright_t31="290",
               scan="1.2",track="1.1",acq_date="2020-02-29",acq_time="35",satellite="Terra",
               instrument="MODIS",confidence="30",version="6.03",frp="4",daynight="N")
    if sensor=="VIIRS":
        row.update(satellite="SNPP",instrument="SNPP",confidence="n",version="2")
    return row|edits


def test_real_provenance():
    sources=json.loads((PUBLIC/"sources.json").read_text())
    assert len(sources)==8
    assert sum(s["rows"] for s in sources)==1515265
    for s in sources:
        with ZipFile(RAW/s["zip"]) as z:
            assert z.open(s["member"]).readline().decode().strip().split(",")==s["fields"]
            assert s["readme"]==z.read("Readme.txt").decode().strip()
        assert len(s["sha256"])==64 and s["request_window"]=="UNKNOWN"
        assert s["invalid"]+s["clipped"]+s["duplicates"]+s["quality_excluded"]+s["retained"]==s["rows"]


def test_schema_and_quality():
    f=pd.DataFrame([fixture("VIIRS",confidence=c) for c in ["l","n","h","90"]])
    f=f.rename(columns={"brightness":"bright_ti4","bright_t31":"bright_ti5"})
    v,invalid=prepare(f,"VIIRS")
    assert invalid==1 and v.quality.tolist()==[False,True,True]
    assert set(v.type)=={"UNKNOWN"} and v.bright_t31.iloc[0]==290
    m,invalid=prepare(pd.DataFrame([fixture(confidence=c) for c in ["29","30","100","101"]]),"MODIS")
    assert invalid==1 and m.quality.tolist()==[False,True,True]


def test_invalid_and_utc():
    rows=[fixture(),fixture(acq_date="2019-02-29"),fixture(acq_time="2400"),fixture(acq_time="1260"),
          fixture(latitude="91"),fixture(longitude="nan"),fixture(acq_date="20-01-01")]
    good,invalid=prepare(pd.DataFrame(rows),"MODIS")
    assert invalid==6 and good.acq_time.tolist()==["0035"]


def test_duplicate_archive_precedence():
    a=fixture(type="0")
    rows=[a,a,a|{"version":"6.1NRT","type":"UNKNOWN"},a|{"frp":"4.1"},a|{"acq_time":"36"}]
    frame,_=prepare(pd.DataFrame(rows),"MODIS")
    kept,removed=deduplicate(frame.assign(is_nrt=[False,False,True,False,False],src=[0,0,1,0,0]))
    assert len(kept)==3 and removed=={0:1,1:1}
    assert not kept.is_nrt.any()


def test_grid_edges_and_envelopes():
    assert grid_index(pd.Series([-180.,-179.98001,-179.98,74.02,180.]),-180,18000).tolist()==[0,0,1,12701,17999]
    assert grid_index(pd.Series([-90.,90.]),-90,9000).tolist()==[0,8999]
    for region in ["california","lahore"]:
        summary=json.loads((PUBLIC/region/"summary.json").read_text())
        a=[s["envelope"] for s in json.loads((PUBLIC/"sources.json").read_text()) if s["region"]==region]
        assert summary["envelope"]==[f(b[i] for b in a) for i,f in enumerate([min,min,max,max])]


def test_hand_calculated_union():
    a=fixture()
    m,_=prepare(pd.DataFrame([a,a|{"latitude":"31.501"},a|{"acq_date":"2020-03-01"}]),"MODIS")
    v,_=prepare(pd.DataFrame([fixture("VIIRS"),fixture("VIIRS",longitude="74.34")]),"VIIRS")
    cells,daily=integration(cell_counts(m),cell_counts(v))
    assert list(daily.loc["2020-02-29"])==[2,2,0,1,1]
    assert list(daily.loc["2020-03-01"])==[1,0,1,0,0]
    assert len(cells)==3 and cells.m.sum()+cells.v.sum()==5


def test_calibration_year_holdout_and_fallback():
    months=[]
    for year in range(2012,2019):
        for month in range(1,13):
            months.append([f"{year}-{month:02d}",10,20,10,20,10,20,0,10,20])
    supported=[r[0] for r in months]
    assert calibrate(months)["paired_months"]==84
    assert calibrate(months)["status"]=="unavailable"
    passed=calibrate(months,supported)
    assert passed["status"]=="validated" and passed["candidate"]==2
    assert passed["holdout_years"]==["2017","2018"] and passed["holdout_n"]==24
    for row in months[-24:]:
        row[6]=10
    failed=calibrate(months,supported)
    assert failed["status"]=="unavailable" and failed["baseline_mae"]==0
    for region,n in [("lahore",116),("california",179)]:
        c=json.loads((PUBLIC/region/"summary.json").read_text())["calibration"]
        assert c["status"]=="unavailable" and c["paired_months"]==n and "candidate" not in c


def test_complete_static_assets():
    for region in ["california","lahore"]:
        d=PUBLIC/region;s=json.loads((d/"summary.json").read_text())
        assert s["columns"]==FIELDS and s["last"]=="2026-11-13"
        assert len(list((d/"maps").glob("*.json")))==27
        assert (d/"overview.json").stat().st_size<300_000 and (d/"backdrop.json").stat().st_size>0
    for asset in ["index.html","app.js","styles.css","model.js","map.js","vendor/leaflet.js","vendor/leaflet.css"]:
        assert (ROOT/"site"/asset).is_file()
