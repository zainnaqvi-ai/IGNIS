import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {baseline,coverage,empty,era,summarize,metric,rowsForExport,csv} from "../site/model.js";
test("uncertain support, verified query zero, platform dates and partial intervals",()=>{
  assert.equal(coverage(empty(),"MODIS","2020-05-01","2020-05-01"),"calendar_window_unknown");
  assert.equal(coverage(empty(),"VIIRS","2012-01-01","2012-01-19"),"platform_not_available");
  assert.equal(coverage(empty(),"VIIRS","2026-11-03","2026-11-13"),"platform_not_available");
  assert.equal(coverage(empty(),"MODIS","2020-05-01","2020-05-01",{verified:true}),"archive_request_window_verified");
  assert.equal(coverage(empty(),"MODIS","2020-05-01","2020-05-01",{missing:true}),"source_missing");
  assert.equal(era("2012-01-01","2012-01-31"),"Sensor transition");
  const rows=rowsForExport({daily:[],start:"2026-11-03",end:"2026-11-13",mode:"VIIRS",region:"lahore",frequency:"monthly",sourceIds:[]});
  assert.equal(rows[0].recorded_value,"");assert.ok(rows[0].partial_month && rows[0].partial_year);
});
test("same-month baseline requires support and handles ties and zero medians",()=>{
  assert.equal(baseline(12,[1,2,3,4],true).available,false);
  assert.equal(baseline(12,[1,2,3,4,5],false).available,false);
  assert.deepEqual(baseline(0,[0,0,0,4,9],true),{available:true,n:5,median:0,percentile:30});
});
test("full daily aggregation and monthly CSV agree for both regions and three modes",()=>{
  for(const region of ["california","lahore"]){
    const data=JSON.parse(fs.readFileSync(new URL("../site/data/"+region+"/summary.json",import.meta.url)));
    for(const mode of ["integrated","MODIS","VIIRS"]){
      const start="2021-11-05",end="2021-11-15";
      const select={region,mode,start,end,daily:data.daily,sourceIds:[]};
      const daily=rowsForExport({...select,frequency:"daily"}),monthly=rowsForExport({...select,frequency:"monthly"});
      const expected=metric(summarize(data.daily,start,end).total,mode);
      assert.equal(daily.reduce((a,r)=>a+Number(r.recorded_value),0),expected);
      assert.equal(monthly[0].recorded_value,expected);assert.equal(daily.length,11);
      assert.ok(csv(daily).includes('"from_utc"'));
    }
  }
});

import {queryYear,validateBounds,inside} from "../site/area.js";
test("all 54 production partitions reconcile daily with the independent original pipeline",()=>{
  for(const region of ["california","lahore"]){
    const dir=new URL("../site/data/"+region+"/",import.meta.url);
    const parent=JSON.parse(fs.readFileSync(new URL("summary.json",dir)));
    const all=[];
    for(let year=2000;year<=2026;year++){
      const b=fs.readFileSync(new URL("area/"+year+".bin",dir));
      all.push(...queryYear(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),parent.envelope,0,65535));
    }
    assert.deepEqual(all,parent.daily);
    for(const [d,...r] of all){
      if(d<"2012-01-20")assert.equal(metric(r,"MODIS","cells"),metric(r,"integrated","cells"));
      assert.equal(metric(r,"integrated","cells"),metric(r,"MODIS","cells")+metric(r,"VIIRS","cells")-r[6]);
      assert.equal(metric(r,"integrated","raw"),r[0]+r[1]);
    }
    assert.ok(all.some(([d,...r])=>d<"2012"&&metric(r,"MODIS","raw")>metric(r,"MODIS","cells")));
  }
});
test("inclusive boundary and finite ordered bounds",()=>{
  const b=[2,3,4,5];validateBounds(b,b);
  assert.ok(inside(2,5,b)&&inside(4,3,b));assert.equal(inside(4.00001,4,b),false);
  for(const invalid of [[4,3,2,5],[2,3,4,5.1],[NaN,3,4,5]])assert.throws(()=>validateBounds(invalid,b));
});

import {sameMonthSeries} from "../site/model.js";
test("same-month references match partial date window and sensor era in UI and export",()=>{
  const rows=["2009-05-10","2019-05-10","2019-05-31","2020-05-10"].map(d=>[d,5,0,4,0,2,0,0,5,0]);
  const ref=sameMonthSeries(rows,"2020-05","2009-01-01","2020-05-13","MODIS","raw");
  assert.equal(ref.find(r=>r.m==="2009-05").v,5);
  const joint=sameMonthSeries(rows,"2020-05","2009-01-01","2020-05-13","integrated","cells");
  assert.ok(!joint.some(r=>r.m==="2009-05"));
  assert.equal(ref.find(r=>r.m==="2019-05").v,5);
  const exported=rowsForExport({daily:rows,start:"2020-05-01",end:"2020-05-13",mode:"MODIS",measure:"raw",region:"lahore",frequency:"monthly",sourceIds:[],contextStart:"2009-01-01",contextEnd:"2020-05-13"});
  assert.equal(exported[0].other_same_month_years_with_records,2);
  assert.equal(exported[0].comparable_baseline_n,0);
});

import {gapWarning,recordedReference} from "../site/model.js";
test("recorded median requires daily archive support for target and peers",()=>{
  const days=[];
  for(let year=2013;year<=2020;year++)for(const d of ["01","02"])
    days.push([year+"-05-"+d,1,1,1,1,0,0,1,1,year===2014?0:1]);
  const refs=sameMonthSeries(days,"2020-05","2013-01-01","2020-05-02","integrated","cells");
  assert.deepEqual(recordedReference(refs,"2020-05"),{n:6,median:2});
  assert.equal(recordedReference(refs,"2014-05").median,null);
  assert.ok(gapWarning("2009-04-22","2009-04-22","MODIS"));
  assert.equal(gapWarning("2009-04-23","2009-04-23","MODIS"),"");
});
