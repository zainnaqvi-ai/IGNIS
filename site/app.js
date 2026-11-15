import {MONTHS,count,min,max,key,monthLabel,endMonth,next,empty,sum,metric,units,raw,coverage,supportText,era,summarize,rowsForExport,csv,recordedReference,gapWarning,sameMonthSeries} from "./model.js";
import {data,initMap,showMap} from "./map.js";
import {showBounds} from "./draw.js";
const el=id=>document.getElementById(id);
const st={region:"lahore",mode:"integrated",measure:"cells",classification:"all",bounds:null,start:"",end:"",month:null,day:null};
let summary,sources,days,sourceSet,loadedRegion=0,busy=true,parentDaily,areaWorker,queryId=0;
const colors=["#f4e9cf","#ecd39f","#e4b569","#d9914f","#c76943","#a04632","#732d27"];
const niceRegion=()=>st.region==="lahore"?"Lahore":"California";
function formatDate(d){return d.slice(8)+" "+monthLabel(key(d))}
function notice(msg){el("status").textContent=msg}
function lockView(locked){
  busy=locked;
  for(const id of ["start","end","measure","reset","exportOpen","monthPick","classification"])el(id).disabled=locked;
  for(const node of document.querySelectorAll(".modes,.aoiTools,.areaInfo,#map,#calendar,.detailsgrid"))node.inert=locked;
  el("workspace").setAttribute("aria-busy",String(locked));
}
function fail(e){notice("Unable to load this view. "+e.message+". Reload to retry.")}
function interval(){
  let start=st.start,end=st.end;
  if(st.month){start=max(start,st.month+"-01");end=min(end,endMonth(st.month))}
  if(st.day) start=end=st.day;
  return {start,end};
}
function bins(values){
  const set=values.filter(v=>v>0).sort((a,b)=>a-b);
  return [0,.20,.40,.60,.77,.90,.98].map(q=>set[Math.floor((set.length-1)*q)]??1);
}
function styleCell(b,v,status,thresholds) {
  if(status==="positive_detection" && v>0){
    let ix=0;for(let i=1;i<thresholds.length;i++)if(v>=thresholds[i])ix=i;
    b.style.background=colors[ix];b.style.color=ix>=5?"#fff":"#29271e";
  }else if(status==="positive_detection"||status==="archive_request_window_verified"){b.textContent="0";b.title="Zero retained or verified zero";b.style.background="#e1ebe1";b.style.color="#193d30"}
  else{b.className+=" "+(status==="platform_not_available"?"unavailable":"missing");b.textContent=status==="platform_not_available"?"/":"·"}
}
function selectMonth(month,focus=true){
  st.month=month;st.day=null;render();
  if(focus) el("heatBody").querySelector('[data-month="'+month+'"]')?.focus({preventScroll:true});
}
function calendar(months){
  const body=el("heatBody"),frag=document.createDocumentFragment();
  const thresholds=bins([...months.values()].map(r=>metric(r,st.mode,st.measure)));
  el("scaleLow").textContent="Low · "+count(thresholds[0]);el("scaleHigh").textContent="High ≥ "+count(thresholds.at(-1));
  if(![...months.values()].some(r=>metric(r,st.mode,st.measure)>0)){el("scaleLow").textContent="No positive values";el("scaleHigh").textContent=""}
  const lo=+st.start.slice(0,4),hi=+st.end.slice(0,4);
  el("unitTag").textContent=units(st.measure);
  el("calDesc").textContent=(st.mode==="integrated"?"Integrated":st.mode)+" · "+(st.measure==="cells"?"occupied grid cells per day":"all supplied detections")+" · "+lo+"–"+hi+" · UTC";
  for(let y=hi;y>=lo;y--){
    const tr=document.createElement("tr"); if(y===2012)tr.className="transition";
    const th=document.createElement("th");th.scope="row";th.textContent=y;
    const partial=st.start>y+"-01-01"||st.end<y+"-12-31";
    if(partial){const dot=document.createElement("small");dot.textContent=" *";th.append(dot);th.title="Partial year within date filter"}
    if(y===2012)th.title="S-NPP series starts 20 January 2012";
    tr.append(th);
    for(let m=1;m<=12;m++){
      const month=y+"-"+String(m).padStart(2,"0");
      const first=max(month+"-01",st.start),last=min(endMonth(month),st.end);
      const td=document.createElement("td"),b=document.createElement("button");
      td.append(b);tr.append(td);
      if(first>last){b.disabled=true;b.textContent="–";b.setAttribute("aria-label",month+" outside selection");continue}
      const r=months.get(month)??empty(),status=coverage(r,st.mode,first,last),v=metric(r,st.mode,st.measure);
      styleCell(b,v,status,thresholds);
      const desc=monthLabel(month)+" · "+(status==="positive_detection"?count(v)+" "+units(st.measure)+" · ":"")+supportText(status,r,st.mode,st.measure,first,last)+" · "+era(first,last)+(first>month+"-01"||last<endMonth(month)?" · partial month":"");
      b.title=desc;b.setAttribute("aria-label",desc);b.setAttribute("aria-pressed",st.month===month);b.dataset.month=month;
      b.onfocus=b.onmouseenter=()=>{el("cellReadout").textContent=desc};
      b.onclick=()=>selectMonth(month);
      b.onkeydown=e=>{
        const off={ArrowLeft:-1,ArrowRight:1,ArrowUp:12,ArrowDown:-12}[e.key];if(!off)return;
        e.preventDefault();const t=new Date(Date.UTC(y,m-1+off,1)).toISOString().slice(0,7);
        body.querySelector('[data-month="'+t+'"]')?.focus();
      };
    }
    frag.append(tr);
  }
  body.replaceChildren(frag);
  el("clearMonth").hidden=!st.month;
  el("cellReadout").textContent=st.month?monthLabel(st.month)+" selected · "+era(max(st.start,st.month+"-01"),min(st.end,endMonth(st.month))):"Choose a month for daily detail.  * Partial year · 2012 sensor transition.";
}
function dailyView(month){
  const grid=el("dailyChart");grid.replaceChildren();
  const start=max(month+"-01",st.start),end=min(endMonth(month),st.end);
  el("dailyDesc").textContent=monthLabel(month)+" · "+units(st.measure)+" per UTC day"+(st.month?"":" · recorded month preview");
  const thresholds=bins(summary.daily.filter(row=>row[0]>=start && row[0]<=end).map(([, ...r])=>metric(r,st.mode,st.measure)));
  for(const label of ["Su","Mo","Tu","We","Th","Fr","Sa"]){const span=document.createElement("span");span.className="weekday";span.textContent=label;grid.append(span)}
  const offset=new Date(month+"-01T00:00:00Z").getUTCDay();
  for(let i=0;i<offset;i++)grid.append(document.createElement("span"));
  for(let d=1;d<=+endMonth(month).slice(8);d++){
    const day=month+"-"+String(d).padStart(2,"0"),b=document.createElement("button");
    b.className="day";b.disabled=day<start||day>end;const r=days.get(day)??empty(),v=metric(r,st.mode,st.measure),s=coverage(r,st.mode,day,day);
    styleCell(b,v,s,thresholds);b.textContent=d+(s==="platform_not_available"?"/":s==="calendar_window_unknown"?"·":"");b.dataset.day=day;
    b.setAttribute("aria-pressed",st.day===day);
    b.title=day+" · "+(s==="positive_detection"?count(v)+" "+units(st.measure)+" · ":"")+supportText(s,r,st.mode,st.measure,day,day);
    b.setAttribute("aria-label",b.title);b.onfocus=b.onmouseenter=()=>el("dayFocus").textContent=b.title;
    b.onclick=()=>{st.month=month;st.day=st.day===day?null:day;render();grid.querySelector('[data-day="'+day+'"]')?.focus({preventScroll:true})};
    grid.append(b);
  }
  el("dayFocus").textContent=st.day?formatDate(st.day)+" selected · select again for the month":"Choose a day to filter the map, metrics and export.";
}
function history(month){
  const targetFirst=max(month+"-01",st.start),targetLast=min(endMonth(month),st.end);
  const targetEra=era(targetFirst,targetLast),firstDay=targetFirst.slice(-2),lastDay=targetLast.slice(-2);
  const values=sameMonthSeries(summary.daily,month,st.start,st.end,st.mode,st.measure);
  const n=values.filter(x=>x.s==="positive_detection"&&x.m!==month).length, maxValue=Math.max(...values.map(x=>x.v),1);
  const reference=recordedReference(values,month);
  el("baselineText").textContent=MONTHS[+month.slice(5)-1]+" · "+n+" other recorded years · days "+firstDay+"–"+lastDay+" · "+targetEra+" · comparable baseline N = 0";
  const chart=el("historyChart");chart.replaceChildren();
  for(const {m,v,s,r,partial} of values){
    const b=document.createElement("button");b.className="histbar"+(s!=="positive_detection"?" gap":"")+(m===month?" selected":"");
    b.style.maxWidth="36px";b.style.height=Math.max(4,100*v/maxValue)+"%";b.title=monthLabel(m)+" · "+(s==="positive_detection"?count(v)+" "+units(st.measure):supportText(s,r,st.mode,st.measure))+(partial?" · partial":"");
    b.setAttribute("aria-label",b.title);b.onfocus=b.onmouseenter=()=>el("histReadout").textContent=b.title;b.onclick=()=>selectMonth(m);
    chart.append(b);
  }
  const a=el("historyAxis");a.textContent=values[0].m.slice(0,4)+" – "+values.at(-1).m.slice(0,4)+" · chronological";
  el("histReadout").textContent=reference.median===null?"Observation coverage unverified. Daily archive-supported reference unavailable (N = "+reference.n+").":"Median recorded "+units(st.measure)+": "+count(reference.median)+" across "+reference.n+" other years with daily archive detections. Observation coverage unverified.";
}
function breakdown(total,months){
  const overlap=el("overlap"),stack=document.createElement("div");stack.className="stack";overlap.replaceChildren(stack);
  const denom=total[4]+total[5]+total[6];
  for(const [i,label,color] of [[4,"MODIS only","#e99c65"],[6,"Both sensors","#ccba91"],[5,"VIIRS only","#a1bba5"]]){
    const seg=document.createElement("span");seg.style.width=(denom?100*total[i]/denom:0)+"%";seg.style.background=color;stack.append(seg);
    const line=document.createElement("div");line.className="keyline";line.style.setProperty("--key",color);
    line.innerHTML="<span>"+label+"</span><b>"+count(total[i])+"</b>";overlap.append(line);
  }
  const season=el("seasons");season.replaceChildren();const values=[0,0,0,0];
  for(const [m,r] of months)values[Math.floor((+m.slice(5)%12)/3)]+=metric(r,st.mode,st.measure);
  ["Winter · DJF","Spring · MAM","Summer · JJA","Autumn · SON"].forEach((label,i)=>{
    const div=document.createElement("div");div.className="seasonrow";
    div.innerHTML="<span>"+label+"</span><meter min='0' max='"+Math.max(1,...values)+"' value='"+values[i]+"'></meter><b>"+count(values[i])+"</b>";season.append(div);
  });
  el("seasonDesc").textContent="Recorded "+units(st.measure)+" across the date filter · unequal sampling";

}
function render(){
  const {months}=summarize(summary.daily,st.start,st.end),{start,end}=interval();
  const {total}=summarize(summary.daily,start,end),recorded=[...months].filter(([,r])=>raw(r,st.mode)>0),month=st.month??recorded.filter(([m])=>m+"-01">=st.start&&endMonth(m)<=st.end).at(-1)?.[0]??recorded.at(-1)?.[0]??key(st.start);

  const state=coverage(total,st.mode,start,end);
  const showValue=(value,s)=>s==="positive_detection"?count(value):s==="platform_not_available"?"Unavailable":"No record";
  const u=metric(total,st.mode,st.measure);
  el("metricLabel").textContent=(st.mode==="integrated"?"Integrated":st.mode)+" "+units(st.measure);
  el("qualityLabel").textContent=st.measure==="cells"?"MODIS ≥30 · VIIRS nominal/high":"All confidence levels · original rows";
  el("union").textContent=showValue(u,state);el("mraw").textContent=showValue(total[0],coverage(total,"MODIS",start,end));el("vraw").textContent=showValue(total[1],coverage(total,"VIIRS",start,end));
  el("vraw").textContent=end<"2012-01-20"?"Unavailable · starts 2012":el("vraw").textContent;
  el("vraw").title=end<"2012-01-20"?"Not available (sensor record begins 2012)":"Suomi NPP through 2 November 2026";
  const picker=el("monthPick");picker.min=key(st.start);picker.max=key(st.end);picker.value=month;
  el("peakValue").textContent=st.month?"Daily detail selected":"Preview · choose any month";
  for(const b of document.querySelectorAll("[data-mode]"))b.setAttribute("aria-pressed",b.dataset.mode===st.mode);
  calendar(months);dailyView(month);history(month);breakdown(total,months);
  el("detailTitle").textContent=monthLabel(month)+" in context";
  el("detailContext").textContent=niceRegion()+" · "+(st.month?"selected month":"month preview");
  el("coverageNote").textContent=era(start,end)+". Detections document activity. Silent dates have unknown coverage. The dates can include partial years. Calibration and anomaly baselines are unavailable for this region. Rectangles select reported point centers before daily grid occupancy is calculated.";
  const advisory=gapWarning(start,end,st.mode);if(advisory)el("coverageNote").textContent+=" "+advisory+" within this interval.";
  const context=st.day?formatDate(st.day):st.month?monthLabel(st.month):formatDate(start)+" – "+formatDate(end);
  el("union").title=el("mraw").title="Recorded within "+context;
  el("metricScope").textContent=niceRegion()+"  /  "+(st.bounds?"Custom area":"Full study area")+"  /  "+context+"  /  "+(st.mode==="integrated"?"Integrated":st.mode)+" "+units(st.measure)+" / "+el("classification").selectedOptions[0].text;
  showMap({...st,start,end,sources,total:st.measure==="raw"?raw(total,st.mode):st.mode==="MODIS"?total[2]:st.mode==="VIIRS"?total[3]:total[2]+total[3]}).catch(fail);
}
function applyArea(bounds){
  if(!parentDaily||st.region!==el("region").value)return;
  const id=++queryId;
  function finish(rows){
    if(queryId!==id)return;
    st.bounds=bounds;summary.daily=rows;days=new Map(rows.map(([d,...v])=>[d,v]));
    showBounds(bounds);lockView(false);notice("");render();
  }
  if(!bounds && st.classification==="all"){finish(parentDaily);return}
  lockView(true);notice("Calculating this rectangle from the full observation index…");
  if(!areaWorker)areaWorker=new Worker(new URL("./area-worker.js",import.meta.url),{type:"module"});
  const failed=message=>{
    if(queryId!==id)return;
    st.classification=el("classification").value="all";st.bounds=null;summary.daily=parentDaily;days=new Map(parentDaily.map(([d,...v])=>[d,v]));
    showBounds(null);lockView(false);render();notice("Area calculation failed. Showing the full study area. "+message);
  };
  areaWorker.onerror=e=>failed(e.message);
  areaWorker.onmessage=({data})=>{if(data.id!==id)return;if(data.error)failed(data.error);else finish(data.rows)};
  areaWorker.postMessage({id,bounds,classification:st.classification,region:st.region,start:st.start,end:st.end});
}
async function changeRegion(){
  const ticket=++loadedRegion;++queryId;lockView(true);
  const region=el("region").value;notice("Loading "+(region==="lahore"?"Lahore":"California")+" observations…");
  try{
    const result=await data(region+"/summary.json"); if(ticket!==loadedRegion)return;
    if(!sources)sources=await data("sources.json");if(ticket!==loadedRegion)return;
    await initMap(region,result.envelope,applyArea);if(ticket!==loadedRegion)return;
    parentDaily=result.daily;summary={...result};st.bounds=null;st.region=region;sourceSet=sources.filter(s=>s.region===region);
    days=new Map(summary.daily.map(([d,...v])=>[d,v]));st.month=st.day=null;st.start=result.first;st.end=result.last;
    for(const id of ["start","end"]){const input=el(id);input.min=result.first;input.max=result.last;input.value=st[id]}
    applyArea(null);
  }catch(e){if(ticket===loadedRegion)fail(e)}
}
function dialog(title,content){
  el("dtitle").textContent=title;el("dcontent").replaceChildren(content);el("dialog").showModal();
}
function info(title,build){
  if(busy)return;
  const div=document.createElement("div");build(div);dialog(title,div);
}
const add=(host,tag,text)=>{const e=document.createElement(tag);e.textContent=text;host.append(e);return e};
function method(){
  info("Methods and coverage",div=>{
    add(div,"h3","From observations to activity");add(div,"p","MODIS records thermal anomalies at approximately 1 km; VIIRS S-NPP at 375 m. Raw views include all confidence levels within the classification selected. Archive type 0 is presumed vegetation. Types 1–3 identify volcanic, static land and offshore sources. NRT type is unknown. Detections may represent repeated observations or industrial heat.");
    add(div,"h3","Common-grid integration");add(div,"p","MODIS confidence ≥30 and VIIRS nominal/high records enter a fixed 0.02° grid anchored at 180°W, 90°S. A cell occupied by either sensor counts once per UTC day. Cell area varies with latitude; orbit, cloud and sensor sensitivity still affect counts.");
    const c=summary.calibration;add(div,"h3",niceRegion()+" · calibrated comparison unavailable");
    add(div,"p","Full parent rectangle: "+count(c.paired_months)+" months had positive retained activity from both instruments across "+Object.keys(c.paired_by_year).length+" years. Independently supported paired months: "+c.supported_months+". "+c.reason+" No reference-scale coefficient or anomaly score is published.");
    const diag=summary.overlap_diagnostic;
    if(diag?.mae)add(div,"p","Archive-only sensitivity check, all types. A median ratio fitted on "+diag.train_n+" paired positive months in 2013–2023 gave held-out MAE "+diag.mae.scaled.toFixed(1)+" versus "+diag.mae.unadjusted.toFixed(1)+" unscaled cell-days/month on "+diag.holdout_n+" paired months in 2024–2025. Coverage remains unverified.");
    const det=add(div,"details","");add(det,"summary","Paired months by year");add(det,"p",Object.entries(c.paired_by_year).map(([y,n])=>y+" · "+n).join("  /  "));
    add(div,"h3","Reading the calendar");add(div,"p","Colors follow positive monthly totals within the current date filter at the 20th, 40th, 60th, 77th, 90th and 98th percentiles. Hatching marks unknown days; a slash marks unavailable platforms. A zero with source detections means no retained grid activity. The dashed 2012 row marks S-NPP entry. Partial years carry an asterisk.");
    add(div,"h3","Geographic and temporal support");add(div,"p","Rectangle outlines enclose all supplied point centers. Requested boundaries and complete overpass windows are unknown. Custom areas select original point centers inside or on the rectangle before computing grid occupancy. Map dots are sampled. The map includes public-domain Natural Earth context; optional street tiles are attributed to OpenStreetMap.");
    add(div,"h3","Historical comparisons");add(div,"p","Seasonal totals describe the selected archive. The same-month chart matches day-of-month bounds and sensor era. Peak rankings are withheld because observation effort is unknown. A descriptive reference median requires archive detections on every matched day from every active selected sensor in the target and five other years, outside flagged MODIS periods. Positive records establish only that detections were recorded. Valid anomaly baselines require five comparable reference years and verified target support. Unknown observation effort precludes those comparisons here.");
    const a=add(div,"a","NASA FIRMS product readme and disclaimer ↗");a.href="https://firms.modaps.eosdis.nasa.gov/download/Readme.txt";
  });
}
function audit(){
  info(niceRegion()+" source audit",div=>{
    add(div,"p","Four embedded CSVs · observed-point envelope [west, south, east, north] "+summary.envelope.join(", ")+". Request dates and rectangle coordinates are undocumented.");
    for(const s of sourceSet){
      const d=add(div,"details","");add(d,"summary",s.sensor+" · "+s.status+" · "+count(s.rows)+" rows");
      add(d,"p",s.zip+" / "+s.member);add(d,"p",s.first+" to "+s.last+" UTC · "+s.values.satellite.join(", ")+" · versions "+s.values.version.join(", "));
      add(d,"p","Retained "+count(s.retained)+" · confidence excluded "+count(s.quality_excluded)+" · duplicates "+s.duplicates+" · invalid "+s.invalid+" · clipped "+s.clipped+". Type values: "+s.values.type.join(", ")+".");
      add(d,"p","SHA-256 "+s.sha256);
    }
    const a=add(div,"a","Download complete eight-member manifest (JSON)");a.href="data/sources.json";a.download="IGNIS-source-manifest.json";
  });
}
function exporter(){
  info("Export selection",div=>{
    const {start,end}=interval();add(div,"p",niceRegion()+" · "+formatDate(start)+" to "+formatDate(end)+" UTC · "+st.mode+" · "+units(st.measure)+" · "+(st.bounds?"Custom area "+st.bounds.join(", "):"Full study area")+". Includes source counts, grid overlap, method, coverage and baseline status.");
    for(const frequency of ["daily","monthly"]){
      const b=add(div,"button",frequency==="daily"?"Download daily CSV":"Download monthly CSV");
      b.onclick=()=>{
        const rows=rowsForExport({...st,start,end,daily:summary.daily,frequency,sourceIds:sourceSet,envelope:summary.envelope,contextStart:st.start,contextEnd:st.end});
        const url=URL.createObjectURL(new Blob([csv(rows)],{type:"text/csv;charset=utf-8"}));
        const a=document.createElement("a");a.href=url;a.download=["IGNIS",st.region,st.mode,st.measure,st.classification,frequency,st.bounds?"custom":"parent",start,end].join("_")+".csv";a.click();
        setTimeout(()=>URL.revokeObjectURL(url),3000);
      };
    }
  });
}
el("monthHeader").innerHTML="<th scope='col'>Year</th>"+MONTHS.map(m=>"<th scope='col'>"+m+"</th>").join("");
el("region").onchange=changeRegion;
el("classification").onchange=()=>{st.classification=el("classification").value;applyArea(st.bounds)};
el("measure").onchange=()=>{st.measure=el("measure").value;if(!busy)render()};
el("monthPick").onchange=()=>{const input=el("monthPick");if(!busy && input.value && input.validity.valid)selectMonth(input.value)};

for(const id of ["start","end"])el(id).onchange=()=>{
  if(busy)return;
  const a=el("start"),b=el("end");
  if(!a.value||!b.value||!a.validity.valid||!b.validity.valid||a.value>b.value){notice("Choose dates within the observed span, with start on or before end. The last valid view remains visible.");return}
  notice("");st.start=a.value;st.end=b.value;st.month=st.day=null;applyArea(st.bounds);
};
el("reset").onclick=()=>{if(!busy){el("start").value=summary.first;el("end").value=summary.last;el("end").onchange()}};
for(const b of document.querySelectorAll("[data-mode]"))b.onclick=()=>{if(!busy){st.mode=b.dataset.mode;render()}};
el("clearMonth").onclick=()=>selectMonth(null,false);
el("method").onclick=el("moreScience").onclick=method;el("audit").onclick=audit;el("exportOpen").onclick=exporter;
el("closeDialog").onclick=()=>el("dialog").close();
el("dialog").onclick=e=>{if(e.target===el("dialog")){const r=el("dialog").getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)el("dialog").close()}};
const axis=document.createElement("div");axis.id="historyAxis";el("historyChart").after(axis);
const scope=document.createElement("div");scope.id="metricScope";scope.className="scope";document.querySelector(".metrics").before(scope);

changeRegion();
