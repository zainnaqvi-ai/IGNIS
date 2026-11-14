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
