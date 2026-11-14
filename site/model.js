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
export const metric = (r,mode) => mode==="integrated" ? r[4]+r[5]+r[6] : r[mode==="MODIS"?0:1];
export const units = mode => mode==="integrated" ? "cell-days" : "observations";
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
export function supportText(status,r,mode) {
  return ({positive_detection:metric(r,mode)===0?"No retained activity · source detections present":"Recorded · coverage unknown",
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
export function rowsForExport({daily,start,end,mode,region,frequency,sourceIds,contextStart,contextEnd}) {
  const days=new Map(daily.map(([day,...r])=>[day,r]));
  const {months}=summarize(daily,start,end);
  const parent=summarize(daily,contextStart??start,contextEnd??end).months;
  const ranked=[...parent.entries()].filter(([,r])=>raw(r,mode)>0).sort((a,b)=>metric(b[1],mode)-metric(a[1],mode));
  const referenceCounts=Array(13).fill(0);
  for(const [m] of ranked)referenceCounts[+m.slice(5)]++;
  const rows=[];
  for(let day=start;day<=end;) {
    const month=key(day), monthly=frequency==="monthly", last=monthly?min(end,endMonth(month)):day;
    const v=monthly?months.get(month)??empty():days.get(day)??empty();
    const status=coverage(v,mode,day,last), valid=status==="positive_detection"||status==="archive_request_window_verified";
    const relevant=sourceIds.filter(s=>{
      if(mode!=="integrated" && mode!==s.sensor)return false;
      const sensorIndex=s.sensor==="MODIS"?0:1,archive=v[7+sensorIndex];
      return (s.status==="archive"?archive:v[sensorIndex]-archive)>0;
    });
    rows.push({region,period:monthly?month:day,from_utc:day,to_utc:last,view_from_utc:start,view_to_utc:end,
      date_filter_from:contextStart,date_filter_to:contextEnd,mode,unit:units(mode),recorded_value:valid?metric(v,mode):"",
      calendar_state:status,request_window:"UNKNOWN",partial_month:start>month+"-01"||end<endMonth(month),
      partial_year:start>day.slice(0,4)+"-01-01"||end<day.slice(0,4)+"-12-31",sensor_era:era(day,last),
      raw_modis:v[0],raw_viirs:v[1],kept_modis:v[2],kept_viirs:v[3],modis_only_cell_days:v[4],viirs_only_cell_days:v[5],
      shared_cell_days:v[6],union_cell_days:v[4]+v[5]+v[6],archive_modis:v[7],nrt_modis:v[0]-v[7],
      archive_viirs:v[8],nrt_viirs:v[1]-v[8],contributing_source_members:relevant.map(s=>s.member).join("|"),
      policy:"Raw = source rows. Grid = MODIS >=30 / VIIRS n,h. All types.",grid:"0.02 deg; origin -180,-90; union per UTC day",
      highest_recorded_month_in_date_filter:ranked[0]?.[0]??"",
      highest_recorded_month_value:ranked.length?metric(ranked[0][1],mode):"",
      other_same_month_years_with_records:referenceCounts[+month.slice(5)]-Number(raw(parent.get(month)??empty(),mode)>0),
      comparable_baseline_n:0,baseline_status:"unavailable: unknown sampling support",bounds:"observed-point envelope"});
    day=next(last);
  }
  return rows;
}
export function csv(rows) {
  const quote=x=>'"'+String(x??"").replaceAll('"','""')+'"';
  return [Object.keys(rows[0]),...rows.map(r=>Object.values(r))].map(r=>r.map(quote).join(",")).join("\r\n");
}
