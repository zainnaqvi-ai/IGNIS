"""Check README evidence links and optionally render its native Mermaid locally.

Rendering fetches a pinned Mermaid library, never observation data, and writes
only ignored data/work artifacts. It does not publish the README to a service.
"""
import argparse
import re
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
MERMAID_URL = "https://cdn.jsdelivr.net/npm/mermaid@11.12.0/dist/mermaid.min.js"


def check_links():
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    count = 0
    for link in re.findall(r"\[[^\]]+\]\(([^)]+)\)", readme):
        url = urlsplit(link)
        if url.scheme or url.netloc:
            continue
        target = ROOT / unquote(url.path) if url.path else ROOT / "README.md"
        assert target.is_file(), link
        if url.fragment:
            headings = re.findall(r"^#{1,6} (.+)$", target.read_text(encoding="utf-8"), re.M)
            anchors = {re.sub(r"[^\w\- ]", "", h.lower()).replace(" ", "-") for h in headings}
            assert unquote(url.fragment) in anchors, link
        count += 1
    block = re.findall(r"```mermaid\n(.*?)\n```", readme, re.S)
    assert len(block) == 1 and block[0].startswith("flowchart TD")
    assert 'F["IGNIS — Interactive Burning Activity Web Explorer"]' in block[0]
    assert "No calibration accepted" in block[0] and "no coefficients applied" in block[0]
    nodes=set(re.findall(r'\b([A-Z]+)\["',block[0]))
    edges=re.findall(r'^\s*([A-Z]+)\s+.*(?:-->|\.->)\s+([A-Z]+)',block[0],re.M)
    assert nodes-{source for source,_ in edges}=={"F"}, "Exactly one final explorer node required"
    assert "| NASA objective | Our implementation | Evidence | Status |" in readme
    table = readme.split("| NASA objective | Our implementation | Evidence | Status |", 1)[1].split("\n\n", 1)[0]
    assert len([r for r in table.splitlines() if r.startswith("| ")]) == 10
    print(f"PASS: {count} README local evidence links/anchors; 10 objective rows; one Mermaid workflow.")
    return block[0]


def render(diagram):
    from playwright.sync_api import sync_playwright
    work = ROOT / "data" / "work"
    work.mkdir(exist_ok=True, parents=True)
    bundle = work / "mermaid-11.12.0.min.js"
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge", headless=True, args=["--no-proxy-server"])
        page = browser.new_page(viewport={"width": 1100, "height": 1400})
        if not bundle.exists():
            response = page.request.get(MERMAID_URL, timeout=60000)
            assert response.ok, response.status
            bundle.write_bytes(response.body())
        page.set_content('<html><body style="margin:24px;background:white"><main id="diagram"></main></body></html>')
        page.add_script_tag(path=str(bundle))
        svg = page.evaluate("""async text => {
          mermaid.initialize({startOnLoad:false, securityLevel:'strict', theme:'default'});
          await mermaid.parse(text);
          const result=await mermaid.render('ignisWorkflow',text);
          document.querySelector('#diagram').innerHTML=result.svg;
          return result.svg;
        }""", diagram)
        assert page.locator("svg .node").count() == 14
        assert page.locator("svg .edgePath").count() or page.locator("svg .flowchart-link").count()
        assert "IGNIS" in page.locator("svg").text_content()
        (work / "readme-workflow.svg").write_text(svg, encoding="utf-8")
        page.locator("svg").screenshot(path=work / "readme-workflow.png")
        browser.close()
    print("PASS: README Mermaid parsed and rendered in local Edge with Mermaid 11.12.0; no GitHub publication.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--render-mermaid", action="store_true")
    args = parser.parse_args()
    diagram = check_links()
    if args.render_mermaid:
        render(diagram)
