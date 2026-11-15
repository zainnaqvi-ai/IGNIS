"""Run explicitly with a local server; uses optional Playwright and installed Edge."""
import argparse
import csv
import functools
import re
import io
import json
import xml.etree.ElementTree as ET
from collections import Counter
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Thread
from zipfile import ZipFile

from playwright.sync_api import expect, sync_playwright

ROOT=Path(__file__).resolve().parents[1]

def download(page,label,path):
    with page.expect_download() as info:
        page.get_by_role("button",name=label).click()
    info.value.save_as(path)


def journey(url,channel):
    errors=[]
    with sync_playwright() as p, TemporaryDirectory() as tmp:
        browser=p.chromium.launch(channel=channel,headless=True,args=["--no-proxy-server"])
        page=browser.new_page(viewport={"width":1440,"height":960},accept_downloads=True)
        page.on("pageerror",lambda error:errors.append(str(error)))
        page.goto(url,wait_until="domcontentloaded")
        expect(page.locator("#mapCount")).to_contain_text("sampled points shown")
        expect(page.locator("#union")).to_have_text("19,724")
        expect(page.locator(".metrics .metric")).to_have_count(3)
        expect(page.locator("#modisLabel")).to_have_text("MODIS cell-days")
        expect(page.locator("#viirsLabel")).to_have_text("VIIRS cell-days")
        for removed in ["#overlap","#sensorIncrement","#audit",".coveragebox"]:
            expect(page.locator(removed)).to_have_count(0)
        for phrase in ["PASS", "NOT VALIDATED", "MAE", "N = 0", "sensor-days"]:
            assert phrase not in page.locator("main").inner_text()
        page.locator("#exportOpen").click()
        expect(page.get_by_role("button",name="Download hotspot records CSV")).to_be_disabled()
        page.keyboard.press("Escape")
        page.route("https://tile.openstreetmap.org/**",lambda route:route.abort())
        page.locator("#streets").click()
        expect(page.locator("#streets")).not_to_be_checked()
        expect(page.locator("#mapDesc")).to_contain_text("offline geography")
        work=ROOT/"data/work";work.mkdir(exist_ok=True,parents=True)
        page.evaluate("window.scrollTo(0,0)")
        page.screenshot(path=work/"desktop.png",full_page=True)
        # Both reported October cases, each sensor and both distinct measures.
        for region in ("california", "lahore"):
            page.locator("#region").select_option(region)
            expect(page.locator("#exportOpen")).to_be_enabled()
            for month in ("2003-10", "2026-10"):
                page.locator("#monthPick").fill(month)
                for mode in ("integrated", "MODIS", "VIIRS"):
                    page.locator(f'[data-mode="{mode}"]').click()
                    expected_n = 0 if month == "2003-10" else {"california": {"integrated": 8, "MODIS": 13, "VIIRS": 14}, "lahore": {"integrated": 0, "MODIS": 0, "VIIRS": 5}}[region][mode]
                    for measure in ("raw", "cells"):
                        page.locator("#measure").select_option(measure)
                        expect(page.locator("#baselineText")).to_contain_text(f"{expected_n} reference-eligible")
                        note = page.locator("#measurementNote")
                        if measure == "raw":
                            expect(note).to_contain_text("Raw detections count source records")
                            expect(note).not_to_contain_text("Cell-days")
                            if mode == "integrated":
                                expect(page.locator("#metricLabel")).to_have_text("Combined raw detections")
                        else:
                            expect(note).to_contain_text("Cell-days measure occupied grid cells")
                        if month == "2026-10":
                            expect(page.locator("#histReadout")).to_contain_text("contains NRT records")
                            expect(page.locator("#unusualLabel")).to_have_text("Selected period not comparable")
                            expect(page.locator("#historyChart button")).to_have_count(25 if mode == "MODIS" else 15)
                        elif mode == "VIIRS":
                            expect(page.locator("#unusualLabel")).to_have_text("Sensor unavailable")
                        elif region == "california":
                            expect(page.locator("#histReadout")).to_contain_text("Only 0 eligible earlier years")
                        else:
                            expect(page.locator("#histReadout")).to_contain_text("lacks daily archive records")
                if region == "california" and month == "2026-10":
                    page.locator('[data-mode="integrated"]').click()
                    page.locator("#exportOpen").click()
                    case_path=Path(tmp)/"october.csv"
                    download(page,"Download monthly CSV",case_path)
                    with case_path.open(newline="") as f: case=next(csv.DictReader(f))
                    assert case["recorded_value"]=="1464" and case["recorded_reference_n"]=="8"
                    assert case["recorded_reference_median"]=="" and "nrt_records" in case["recorded_target_issues"]
                    audit=json.loads(case["reference_eligibility"])
                    assert sum(r["eligible"] for r in audit)==8
                    page.keyboard.press("Escape")
                    page.locator(".panel").filter(has=page.locator("#referenceStats")).screenshot(path=work/"october-reference.png")
        page.locator('[data-mode="integrated"]').click()
        page.locator("#region").select_option("california")
        expect(page.locator("#union")).to_have_text("382,271")
        page.locator("#highMonths summary").click()
        page.get_by_role("button",name=re.compile(r"Sep 2020 · 17,272 cell-days")).last.click()
        expect(page.locator("#union")).to_have_text("17,272")
        expect(page.locator('[data-month="2020-09"]')).to_have_attribute("aria-pressed","true")
        expect(page.locator("#mapCount")).to_contain_text("155,825 retained")
        expect(page.locator("#seasonDesc")).to_contain_text("totals · full date filter")
        page.get_by_text("Inspect mapped observations",exact=True).click()
        page.locator("#samples button").first.click()
        expect(page.locator(".leaflet-popup-content")).to_contain_text("UTC")
        expect(page.locator(".leaflet-popup-content")).to_contain_text("FRP")
        page.locator(".leaflet-popup-close-button").click()
        expect(page.locator("#baselineText")).not_to_contain_text("N = 0")
        page.locator("#exportOpen").click()
        with page.expect_download() as info:
            page.get_by_role("button",name="Download monthly CSV").click()
        path=Path(tmp)/"month.csv";info.value.save_as(path)
        with path.open(newline="") as f: rows=list(csv.DictReader(f))
        assert len(rows)==1 and rows[0]["period"]=="2020-09" and rows[0]["recorded_value"]=="17272"
        svg_path=Path(tmp)/"calendar.svg"
        download(page,"Download calendar SVG",svg_path)
        svg=ET.parse(svg_path).getroot()
        ns={"s":"http://www.w3.org/2000/svg"}
        selected=[g for g in svg.findall(".//s:g",ns) if g.find("s:rect[@stroke]",ns) is not None]
        assert len(selected)==1 and selected[0].find("s:text",ns).text=="17,272"
        assert "Sep 2020" in selected[0].find("s:title",ns).text
        assert svg.find("s:desc",ns).text.count("2000-11-01 to 2026-11-13 UTC")==1
        assert len(svg.findall(".//s:g/s:title",ns))==27*12
        points_path=Path(tmp)/"points.csv"
        download(page,"Download hotspot records CSV",points_path)
        with points_path.open(newline="") as f:
            records=0
            for row in csv.DictReader(f):
                assert row["acq_date_utc"].startswith("2020-09") and row["grid_retained"]=="true"
                records+=1
        assert records==155825
        page.keyboard.press("Escape")
        # Draw inside the California envelope, then inspect a month in that AOI.
        page.locator("#clearMonth").click()
        page.locator("#fitMap").click()
        page.locator("#map").scroll_into_view_if_needed()
        page.locator("#drawArea").click()
        box=page.locator("#map").bounding_box()
        def drag(x1,y1,x2,y2):
            page.mouse.move(box["x"]+x1*box["width"],box["y"]+y1*box["height"])
            page.mouse.down()
            page.mouse.move(box["x"]+x2*box["width"],box["y"]+y2*box["height"],steps=12)
            page.mouse.up()
        drag(.39,.25,.61,.75)
        assert "inside the dashed" not in page.locator("#areaHint").inner_text() or "Drag" in page.locator("#areaHint").inner_text(),page.locator("#areaHint").inner_text()
        expect(page.locator("#areaName")).to_have_text("Custom area",timeout=10000)
        page.locator("#monthPick").fill("2020-09")
        expect(page.locator("#mapCount")).to_contain_text("sampled points shown")
        custom=int(page.locator("#union").inner_text().replace(",",""))
        assert 0<custom<17272
        page.locator("#samples button").first.click()
        expect(page.locator(".leaflet-popup-content")).to_contain_text("FRP")
        page.locator(".leaflet-popup-close-button").click()
        expect(page.locator("#baselineText")).not_to_contain_text("N = 0")
        page.locator("#exportOpen").click()
        with page.expect_download() as info:
            page.get_by_role("button",name="Download monthly CSV").click()
        info.value.save_as(path)
        with path.open(newline="") as f: record=next(csv.DictReader(f))
        assert int(record["recorded_value"])==custom and record["area"]=="custom"
        page.keyboard.press("Escape")
        original=page.locator("#areaExtent").inner_text()
        page.locator("#editArea").click()
        box=page.locator("#map").bounding_box()
        drag(.61,.75,.58,.69)
        expect(page.locator("#areaExtent")).not_to_have_text(original)
        page.locator(".areaInfo summary").click()
        for name,value in zip(("west","south","east","north"),(-123.1,37.2,-119.2,41.3)):
            page.locator("#"+name).fill(str(value))
        page.get_by_role("button",name="Apply bounds").click()
        expect(page.locator("#areaExtent")).to_contain_text("-123.1")
        # Preserve a narrowed UTC interval and both filters through an AOI reset.
        page.locator("#start").fill("2020-09-06")
        expect(page.locator("#exportOpen")).to_be_enabled()
        page.locator("#end").fill("2020-09-10")
        expect(page.locator("#exportOpen")).to_be_enabled()
        page.locator('[data-mode="MODIS"]').click()
        page.locator("#measure").select_option("raw")
        value=int(page.locator("#union").inner_text().replace(",",""))
        assert value>0
        expect(page.locator("#mraw")).to_have_text(page.locator("#union").inner_text())
        expect(page.locator('[data-month="2020-09"]')).to_have_attribute("aria-label",re.compile(f"{value:,} detections"))
        expect(page.locator("#mapCount")).to_contain_text(f"{value:,} raw observations")
        page.locator("#exportOpen").click()
        with page.expect_download() as info:
            page.get_by_role("button",name="Download daily CSV").click()
        info.value.save_as(path)
        with path.open(newline="") as f: rows=list(csv.DictReader(f))
        assert len(rows)==5 and sum(int(r["recorded_value"] or 0) for r in rows)==value
        assert all(r["mode"]=="MODIS" and r["measure"]=="raw" and r["bounds_wsen"]=="-123.1|37.2|-119.2|41.3" for r in rows)
        download(page,"Download hotspot records CSV",points_path)
        with points_path.open(newline="") as f:
            actual=Counter((r["acq_date_utc"],float(r["longitude"]),float(r["latitude"]),r["firms_type"],r["grid_retained"],r["source_member"]) for r in csv.DictReader(f))
        sources=json.loads((ROOT/"site/data/sources.json").read_text())
        source=next(s for s in sources if s["region"]=="california" and s["sensor"]=="MODIS" and s["status"]=="archive")
        expected=Counter()
        with ZipFile(ROOT/"data/raw"/source["zip"]) as z, z.open(source["member"]) as member:
            for r in csv.DictReader(io.TextIOWrapper(member,encoding="utf-8")):
                if "2020-09-06"<=r["acq_date"]<="2020-09-10":
                    lon,lat=float(r["longitude"]),float(r["latitude"])
                    if -123.1<=lon<=-119.2 and 37.2<=lat<=41.3:
                        expected[(r["acq_date"],lon,lat,r["type"],str(int(r["confidence"])>=30).lower(),source["member"])]+=1
        assert actual==expected and sum(actual.values())==value
        page.keyboard.press("Escape")
        page.locator("#west").fill("-150")
        page.get_by_role("button",name="Apply bounds").click()
        expect(page.locator("#areaHint")).to_contain_text("inside")
        page.locator("#resetArea").click()
        expect(page.locator("#start")).to_have_value("2020-09-06")
        expect(page.locator("#end")).to_have_value("2020-09-10")
        expect(page.locator("#measure")).to_have_value("raw")
        expect(page.locator('[data-mode="MODIS"]')).to_have_attribute("aria-pressed","true")
        page.locator("#reset").click()
        page.locator("#measure").select_option("cells")
        page.locator('[data-mode="integrated"]').click()
        page.locator("#monthPick").fill("2020-09")
        expect(page.locator("#union")).to_have_text("17,272")
        page.locator('[data-day="2020-09-08"]').click()
        expect(page.locator("#metricScope")).to_contain_text("08 Sep 2020")
        page.locator("#region").select_option("lahore")
        expect(page.locator("#union")).to_have_text("19,724")
        page.locator("#monthPick").fill("2021-11")
        page.locator('[data-day="2021-11-05"]').click()
        expect(page.locator("#union")).to_have_text("57")
        expect(page.locator("#histReadout")).to_contain_text("22")
        expect(page.locator("#referencePolicy")).to_have_value("earlier")
        expect(page.locator("#histReadout")).to_contain_text("6 eligible earlier years")
        expect(page.locator("#unusualLabel")).to_have_text("Not enough comparable history")
        page.locator("#referencePolicy").select_option("other")
        expect(page.locator("#histReadout")).to_contain_text("8 eligible other years")
        expect(page.locator("#referenceStats")).to_contain_text("Middle 50%: 11–25.5 cell-days")
        expect(page.locator("#unusualLabel")).to_have_text("Higher than usual recorded activity")
        page.locator("#exportOpen").click()
        download(page,"Download daily CSV",path)
        with path.open(newline="") as f: score_row=next(csv.DictReader(f))
        assert abs(float(score_row["recorded_robust_deviation"])-35/(1.4826*8))<1e-12
        assert score_row["recorded_unusualness"]=="Higher than usual recorded activity"
        page.keyboard.press("Escape")
        page.locator(".panel").filter(has=page.locator("#referenceStats")).screenshot(path=work/"reference-panel.png")
        page.locator("#referencePolicy").select_option("earlier")
        expect(page.locator("#histReadout")).to_contain_text("6 eligible earlier years")
        expect(page.locator("#unusualLabel")).to_have_text("Not enough comparable history")
        page.locator("#exportOpen").click()
        download(page,"Download daily CSV",path)
        with path.open(newline="") as f: reference_row=next(csv.DictReader(f))
        assert reference_row["reference_policy"]=="earlier" and reference_row["recorded_reference_n"]=="6"
        assert reference_row["recorded_reference_q25"]=="13" and reference_row["recorded_mad_units"]==""
        assert all(year<"2021" for year in reference_row["reference_years"].split("|"))
        assert reference_row["sensor_days_with_records"]=="2" and reference_row["observation_completeness"]=="UNKNOWN"
        page.keyboard.press("Escape")
        page.locator("#referencePolicy").select_option("other")
        page.locator("#clearMonth").click()
        page.locator('[data-mode="VIIRS"]').click()
        pre=page.locator('[data-month="2009-05"]')
        expect(pre).to_have_attribute("aria-label",re.compile("Platform unavailable"))
        pre.focus();page.keyboard.press("ArrowRight");assert page.locator(":focus").get_attribute("data-month")=="2009-06"
        page.locator('[data-mode="MODIS"]').click();pre.click()
        expect(page.locator("#detailTitle")).to_have_text("May 2009 in context")
        modis_cells=page.locator("#union").inner_text()
        page.locator('[data-mode="integrated"]').click()
        expect(page.locator("#union")).to_have_text(modis_cells)
        page.locator("#measure").select_option("raw")
        raw_count=page.locator("#mraw").inner_text()
        expect(page.locator("#union")).to_have_text(raw_count)
        assert int(raw_count.replace(",",""))>int(modis_cells.replace(",",""))
        page.locator("#measure").select_option("cells")
        page.locator("#method").click()
        expect(page.locator("#dcontent")).to_contain_text("not individual fires or burned area")
        expect(page.locator("#dcontent table")).to_have_count(0)
        expect(page.get_by_role("link",name="Read the scientific methods on GitHub")).to_have_attribute("href",re.compile("github.com/zainnaqvi-ai/IGNIS/blob/main/docs/SCIENCE.md"))
        page.keyboard.press("Escape")
        page.locator("#start").fill("2026-11-03");page.locator("#start").dispatch_event("change")
        page.locator('[data-mode="VIIRS"]').click()
        expect(page.locator("#mapCount")).to_contain_text("0 sampled points shown")
        page.locator("#exportOpen").click()
        with page.expect_download() as info:
            page.get_by_role("button",name="Download daily CSV").click()
        path=Path(tmp)/"days.csv";info.value.save_as(path)
        with path.open(newline="") as f: rows=list(csv.DictReader(f))
        assert len(rows)==11 and all(r["calendar_state"]=="platform_not_available" and r["recorded_value"]=="" for r in rows)
        download(page,"Download hotspot records CSV",points_path)
        with points_path.open(newline="") as f:
            empty_export=csv.DictReader(f)
            assert "acq_date_utc" in empty_export.fieldnames and list(empty_export)==[]
        page.keyboard.press("Escape");page.locator("#reset").click();page.locator('[data-mode="integrated"]').click()
        page.set_viewport_size({"width":390,"height":844})
        page.evaluate("window.scrollTo({top:0,behavior:'instant'})")
        expect(page.locator("#mapCount")).to_contain_text("sampled points shown")
        assert page.evaluate("document.documentElement.scrollWidth<=innerWidth")
        page.screenshot(path=work/"mobile.png",full_page=True)
        for control in ["#region","#start","#end","#measure","#classification","#referencePolicy","#drawArea","#exportOpen"]:
            box=page.locator(control).bounding_box()
            assert box["width"]>=24 and box["height"]>=24,(control,box)
        page.locator("#referencePolicy").focus()
        assert page.locator(":focus").get_attribute("id")=="referencePolicy"
        page.locator("#referencePolicy").select_option("earlier")
        expect(page.locator("#unusualLabel")).to_have_text("Selected period not comparable")
        assert page.evaluate("document.documentElement.scrollWidth<=innerWidth")
        page.locator("#referencePolicy").select_option("other")
        page.locator("#start").fill("2021-11-01")
        page.locator("#end").fill("2021-11-30")
        page.locator("#monthPick").fill("2021-11")
        page.locator('[data-month="2021-11"]').click()
        expect(page.locator("#union")).to_have_text("564")
        expect(page.locator("#mapCount")).to_contain_text("776 retained observations")
        page.locator("#reset").click()
        expect(page.locator("#union")).to_have_text("19,724")
        page.locator("#measure").select_option("raw")
        for category,total in [("vegetation","28,197"),("other","1,520"),("unknown","326")]:
            page.locator("#classification").select_option(category)
            expect(page.locator("#union")).to_have_text(total,timeout=15000)
        page.locator("#exportOpen").click()
        with page.expect_download() as info:
            page.get_by_role("button",name="Download monthly CSV").click()
        info.value.save_as(path)
        with path.open(newline="") as f: classified=list(csv.DictReader(f))
        assert all(r["classification"]=="unknown" for r in classified)
        assert sum(int(r["recorded_value"] or 0) for r in classified)==326
        assert not errors,errors
        browser.close()
    print("PASS: California draw, edit, typed coordinates, AOI/sensor/measure/date scope, map, comparison and CSV; Lahore sensor transition, simple help, unusualness, partial dates, mobile controls and exports.")


if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("--url",help="Use an existing server. Default starts an isolated loopback server.")
    parser.add_argument("--channel",default="msedge")
    args=parser.parse_args()
    if args.url:
        journey(args.url,args.channel)
    else:
        handler=functools.partial(SimpleHTTPRequestHandler,directory=str(ROOT/"site"))
        with ThreadingHTTPServer(("127.0.0.1",0),handler) as server:
            Thread(target=server.serve_forever,daemon=True).start()
            try:
                journey(f"http://127.0.0.1:{server.server_port}",args.channel)
            finally:
                server.shutdown()
