/* Shared date/metric rules for rendering and exports. All dates are UTC strings. */
export const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
export const MODIS_FIRST = "2000-11-01", VIIRS_FIRST = "2012-01-20", VIIRS_LAST = "2026-11-02";
export const count = x => Number(x).toLocaleString("en-US");
export const min = (a,b) => a < b ? a : b;
export const max = (a,b) => a > b ? a : b;
export const key = date => date.slice(0,7);
export const monthLabel = m => MONTHS[Number(m.slice(5,7))-1]+" "+m.slice(0,4);
export const endMonth = m => new Date(Date.UTC(+m.slice(0,4),+m.slice(5,7),0)).toISOString().slice(0,10);
export const next = day => new Date(Date.parse(day+"T00:00:00Z")+86400000).toISOString().slice(0,10);
export const empty = () => Array(9).fill(0);
export const sum = (a,b) => a.map((v,i)=>v+b[i]);
export function metric(r,mode,measure="cells"){
  if(measure==="raw")return raw(r,mode);
  if(mode==="MODIS")return r[4]+r[6];
  if(mode==="VIIRS")return r[5]+r[6];
  return r[4]+r[5]+r[6];
}
export const units = measure => measure==="raw" ? "detections" : "cell-days";
export const raw = (r,mode) => mode==="MODIS" ? r[0] : mode==="VIIRS" ? r[1] : r[0]+r[1];
export const inScope = (first,last,mode) => mode==="VIIRS" ? last>=VIIRS_FIRST && first<=VIIRS_LAST : last>=MODIS_FIRST;
export function era(first,last) {
  if(last<VIIRS_FIRST) return "MODIS era";
  if(first>VIIRS_LAST) return "MODIS after S-NPP";
  if(first<VIIRS_FIRST || last>VIIRS_LAST) return "Sensor transition";
  return "MODIS + S-NPP era";
}
export function coverage(r,mode,first,last,{verified=false,missing=false}={}) {
  if(!inScope(first,last,mode)) return "platform_not_available";
  if(raw(r,mode)>0) return "positive_detection";
  if(missing) return "source_missing";
  return verified ? "archive_request_window_verified" : "calendar_window_unknown";
}
export function supportText(status,r,mode,measure="cells",first="",last="") {
  if(status==="platform_not_available" && mode==="VIIRS" && last && last<VIIRS_FIRST)
    return "Platform unavailable · sensor record begins 20 January 2012";
  if(status==="platform_not_available" && mode==="VIIRS" && first>VIIRS_LAST)
    return "Platform unavailable · sensor record ends 2 November 2026";
  return ({positive_detection:metric(r,mode,measure)===0?"No retained activity · source detections present":"Recorded · coverage unknown",
    platform_not_available:"Platform unavailable",calendar_window_unknown:"No record · coverage unknown",
    source_missing:"Source missing",archive_request_window_verified:"No detections in verified request · observation coverage unknown"})[status];
}
// Positive detection days establish records, never observation completeness.
export function recordSupport(daily,start,end,mode){
  const byDay=daily instanceof Map?daily:new Map(daily.map(([d,...r])=>[d,r]));
  const result={inScopeSensorDays:0,sensorDaysWithRecords:0,sensorDaysWithoutRecords:0,nrtSensorDays:0,zeroRetainedSensorDays:0};
  for(let d=start;d<=end;d=next(d)){
    const r=byDay.get(d)??empty();
    for(const [sensor,i] of [["MODIS",0],["VIIRS",1]]){
      if((mode!=="integrated"&&mode!==sensor)||!inScope(d,d,sensor))continue;
      result.inScopeSensorDays++;
      if(r[i]>0){result.sensorDaysWithRecords++;if(r[2+i]===0)result.zeroRetainedSensorDays++}
      else result.sensorDaysWithoutRecords++;
      if(r[i]>r[7+i])result.nrtSensorDays++;
    }
  }
  return result;
}
export function summarize(daily,start,end) {
  const months=new Map(); let total=empty();
  for(const [day,...v] of daily) {
    if(day<start || day>end) continue;
    total=sum(total,v);
    const m=key(day); months.set(m,sum(months.get(m)??empty(),v));
  }
  return {total,months};
}
export function baseline(target,references,targetSupported) {
  if(!targetSupported || references.length<5) return {n:references.length,available:false};
  const a=[...references].sort((x,y)=>x-y),mid=Math.floor(a.length/2);
  return {n:a.length,available:true,median:a.length%2?a[mid]:(a[mid]+a[mid-1])/2,
    percentile:100*(a.filter(x=>x<target).length+a.filter(x=>x===target).length/2)/a.length};
}
// FIRMS cautions about losses in several MODIS products. Broad dates
// intentionally flag possible effects, never a specific missed local overpass.
export function gapWarning(a,b,mode){
  if(mode==="VIIRS")return "";
  const periods=[["2001-06-01","2001-07-31"],["2002-01-01","2002-12-31"],
    ["2007-08-01","2007-08-31"],["2009-04-21","2009-04-22"]];
  return periods.some(([s,e])=>a<=e&&b>=s)?"FIRMS historical MODIS data-gap advisory":"";
}
export function configuration(a,b,mode){
  const aqua=a>="2002-07-03"?"post-Aqua start":b<"2002-07-03"?"Terra only":"Aqua transition";
  if(mode==="MODIS")return "MODIS · "+aqua;
  if(mode==="VIIRS")return inScope(a,b,mode)?(a<VIIRS_FIRST||b>VIIRS_LAST?"S-NPP transition":"S-NPP"):"S-NPP unavailable";
  return aqua+" / "+era(a,b);
}
// Descriptive median conditional on daily positive archive records. This
// supports a statement about the files only, with no sampling-rate inference.
export function recordedReference(values,month,policy="other"){
  const peers=values.filter(x=>x.m!==month&&(policy!=="earlier"||x.m<month)&&x.dailyArchiveSupport).map(x=>x.v);
  const target=values.find(x=>x.m===month);
  const result=baseline(target?.v,peers,Boolean(target?.dailyArchiveSupport));
  return {n:result.n,median:result.available?result.median:null};
}
// Linear empirical quantiles (Hyndman-Fan type 7). These summarize the
// conditional recorded sample; they are not confidence or prediction limits.
export function quantile(sorted,p){
  if(!sorted.length)return null;
  const h=(sorted.length-1)*p,i=Math.floor(h);
  return sorted[i]+(h-i)*(sorted[Math.min(i+1,sorted.length-1)]-sorted[i]);
}
export function recordedDistribution(values,month,policy="other"){
  const peers=values.filter(x=>x.m!==month&&(policy!=="earlier"||x.m<month)&&x.dailyArchiveSupport);
  const target=values.find(x=>x.m===month), ref=recordedReference(values,month,policy);
  const targetIssues=target?.referenceIssues??(target?.dailyArchiveSupport?[]:["record_gaps"]);
  const reasonCode=!target?.dailyArchiveSupport?(targetIssues[0]??"record_gaps"):ref.n<5?"few_reference_years":"";
  const result={...ref,available:ref.median!==null,policy,years:peers.map(x=>x.m.slice(0,4)),targetIssues,reasonCode,
    q25:null,q75:null,p10:null,p90:null,percentile:null,delta:null,relativePercent:null,mad:null,madUnits:null,robustDeviation:null,
    reason:!target?.dailyArchiveSupport?targetIssues.map(referenceIssueText).join("; "):ref.n<5?"Fewer than five eligible reference years":"",scoreReason:"Reference unavailable"};
  if(!result.available)return result;
  const a=peers.map(x=>x.v).sort((a,b)=>a-b), delta=target.v-ref.median;
  const mad=quantile(a.map(v=>Math.abs(v-ref.median)).sort((a,b)=>a-b),.5);
  return {...result,q25:quantile(a,.25),q75:quantile(a,.75),p10:quantile(a,.1),p90:quantile(a,.9),
    percentile:100*(a.filter(v=>v<target.v).length+.5*a.filter(v=>v===target.v).length)/a.length,
    delta,relativePercent:ref.median>0?100*delta/ref.median:null,mad,
    madUnits:ref.n>=8&&mad>0?delta/mad:null,
    robustDeviation:ref.n>=8&&mad>0?delta/(1.4826*mad):null,
    scoreReason:ref.n<8?"Fewer than eight eligible reference years":mad===0?"Reference MAD is zero":"Conditional recorded deviation, not a significance test"};
}
export function unusualness(reference){
  if(!reference.available&&reference.reasonCode!=="few_reference_years")return reference.reasonCode==="platform_unavailable"?"Sensor unavailable":"Selected period not comparable";
  if(!reference.available||reference.n<8)return "Not enough comparable history";
  if(reference.robustDeviation===null)return "Reference variation too small";
  if(reference.percentile>=90&&reference.robustDeviation>=2)return "Higher than usual recorded activity";
  if(reference.percentile<=10&&reference.robustDeviation<=-2)return "Lower than usual recorded activity";
  if(reference.percentile>=25&&reference.percentile<=75)return "Typical recorded activity";
  return reference.delta>0?"Above the recorded median":"Below the recorded median";
}
export const referenceIssueText=code=>({
  outside_date_filter:"Outside the selected date range",calendar_day_absent:"Calendar day absent in this year",
  sensor_configuration:"Different sensor era",platform_unavailable:"Selected sensor unavailable",
  historical_gap_advisory:"Historical MODIS gap advisory",nrt_records:"Contains NRT records",
  record_gaps:"Daily archive records missing for a selected sensor",target:"Selected period excluded from its own reference",
  later_year:"Later year excluded by earlier-years policy"
})[code]??code;
export function referenceMessage(reference){
  if(reference.available)return "";
  if(reference.reasonCode==="nrt_records")return "Selected period contains NRT records; an archive-based comparison is unavailable.";
  if(reference.reasonCode==="record_gaps")return "Selected period lacks daily archive records; descriptive history remains available.";
  if(reference.reasonCode==="historical_gap_advisory")return "A historical data-gap advisory prevents a reference for this period.";
  if(reference.reasonCode==="platform_unavailable")return "The selected sensor has no record for this period.";
  return "Only "+reference.n+" eligible "+(reference.policy==="earlier"?"earlier":"other")+" years; a reference needs at least five.";
}
export function referenceAudit(periods,month,policy="other"){
  return periods.map(x=>{
    const reasons=[...(x.referenceIssues??[]),...(x.m===month?["target"]:policy==="earlier"&&x.m>month?["later_year"]:[])];
    return {period:x.m,eligible:x.dailyArchiveSupport&&!reasons.length,reasons};
  });
}
// Totals are never divided by detection-positive days/months: that denominator
// selects on the outcome and is not known observation exposure.
export function seasonalSummary(daily,start,end,mode,measure="cells"){
  const days=daily instanceof Map?daily:new Map(daily.map(([d,...r])=>[d,r]));
  const result=["Winter · DJF","Spring · MAM","Summer · JJA","Autumn · SON"].map(label=>({label,total:0,calendarDays:0,recordedDays:0,calendarMonths:0,recordedMonths:0,partialMonths:0}));
  const months=new Map();
  for(let d=start;d<=end;d=next(d)){
    const m=key(d),season=Math.floor((+d.slice(5,7)%12)/3),s=result[season],r=days.get(d)??empty();
    s.calendarDays++;s.total+=metric(r,mode,measure);
    if(raw(r,mode)>0)s.recordedDays++;
    months.set(m,{season,recorded:(months.get(m)?.recorded??false)||raw(r,mode)>0});
  }
  for(const [m,{season,recorded}] of months){
    const s=result[season];s.calendarMonths++;if(recorded)s.recordedMonths++;
    if(start>m+"-01"||end<endMonth(m))s.partialMonths++;
  }
  return result;
}
// Match the selected day-of-month span, mission era and visible date filter.
export function referencePeriods(daily,month,start,end,mode,measure,first=max(start,month+"-01"),last=min(end,endMonth(month))){
  const byDay=daily instanceof Map?daily:new Map(daily.map(([d,...r])=>[d,r]));
  const targetEra=configuration(first,last,mode), values=[];
  for(let y=+start.slice(0,4);y<=+end.slice(0,4);y++){
    const m=y+month.slice(4),a=m+"-"+first.slice(8),b=m+"-"+last.slice(8);
    const referenceIssues=[];
    if(a<start||b>end||a>b)referenceIssues.push("outside_date_filter");
    if(b>endMonth(m))referenceIssues.push("calendar_day_absent");
    if(configuration(a,b,mode)!==targetEra)referenceIssues.push("sensor_configuration");
    const comparable=referenceIssues.length===0;
    if(!comparable){values.push({m,comparable,dailyArchiveSupport:false,referenceIssues});continue}
    if(!inScope(a,b,mode))referenceIssues.push("platform_unavailable");
    if(gapWarning(a,b,mode))referenceIssues.push("historical_gap_advisory");
    let r=empty();
    const support={MODIS:{requiredDays:0,daysWithRecords:0,nrtDays:0},VIIRS:{requiredDays:0,daysWithRecords:0,nrtDays:0}};
    for(let d=+a.slice(8);d<=+b.slice(8);d++){
      const stamp=m+"-"+String(d).padStart(2,"0"), obs=byDay.get(stamp)??empty();
      r=sum(r,obs);
      for(const [sensor,i] of [["MODIS",0],["VIIRS",1]]){
        if((mode!=="integrated"&&mode!==sensor)||!inScope(stamp,stamp,sensor))continue;
        support[sensor].requiredDays++;
        if(obs[i]>0)support[sensor].daysWithRecords++;
        if(obs[i]>obs[7+i])support[sensor].nrtDays++;
      }
    }
    if(Object.values(support).some(s=>s.nrtDays))referenceIssues.push("nrt_records");
    if(Object.values(support).some(s=>s.daysWithRecords<s.requiredDays))referenceIssues.push("record_gaps");
    values.push({m,r,comparable,referenceIssues,support,from:a,to:b,configuration:configuration(a,b,mode),dailyArchiveSupport:referenceIssues.length===0,v:metric(r,mode,measure),s:coverage(r,mode,a,b),partial:a>m+"-01"||b<endMonth(m)});
  }
  return values;
}
export function sameMonthSeries(...args){return referencePeriods(...args).filter(x=>x.comparable)}
export function rowsForExport({daily,start,end,mode,measure="cells",classification="all",bounds=null,envelope,region,frequency,sourceIds,contextStart,contextEnd,referencePolicy="other"}) {
  const days=new Map(daily.map(([day,...r])=>[day,r]));
  const {months}=summarize(daily,start,end);
  const rows=[];
  for(let day=start;day<=end;) {
    const month=key(day), monthly=frequency==="monthly", last=monthly?min(end,endMonth(month)):day;
    const periods=referencePeriods(days,month,contextStart??start,contextEnd??end,mode,measure,day,last),refs=periods.filter(x=>x.comparable);
    const recorded=recordedDistribution(refs,month,referencePolicy);
    const support=recordSupport(days,day,last,mode);
    const v=monthly?months.get(month)??empty():days.get(day)??empty();
    const status=coverage(v,mode,day,last), valid=status==="positive_detection"||status==="archive_request_window_verified";
    const relevant=sourceIds.filter(s=>{
      if(mode!=="integrated" && mode!==s.sensor)return false;
      const sensorIndex=s.sensor==="MODIS"?0:1,archive=v[7+sensorIndex];
      return (s.status==="archive"?archive:v[sensorIndex]-archive)>0;
    });
    rows.push({region,period:monthly?month:day,from_utc:day,to_utc:last,view_from_utc:start,view_to_utc:end,
      date_filter_from:contextStart,date_filter_to:contextEnd,mode,measure,classification,unit:units(measure),recorded_value:valid?metric(v,mode,measure):"",
      historical_gap_advisory:gapWarning(day,last,mode),calendar_state:status,request_window:"UNKNOWN",partial_month:start>month+"-01"||end<endMonth(month),
      observation_completeness:"UNKNOWN",in_scope_sensor_days:support.inScopeSensorDays,
      sensor_days_with_records:support.sensorDaysWithRecords,sensor_days_without_records:support.sensorDaysWithoutRecords,
      sensor_days_with_nrt:support.nrtSensorDays,sensor_days_zero_after_quality_filter:support.zeroRetainedSensorDays,
      partial_year:start>day.slice(0,4)+"-01-01"||end<day.slice(0,4)+"-12-31",sensor_era:era(day,last),
      raw_modis:v[0],raw_viirs:v[1],kept_modis:v[2],kept_viirs:v[3],modis_only_cell_days:v[4],viirs_only_cell_days:v[5],
      shared_cell_days:v[6],union_cell_days:v[4]+v[5]+v[6],archive_modis:v[7],nrt_modis:v[0]-v[7],
      archive_viirs:v[8],nrt_viirs:v[1]-v[8],contributing_source_members:relevant.map(s=>s.member).join("|"),
      policy:"Raw = source rows. Grid = MODIS >=30 / VIIRS n,h. Within selected classification.",grid:"0.02 deg; origin -180,-90; union per UTC day",
      modis_cell_days:v[4]+v[6],viirs_cell_days:v[5]+v[6],
      reference_from_utc:day,reference_to_utc:last,
      other_same_month_years_with_records:refs.filter(x=>x.m!==month && (referencePolicy!=="earlier"||x.m<month) && x.s==="positive_detection").length,
      recorded_reference_n:recorded.n,recorded_reference_median:recorded.median??"",
      recorded_reference_status:recorded.reason||"Conditional recorded reference available",
      recorded_target_issues:recorded.targetIssues.join("|"),reference_eligibility:JSON.stringify(referenceAudit(periods,month,referencePolicy)),
      reference_policy:referencePolicy,reference_years:recorded.years.join("|"),
      recorded_reference_q25:recorded.q25??"",recorded_reference_q75:recorded.q75??"",
      recorded_reference_p10:recorded.p10??"",recorded_reference_p90:recorded.p90??"",
      recorded_midrank_percentile:recorded.percentile??"",recorded_deviation:recorded.delta??"",
      recorded_relative_percent:recorded.relativePercent??"",recorded_reference_mad:recorded.mad??"",
      recorded_mad_units:recorded.madUnits??"",recorded_score_status:recorded.scoreReason,
      recorded_robust_deviation:recorded.robustDeviation??"",robust_deviation_definition:"(value - median) / (1.4826 * MAD)",
      recorded_unusualness:unusualness(recorded),
      reference_interpretation:"Conditional recorded activity; daily positive archive selection; no significance, completeness or emergency inference",
      comparable_baseline_n:0,baseline_status:"unavailable: unknown sampling support",area:bounds?"custom":"parent",
      bounds_wsen:(bounds??envelope??[]).join("|"),area_method:"Inclusive WGS84 reported point centers before gridding"});
    day=next(last);
  }
  return rows;
}
export function csv(rows) {
  const quote=x=>'"'+String(x??"").replaceAll('"','""')+'"';
  return [Object.keys(rows[0]),...rows.map(r=>Object.values(r))].map(r=>r.map(quote).join(",")).join("\r\n");
}
