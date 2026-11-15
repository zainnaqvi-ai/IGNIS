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
    source_missing:"Source missing",archive_request_window_verified:"Verified zero detections"})[status];
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
function configuration(a,b,mode){
  const aqua=a>="2002-07-03"?"post-Aqua start":b<"2002-07-03"?"Terra only":"Aqua transition";
  return mode==="VIIRS"?era(a,b):aqua+" / "+era(a,b);
}
// Descriptive median conditional on daily positive archive records. This
// supports a statement about the files only, with no sampling-rate inference.
export function recordedReference(values,month){
  const peers=values.filter(x=>x.m!==month&&x.dailyArchiveSupport).map(x=>x.v);
  const target=values.find(x=>x.m===month);
  const result=baseline(target?.v,peers,Boolean(target?.dailyArchiveSupport));
  return {n:result.n,median:result.available?result.median:null};
}
// Match the selected day-of-month span, mission era and visible date filter.
export function sameMonthSeries(daily,month,start,end,mode,measure){
  const first=max(start,month+"-01"),last=min(end,endMonth(month));
  const targetEra=configuration(first,last,mode), values=[], supportedDays=new Map();
  const matches=new Map();
  for(const [date,...r] of daily){
    if(date<start || date>end || date.slice(5,7)!==month.slice(5) ||
       date.slice(8)<first.slice(8) || date.slice(8)>last.slice(8))continue;
    const m=key(date);
    const needM=mode!=="VIIRS",needV=mode!=="MODIS" && inScope(date,date,"VIIRS");
    if((!needM || (r[0]>0 && r[0]===r[7])) && (!needV || (r[1]>0 && r[1]===r[8])) && (needM||needV))supportedDays.set(m,1+(supportedDays.get(m)??0));
    matches.set(m,sum(matches.get(m)??empty(),r));
  }
  for(let y=+start.slice(0,4);y<=+end.slice(0,4);y++){
    const m=y+month.slice(4),a=m+"-"+first.slice(8),b=m+"-"+last.slice(8);
    if(a<start || b>end || b>endMonth(m) || configuration(a,b,mode)!==targetEra)continue;
    const r=matches.get(m)??empty();
    const dailyArchiveSupport=supportedDays.get(m)===Number(b.slice(8))-Number(a.slice(8))+1 && !gapWarning(a,b,mode);
    values.push({m,r,dailyArchiveSupport,v:metric(r,mode,measure),s:coverage(r,mode,a,b),partial:a>m+"-01"||b<endMonth(m)});
  }
  return values;
}
export function rowsForExport({daily,start,end,mode,measure="cells",classification="all",bounds=null,envelope,region,frequency,sourceIds,contextStart,contextEnd}) {
  const days=new Map(daily.map(([day,...r])=>[day,r]));
  const {months}=summarize(daily,start,end);
  const otherYears=new Map(), recorded=new Map();
  const rows=[];
  for(let day=start;day<=end;) {
    const month=key(day), monthly=frequency==="monthly", last=monthly?min(end,endMonth(month)):day;
    if(!otherYears.has(month)){
      const refs=sameMonthSeries(daily,month,contextStart??start,contextEnd??end,mode,measure);
      recorded.set(month,recordedReference(refs,month));
      otherYears.set(month,refs.filter(x=>x.m!==month && x.s==="positive_detection").length);
    }
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
      partial_year:start>day.slice(0,4)+"-01-01"||end<day.slice(0,4)+"-12-31",sensor_era:era(day,last),
      raw_modis:v[0],raw_viirs:v[1],kept_modis:v[2],kept_viirs:v[3],modis_only_cell_days:v[4],viirs_only_cell_days:v[5],
      shared_cell_days:v[6],union_cell_days:v[4]+v[5]+v[6],archive_modis:v[7],nrt_modis:v[0]-v[7],
      archive_viirs:v[8],nrt_viirs:v[1]-v[8],contributing_source_members:relevant.map(s=>s.member).join("|"),
      policy:"Raw = source rows. Grid = MODIS >=30 / VIIRS n,h. Within selected classification.",grid:"0.02 deg; origin -180,-90; union per UTC day",
      modis_cell_days:v[4]+v[6],viirs_cell_days:v[5]+v[6],
      other_same_month_years_with_records:otherYears.get(month),
      recorded_reference_n:recorded.get(month).n,recorded_reference_median:recorded.get(month).median??"",
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
