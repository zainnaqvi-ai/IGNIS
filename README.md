# IGNIS · Fire activity atlas

An independent historical burning-activity workstation for the Lahore and California study rectangles. The static site already contains all generated analytics and offline geographic context. Use the integrated cell-day calendar or switch to the original MODIS and S-NPP VIIRS observation counts.

## Run in PyCharm on this workstation

Open PowerShell and run:

```powershell
Set-Location E:\IGNIS
pycharm64.exe .
.\.venv\Scripts\python.exe -m http.server 8000 --bind 127.0.0.1 --directory site
```

Visit [the local explorer](http://127.0.0.1:8000/). Stop the server with Ctrl+C. In PyCharm select the existing interpreter `.venv\Scripts\python.exe` and use the project root as the working directory. To use a PyCharm run configuration, choose Python, Module name `http.server`, parameters `8000 --bind 127.0.0.1 --directory site`. Opening index.html as a file prevents JSON fetches in typical browsers.

## Rebuild and verify

Place the four original ZIPs in `data/raw/` using the filenames in [the region configuration](config/regions.json). A fresh Python 3.13 environment can be created using `py -3.13 -m venv .venv` or the full path to a 3.13 interpreter. From the root:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m pipeline.build_data
.\.venv\Scripts\python.exe -m pipeline.validate_data
.\.venv\Scripts\python.exe -m pytest -q
node --test tests/model.test.mjs
```

The default build inventories the ZIPs, reads CSVs in 100,000-row chunks and groups one regional sensor at a time. `pipeline.inspect_inputs` alone writes the initial inventory. Follow it with `pipeline.build_data --audited` only when the inputs have remained unchanged. Validation reconciles published daily/monthly counts against the private unsampled daily cell records and rechecks source row counts and hashes. Node 24 is used only for the standalone browser-logic tests. All runtime JS, CSS, contextual geography and analytics ship inside `site/`.

For the browser test on Windows, install the optional test driver and use an installed Edge browser. The test starts a temporary loopback server, checks downloaded CSV contents and saves desktop and mobile screenshots in ignored local storage.

```powershell
.\.venv\Scripts\python.exe -m pip install playwright
.\.venv\Scripts\python.exe tests\browser_journey.py
```

## Ninety-second demonstration

1. Start in Lahore and compare the 6,543 raw MODIS rows, 23,500 raw VIIRS rows and 19,724 integrated cell-days. Open Methodology for the 116 matched positive months and eligibility finding.
2. Choose California, then select **Sep 2020** in the highest-recorded-month scorecard. Inspect a map observation and its source member. The month contains 17,272 occupied cell-days. Compare other Septembers, then use **Export data** for the monthly CSV.
3. Select one September day. The totals, map and downloads narrow to that day. Clear the month to return to the full date filter.
4. Return to Lahore, switch to VIIRS and scroll back before 2012. Inspect the unavailable months. Open Source audit to compare archive and NRT provenance.

## GitHub and Netlify handoff

The repository excludes raw ZIPs, intermediate cell records, local screenshots, the virtual environment and IDE settings. Only the generated static data is needed to serve the application. Review tracked files with `git ls-files`. Before any later publication, obtain the operator's authorization and create an empty repository on GitHub. Then, from the project root in PowerShell:

```powershell
$ignisRemote = Read-Host 'Paste the approved empty GitHub repository HTTPS URL'
git remote add origin $ignisRemote
git push -u origin main
```

In Netlify, import that GitHub repository, select branch `main`, leave the build command empty, and set publish directory to `site`. The included [Netlify configuration](netlify.toml) sets the publish directory. Once authorized, deploy and verify both region views and a CSV download from the deployed URL. Hosting and account actions are operator steps.

## Data and interpretation

See [data audit and totals](docs/DATA_AUDIT.md), [scientific methods](docs/SCIENCE.md), [static contracts](docs/SCHEMA.md), [challenge alignment](docs/CHALLENGE_ALIGNMENT.md) and [source manifest](config/source_manifest.csv). Recorded peaks and seasonal totals reflect heterogeneous sampling effort. The interface labels unknown periods and withholds calibrated indices for both regions. The entire site uses about 10 MB of generated data. Map partitions load on demand with a maximum of 650 displayed points and separate full counts.

Fire observations are provided by NASA FIRMS, including standard products and LANCE near-real-time data. See the [FIRMS readme and use disclaimer](https://firms.modaps.eosdis.nasa.gov/download/Readme.txt). Geographic context uses [Natural Earth public-domain 1:50m data](https://www.naturalearthdata.com/about/terms-of-use/). If refreshing that optional context, see the instructions in [the backdrop builder](pipeline/build_backdrop.py). Street tiles are optional and attributed to [OpenStreetMap contributors](https://www.openstreetmap.org/copyright). Leaflet 1.9.4 is distributed under its [BSD license](site/vendor/LEAFLET-LICENSE.txt).
