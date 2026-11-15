"""Run explicitly with a local server; uses optional Playwright and installed Edge."""
import argparse
import csv
import functools
import re
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Thread

from playwright.sync_api import expect, sync_playwright

ROOT=Path(__file__).resolve().parents[1]


def journey(url,channel):
    errors=[]
    with sync_playwright() as p, TemporaryDirectory() as tmp:
        browser=p.chromium.launch(channel=channel,headless=True,args=["--no-proxy-server"])
        page=browser.new_page(viewport={"width":1440,"height":960},accept_downloads=True)
        page.on("pageerror",lambda error:errors.append(str(error)))
        page.goto(url,wait_until="domcontentloaded")
        expect(page.locator("#mapCount")).to_contain_text("sampled points shown")
        expect(page.locator("#union")).to_have_text("19,724")
        page.route("https://tile.openstreetmap.org/**",lambda route:route.abort())
        page.locator("#streets").click()
        expect(page.locator("#streets")).not_to_be_checked()
        expect(page.locator("#mapDesc")).to_contain_text("offline geography")
        work=ROOT/"data/work";work.mkdir(exist_ok=True,parents=True)
        page.evaluate("window.scrollTo(0,0)")
        page.screenshot(path=work/"desktop.png")
        page.locator("#region").select_option("california")
        expect(page.locator("#union")).to_have_text("382,271")
        page.locator("#monthPick").fill("2020-09")
        expect(page.locator("#union")).to_have_text("17,272")
        expect(page.locator('[data-month="2020-09"]')).to_have_attribute("aria-pressed","true")
        expect(page.locator("#mapCount")).to_contain_text("155,825 retained")
        page.locator(".samplelist summary").click()
        page.locator("#samples button").first.click()
        expect(page.locator(".leaflet-popup-content")).to_contain_text("UTC")
        expect(page.locator(".leaflet-popup-content")).to_contain_text("FRP")
        page.locator(".leaflet-popup-close-button").click()
        expect(page.locator("#baselineText")).to_contain_text("comparable baseline N = 0")
        page.locator("#exportOpen").click()
        with page.expect_download() as info:
            page.get_by_role("button",name="Download monthly CSV").click()
        path=Path(tmp)/"month.csv";info.value.save_as(path)
        with path.open(newline="") as f: rows=list(csv.DictReader(f))
        assert len(rows)==1 and rows[0]["period"]=="2020-09" and rows[0]["recorded_value"]=="17272"
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
        expect(page.locator("#baselineText")).to_contain_text("comparable baseline N = 0")
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
        expect(page.locator("#dcontent")).to_contain_text("116 months")
        page.keyboard.press("Escape");page.locator("#audit").click()
        page.locator("#dcontent summary").first.click()
        expect(page.locator("#dcontent")).to_contain_text("fire_archive_M-C61_847828.csv")
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
        page.keyboard.press("Escape");page.locator("#reset").click();page.locator('[data-mode="integrated"]').click()
        page.set_viewport_size({"width":390,"height":844})
        page.evaluate("window.scrollTo({top:0,behavior:'instant'})")
        expect(page.locator("#mapCount")).to_contain_text("sampled points shown")
        assert page.evaluate("document.documentElement.scrollWidth<=innerWidth")
        page.screenshot(path=work/"mobile.png")
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
    print("PASS: California draw, edit, typed coordinates, AOI/sensor/measure/date scope, map, comparison and CSV; Lahore sensor transition, methods, audit, partial dates, mobile controls and exports.")


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
