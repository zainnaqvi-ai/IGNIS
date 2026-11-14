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
        page.locator("#streets").check()
        expect(page.locator("#streets")).not_to_be_checked()
        expect(page.locator("#mapDesc")).to_contain_text("offline geography")
        work=ROOT/"data/work";work.mkdir(exist_ok=True,parents=True)
        page.screenshot(path=work/"desktop.png")
        page.locator("#region").select_option("california")
        expect(page.locator("#union")).to_have_text("382,271")
        page.locator("#peakButton").click()
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
        page.locator("#peakButton").click()
        expect(page.locator("#union")).to_have_text("564")
        expect(page.locator("#mapCount")).to_contain_text("776 retained observations")
        page.locator("#clearMonth").click()
        expect(page.locator("#union")).to_have_text("19,724")
        assert not errors,errors
        browser.close()
    print("PASS: California peak, map, comparison and CSV; Lahore sensor transition, methods, audit, partial dates, mobile controls and exports.")


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
