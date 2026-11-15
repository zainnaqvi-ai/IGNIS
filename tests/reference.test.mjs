import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {recordedDistribution,recordSupport,rowsForExport,quantile,unusualness,seasonalSummary,referencePeriods,referenceAudit,referenceMessage} from "../site/model.js";

const values=(nums,target=20)=>[...nums.map((v,i)=>({m:(2010+i)+"-11",v,dailyArchiveSupport:true})),{m:"2020-11",v:target,dailyArchiveSupport:true}];
test("hand-calculated empirical range, tied rank and robust deviation",()=>{
  const d=recordedDistribution(values([1,2,3,4,5,6,7,8]),"2020-11");
  assert.equal(d.median,4.5);assert.equal(d.q25,2.75);assert.equal(d.q75,6.25);
  assert.equal(d.mad,2);assert.equal(d.madUnits,7.75);assert.equal(d.delta,15.5);
  assert.equal(d.robustDeviation,15.5/(1.4826*2));
  assert.equal(unusualness(d),"Higher than usual recorded activity");
  assert.equal(d.percentile,100);assert.equal(d.n,8);
  assert.equal(quantile([], .5),null);
  assert.equal(recordedDistribution(values([0,1,2,2,3],2),"2020-11").percentile,60);
});
test("sparse, constant, zero and unsupported references do not invent a score",()=>{
  assert.equal(recordedDistribution(values([1,2,3,4]),"2020-11").available,false);
  assert.equal(recordedDistribution(values([1,2,3,4,5]),"2020-11").madUnits,null);
  const d=recordedDistribution(values(Array(8).fill(0)),"2020-11");
  assert.equal(d.median,0);assert.equal(d.madUnits,null);assert.equal(d.relativePercent,null);
  assert.equal(d.robustDeviation,null);assert.equal(unusualness(d),"Reference variation too small");
  const v=values([1,2,3,4,5,6,7,8]);v.at(-1).dailyArchiveSupport=false;
  assert.equal(recordedDistribution(v,"2020-11").percentile,null);
});
test("unusualness requires support, robust spread and a documented rank threshold",()=>{
  assert.equal(unusualness(recordedDistribution(values([1,2,3,4,5]),"2020-11")),"Not enough comparable history");
  assert.equal(unusualness(recordedDistribution(values([1,2,3,4,5,6,7,8],4),"2020-11")),"Typical recorded activity");
  assert.equal(unusualness(recordedDistribution(values([10,11,12,13,14,15,16,17],0),"2020-11")),"Lower than usual recorded activity");
});
test("seasonal totals preserve unknown days and report real calendar denominators",()=>{
  const rows=[["2020-02-29",3,0,0,0,0,0,0,3,0],["2020-03-01",2,0,2,0,2,0,0,2,0]];
  const s=seasonalSummary(rows,"2020-02-28","2020-03-02","MODIS");
  assert.deepEqual(s[0],{label:"Winter · DJF",total:0,calendarDays:2,recordedDays:1,calendarMonths:1,recordedMonths:1,partialMonths:1});
  assert.deepEqual(s[1],{label:"Spring · MAM",total:2,calendarDays:2,recordedDays:1,calendarMonths:1,recordedMonths:1,partialMonths:1});
  assert.equal(s[2].calendarDays,0);
  const raw=seasonalSummary(rows,"2020-02-28","2020-03-02","MODIS","raw");
  assert.equal(raw[0].total,3);assert.equal(raw[1].total,2);
  for(const region of ["california","lahore"]){
    const d=JSON.parse(fs.readFileSync(new URL("../site/data/"+region+"/summary.json",import.meta.url)));
    const full=seasonalSummary(d.daily,d.first,d.last,"integrated");
    assert.equal(full.reduce((a,r)=>a+r.total,0),region==="california"?382271:19724);
    assert.equal(full.reduce((a,r)=>a+r.calendarDays,0),(Date.parse(d.last)-Date.parse(d.first))/86400000+1);
  }
});
test("earlier-years reference cannot leak later values",()=>{
  const v=values([1,2,3,4,5,6,7,8]);v.push({m:"2025-11",v:100000,dailyArchiveSupport:true});
  const d=recordedDistribution(v,"2020-11","earlier");
  assert.equal(d.n,8);assert.equal(d.median,4.5);assert.ok(d.years.every(y=>y<"2020"));
  assert.equal(recordedDistribution(v,"2020-11").n,9);
});
test("record support distinguishes unknown dates, quality zeros, NRT and unavailable sensors",()=>{
  const rows=[["2012-01-19",1,0,0,0,0,0,0,1,0],["2012-01-20",1,1,1,1,0,0,1,1,0]];
  assert.deepEqual(recordSupport(rows,"2012-01-19","2012-01-21","integrated"),{
    inScopeSensorDays:5,sensorDaysWithRecords:3,sensorDaysWithoutRecords:2,nrtSensorDays:1,zeroRetainedSensorDays:1});
  assert.equal(recordSupport(rows,"2009-01-01","2009-01-02","VIIRS").inScopeSensorDays,0);
});
test("real month distribution, earlier references and exports share exact date scope",()=>{
  const s=JSON.parse(fs.readFileSync(new URL("../site/data/california/summary.json",import.meta.url)));
  const selection={daily:s.daily,region:"california",start:"2020-09-01",end:"2020-09-30",mode:"integrated",frequency:"monthly",sourceIds:[],contextStart:s.first,contextEnd:s.last};
  const [other]=rowsForExport(selection),[earlier]=rowsForExport({...selection,referencePolicy:"earlier"});
  assert.equal(other.recorded_value,17272);assert.equal(other.recorded_reference_median,2269);
  assert.equal(other.recorded_reference_n,7);assert.equal(other.recorded_mad_units,"");
  assert.ok(earlier.reference_years.split("|").every(y=>y<"2020"));
  assert.ok(earlier.recorded_reference_n<other.recorded_reference_n);
  assert.equal(other.comparable_baseline_n,0);assert.equal(other.observation_completeness,"UNKNOWN");
  assert.equal(other.in_scope_sensor_days,60);assert.equal(other.sensor_days_with_records,60);
});

test("October 2026 distinguishes eligible history from an unsupported NRT target",()=>{
  for(const region of ["california","lahore"])for(const mode of ["integrated","MODIS","VIIRS"])for(const measure of ["cells","raw"]){
    const s=JSON.parse(fs.readFileSync(new URL("../site/data/"+region+"/summary.json",import.meta.url)));
    const periods=referencePeriods(s.daily,"2026-10",s.first,s.last,mode,measure);
    const d=recordedDistribution(periods.filter(x=>x.comparable),"2026-10","earlier");
    assert.equal(d.n,({california:{integrated:8,MODIS:13,VIIRS:14},lahore:{integrated:0,MODIS:0,VIIRS:5}})[region][mode]);
    assert.equal(d.reasonCode,"nrt_records");assert.equal(d.median,null);
    assert.equal(unusualness(d),"Selected period not comparable");
    assert.match(referenceMessage(d),/NRT/);
    const [out]=rowsForExport({daily:s.daily,start:"2026-10-01",end:"2026-10-31",contextStart:s.first,contextEnd:s.last,mode,measure,frequency:"monthly",sourceIds:[],referencePolicy:"earlier"});
    assert.equal(out.recorded_reference_n,d.n);assert.equal(out.recorded_reference_median,"");
    assert.deepEqual(JSON.parse(out.reference_eligibility),referenceAudit(periods,"2026-10","earlier"));
    assert.match(out.recorded_target_issues,/nrt_records/);
    assert.ok(referenceAudit(periods,"2026-10").at(-1).reasons.includes("target"));
  }
});
test("October 2003 excludes later years, advisory and sensor eras for distinct reasons",()=>{
  const s=JSON.parse(fs.readFileSync(new URL("../site/data/california/summary.json",import.meta.url)));
  const p=referencePeriods(s.daily,"2003-10",s.first,s.last,"integrated","cells"),v=p.filter(x=>x.comparable);
  const d=recordedDistribution(v,"2003-10","earlier"),audit=referenceAudit(p,"2003-10","earlier");
  assert.equal(d.n,0);assert.equal(d.reasonCode,"few_reference_years");
  assert.equal(unusualness(d),"Not enough comparable history");
  assert.match(referenceMessage(d),/Only 0 eligible earlier years/);
  assert.deepEqual(audit.find(x=>x.period==="2002-10").reasons,["historical_gap_advisory"]);
  assert.ok(audit.find(x=>x.period==="2001-10").reasons.includes("sensor_configuration"));
  assert.ok(audit.find(x=>x.period==="2005-10").reasons.includes("later_year"));
  assert.ok(audit.find(x=>x.period==="2012-10").reasons.includes("sensor_configuration"));
  assert.equal(recordedDistribution(v,"2003-10","other").n,4);
  const viirs=recordedDistribution(referencePeriods(s.daily,"2003-10",s.first,s.last,"VIIRS","cells").filter(x=>x.comparable),"2003-10","earlier");
  assert.equal(unusualness(viirs),"Sensor unavailable");
});
test("calendar clipping and zero retained activity remain separate from record gaps",()=>{
  const days=[["2020-05-02",2,1,0,0,0,0,0,2,1]];
  const p=referencePeriods(days,"2020-05","2019-05-03","2020-05-02","integrated","cells","2020-05-02","2020-05-02");
  assert.deepEqual(p[0].referenceIssues,["outside_date_filter"]);
  assert.equal(p[1].partial,true);assert.equal(p[1].v,0);assert.equal(p[1].dailyArchiveSupport,true);
  const month=referencePeriods(days,"2020-05","2020-05-01","2020-05-31","integrated","cells")[0];
  assert.equal(month.partial,false);assert.deepEqual(month.referenceIssues,["record_gaps"]);
  assert.equal(month.support.MODIS.daysWithRecords,1);
});

test("a maximum empirical rank with eight references does not imply significance",()=>{
  const d=recordedDistribution(values([1,2,3,4,5,6,7,8]),"2020-11");
  assert.equal(d.n,8);assert.equal(d.percentile,100);
  // Even a hypothetical exchangeable rank test cannot yield p < 1/(N+1).
  // No such exchangeability or p-value is claimed by IGNIS.
  assert.ok(1/(d.n+1)>.05);
  assert.equal(d.pValue,undefined);assert.match(d.scoreReason,/not a significance test/);
});
