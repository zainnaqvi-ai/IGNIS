"""Independent CSV reference for cropped point and cell-day totals."""
import csv
import io
import json
import subprocess
from collections import defaultdict
from decimal import Decimal
from zipfile import ZipFile

from pipeline.inspect_inputs import PUBLIC, RAW, ROOT


def test_custom_areas_against_original_csvs():
    cases = [
        ("lahore", "2009-05-01", "2009-05-31", [74.05,31.3,74.5,31.7], "all"),
        ("lahore", "2021-11-01", "2021-11-30", [74.1,31.35,74.61,31.7], "other"),
        ("california", "2020-09-06", "2020-09-10", [-123.1,37.2,-119.2,41.3], "vegetation"),
        ("california", "2026-11-01", "2026-11-05", [-123,33,-115,40], "unknown"),
    ]
    sources=json.loads((PUBLIC/"sources.json").read_text())
    for region,start,end,box,classification in cases:
        w,s,e,n=map(lambda v:Decimal(str(v)),box)
        counts=defaultdict(lambda:[0]*9)
        occupied=defaultdict(set)
        for source in sources:
            if source["region"]!=region or source["first"]>end or source["last"]<start:
                continue
            viirs=int(source["sensor"]=="VIIRS")
            with ZipFile(RAW/source["zip"]) as archive, archive.open(source["member"]) as stream:
                for row in csv.DictReader(io.TextIOWrapper(stream,encoding="utf-8")):
                    day=row["acq_date"]
                    if not start<=day<=end:
                        continue
                    group={"0":"vegetation","1":"other","2":"other","3":"other"}.get(row.get("type"),"unknown")
                    if classification!="all" and group!=classification:
                        continue
                    x,y=Decimal(row["longitude"]),Decimal(row["latitude"])
                    if not (w<=x<=e and s<=y<=n):
                        continue
                    c=counts[day]
                    c[viirs]+=1
                    if source["status"]=="archive":
                        c[7+viirs]+=1
                    keep=row["confidence"] in ("n","h") if viirs else int(row["confidence"])>=30
                    if keep:
                        c[2+viirs]+=1
                        occupied[day,viirs].add(((x+180)//Decimal(".02"),(y+90)//Decimal(".02")))
        for day,c in counts.items():
            m,v=occupied[day,0],occupied[day,1]
            c[4:7]=[len(m-v),len(v-m),len(m&v)]
        assert sum(c[0]+c[1] for c in counts.values())>0
        code="""import fs from 'node:fs';import {queryYear} from './site/area.js';
        const [region,start,end,box,classification]=JSON.parse(process.argv[1]);
        const b=fs.readFileSync('site/data/'+region+'/area/'+start.slice(0,4)+'.bin');
        console.log(JSON.stringify(queryYear(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),
          box,Date.parse(start)/86400000,Date.parse(end)/86400000,classification)));"""
        rows=json.loads(subprocess.check_output(["node","--input-type=module","-e",code,json.dumps([region,start,end,box,classification])],cwd=ROOT))
        assert [[day,*counts[day]] for day in sorted(counts)]==rows
