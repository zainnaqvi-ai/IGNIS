import {MONTHS,count,min,max,key,monthLabel,endMonth,next,empty,sum,metric,units,raw,coverage,supportText,era,summarize,rowsForExport,csv,recordedDistribution,unusualness,seasonalSummary,gapWarning,sameMonthSeries,configuration,referenceMessage,referenceIssueText} from "./model.js";
import {data,initMap,showMap} from "./map.js";
import {showBounds} from "./draw.js";
import {calendarSVG,canDownloadRecords,saveDownload,selectedRecordCSV} from "./exports.js";
const el=id=>document.getElementById(id);
const st={region:"lahore",mode:"integrated",measure:"cells",classification:"all",referencePolicy:"earlier",bounds:null,start:"",end:"",month:null,day:null};
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
  const highList=el("highList");highList.replaceChildren();
  const thresholds=bins([...months.values()].map(r=>metric(r,st.mode,st.measure)));
  el("scaleLow").textContent="Low · "+count(thresholds[0]);el("scaleHigh").textContent="High ≥ "+count(thresholds.at(-1));
  if(![...months.values()].some(r=>metric(r,st.mode,st.measure)>0)){el("scaleLow").textContent="No positive values";el("scaleHigh").textContent=""}
  const lo=+st.start.slice(0,4),hi=+st.end.slice(0,4);
  el("unitTag").textContent=units(st.measure);
  el("calDesc").textContent=(st.mode==="integrated"?(st.measure==="raw"?"Combined":"Integrated"):st.mode)+" · "+(st.measure==="cells"?"occupied cell-days per month":"raw detections per month")+" · "+lo+"–"+hi+" · UTC";
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
      if(v>0 && v>=thresholds.at(-1)){
        const jump=document.createElement("button");
        jump.textContent=monthLabel(month)+" · "+count(v)+" "+units(st.measure)+(first>month+"-01"||last<endMonth(month)?" · partial":"");
        jump.title=desc;jump.setAttribute("aria-label",desc);jump.dataset.period=month;
        jump.onclick=()=>{selectMonth(month);el("heatBody").querySelector('[data-month="'+month+'"]').scrollIntoView({block:"nearest"})};
        highList.append(jump);
      }
      b.onkeydown=e=>{
        const off={ArrowLeft:-1,ArrowRight:1,ArrowUp:12,ArrowDown:-12}[e.key];if(!off)return;
        e.preventDefault();const t=new Date(Date.UTC(y,m-1+off,1)).toISOString().slice(0,7);
        body.querySelector('[data-month="'+t+'"]')?.focus();
      };
    }
    frag.append(tr);
  }
  body.replaceChildren(frag);
  highList.replaceChildren(...Array.from(highList.children).sort((a,b)=>a.dataset.period.localeCompare(b.dataset.period)));
  el("highScope").textContent=highList.childElementCount
    ?"Recorded totals ≥ "+count(thresholds.at(-1))+" "+units(st.measure)+" in this view. Dates are chronological. Sensor era and observation effort vary."
    :"No positive months for these filters.";
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
  const targetFirst=st.day??max(month+"-01",st.start),targetLast=st.day??min(endMonth(month),st.end);
  const targetEra=configuration(targetFirst,targetLast,st.mode),firstDay=targetFirst.slice(-2),lastDay=targetLast.slice(-2);
  const values=sameMonthSeries(days,month,st.start,st.end,st.mode,st.measure,targetFirst,targetLast).filter(x=>st.referencePolicy!=="earlier"||x.m<=month);
  const n=values.filter(x=>x.s==="positive_detection"&&x.m!==month).length, maxValue=Math.max(...values.map(x=>x.v),1);
  const reference=recordedDistribution(values,month,st.referencePolicy);
  const matchedDays=firstDay===lastDay?"day "+firstDay:"days "+firstDay+"–"+lastDay;
  el("baselineText").textContent=MONTHS[+month.slice(5)-1]+" · "+matchedDays+" · "+n+" "+(st.referencePolicy==="earlier"?"earlier":"other")+" years recorded · "+reference.n+" reference-eligible";
  el("baselineText").title="Same calendar dates and selected sensor configuration: "+targetEra+". Reference statistics use only eligible archive-supported years.";
  const chart=el("historyChart");chart.replaceChildren();
  const fmt=x=>Number(x.toFixed(1)).toLocaleString("en-US");
  const readout=reference.available?"Reference median: "+fmt(reference.median)+" "+units(st.measure)+" · "+reference.n+" eligible "+(st.referencePolicy==="earlier"?"earlier":"other")+" years":referenceMessage(reference);
  for(const {m,v,s,r,partial,referenceIssues} of values){
    const b=document.createElement("button");b.className="histbar"+(s!=="positive_detection"?" gap":"")+(m===month?" selected":"");
    const periodLabel=st.day?formatDate(m+"-"+firstDay):monthLabel(m);
    b.style.maxWidth="36px";b.style.height=Math.max(4,100*v/maxValue)+"%";b.title=periodLabel+" · "+(s==="positive_detection"?count(v)+" "+units(st.measure):supportText(s,r,st.mode,st.measure))+(partial&&!st.day?" · partial":"");
    b.title+=" · "+(m===month?"Selected period; excluded from its own reference. ":"")+(referenceIssues.length?referenceIssues.map(referenceIssueText).join("; "):m===month?"Daily archive records supported":"Eligible reference year");
    b.setAttribute("aria-label",b.title);b.onfocus=b.onmouseenter=()=>el("histReadout").textContent=b.title;
    b.onblur=b.onmouseleave=()=>el("histReadout").textContent=readout;
    b.onclick=()=>{
      const dayOfMonth=st.day?.slice(8);
      if(!dayOfMonth){selectMonth(m);return}
      st.month=m;st.day=m+"-"+dayOfMonth;render();
      el("dailyChart").querySelector('[data-day="'+st.day+'"]')?.focus({preventScroll:true});
    };
    chart.append(b);
  }
  const a=el("historyAxis");a.textContent=values.length?values[0].m.slice(0,4)+" – "+values.at(-1).m.slice(0,4)+" · chronological":"No matching calendar periods";
  el("histReadout").textContent=readout;
  el("referenceStats").textContent=reference.available?"Middle 50%: "+fmt(reference.q25)+"–"+fmt(reference.q75)+" "+units(st.measure):"";
  el("referenceStats").title="Reference years: "+reference.years.join(", ")+". Conditional on daily archive records; observation coverage is unknown.";
  el("unusualLabel").textContent=unusualness(reference);
  el("unusualContext").textContent=(st.day?formatDate(st.day):monthLabel(month))+" · "+niceRegion();
  el("unusualDetail").textContent=reference.available?"Selected: "+count(values.find(x=>x.m===month).v)+" · reference median: "+fmt(reference.median)+" "+units(st.measure)+" across "+reference.n+" eligible years.":reference.n?reference.n+" "+(st.referencePolicy==="earlier"?"earlier":"other")+" years meet the archive rule; the selected period must meet it too.":"Recorded bars remain descriptive; missing records do not establish zero activity.";
  if(reference.available&&reference.n<8)el("unusualDetail").textContent+=" An unusualness label needs at least eight.";
  if(reference.reasonCode==="few_reference_years")el("unusualDetail").textContent=referenceMessage(reference);
  el("unusualLabel").title="Descriptive reference only. Higher/lower labels require eight eligible years, a nonzero MAD, an outer-decile rank and an absolute scaled robust deviation of at least 2. No significance or forecast is inferred.";
}
function breakdown(){
  const season=el("seasons");season.replaceChildren();
  const rows=seasonalSummary(days,st.start,st.end,st.mode,st.measure);
  for(const r of rows){
    const div=document.createElement("div");div.className="seasonrow";
    const label=document.createElement("span");label.textContent=r.label;
    const small=document.createElement("small");small.textContent=r.calendarMonths+" calendar months"+(r.partialMonths?" · "+r.partialMonths+" partial":"");label.append(small);
    const meter=document.createElement("meter");meter.min=0;meter.max=Math.max(1,...rows.map(x=>x.total));meter.value=r.total;
    meter.setAttribute("aria-label",r.label+": "+r.total+" "+units(st.measure)+" over "+r.calendarDays+" selected days; descriptive total");
    const value=document.createElement("b");value.textContent=r.recordedDays?count(r.total):"No record";
    div.title=r.calendarDays+" selected calendar days; "+r.recordedMonths+" months with detections. Observation exposure is unknown.";
    div.append(label,meter,value);season.append(div);
  }
  el("seasonDesc").textContent="Recorded "+units(st.measure)+" totals · full date filter";
}

function render(){
  const {months}=summarize(summary.daily,st.start,st.end),{start,end}=interval();
  const {total}=summarize(summary.daily,start,end),recorded=[...months].filter(([,r])=>raw(r,st.mode)>0),month=st.month??recorded.filter(([m])=>m+"-01">=st.start&&endMonth(m)<=st.end).at(-1)?.[0]??recorded.at(-1)?.[0]??key(st.start);

  const state=coverage(total,st.mode,start,end);
  const showValue=(value,s)=>s==="positive_detection"?count(value):s==="platform_not_available"?"Unavailable":"No record";
  const u=metric(total,st.mode,st.measure);
  el("metricLabel").textContent=(st.mode==="integrated"?(st.measure==="raw"?"Combined raw":"Integrated"):st.mode)+" "+units(st.measure);
  el("measurementNote").textContent=st.measure==="raw"?"Raw detections count source records at all confidence levels. Combined totals are uncalibrated sums, not individual fires.":"Cell-days measure occupied grid cells over time, not individual fires. Sensor totals can overlap.";
  el("qualityLabel").textContent=st.measure==="cells"?"MODIS ≥30 · VIIRS nominal/high":"All confidence levels · source rows";
  el("union").textContent=showValue(u,state);el("mraw").textContent=showValue(metric(total,"MODIS",st.measure),coverage(total,"MODIS",start,end));el("vraw").textContent=showValue(metric(total,"VIIRS",st.measure),coverage(total,"VIIRS",start,end));
  el("modisLabel").textContent="MODIS "+units(st.measure);el("viirsLabel").textContent="VIIRS "+units(st.measure);
  el("vraw").title=end<"2012-01-20"?"Not available (sensor record begins 2012)":"Suomi NPP through 2 November 2026";
  const picker=el("monthPick");picker.min=key(st.start);picker.max=key(st.end);picker.value=month;
  el("peakValue").textContent=st.month?"Daily detail selected":"Preview · choose any month";
  for(const b of document.querySelectorAll("[data-mode]"))b.setAttribute("aria-pressed",b.dataset.mode===st.mode);
  calendar(months);dailyView(month);history(month);breakdown();
  el("detailTitle").textContent=monthLabel(month)+" in context";
  el("detailContext").textContent=niceRegion()+" · "+(st.month?"selected month":"month preview");
  const advisory=gapWarning(start,end,st.mode);
  el("coverageNote").textContent="Blank records do not confirm no burning. "+(advisory?"This interval includes a historical MODIS data-gap advisory. ":"")+(st.classification!=="all"?"NRT classification is unknown.":"");
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
  info("About recorded activity",div=>{
    add(div,"p","Cell-days count occupied 0.02° cells once per UTC day. They measure recorded thermal activity, not individual fires or burned area. Raw detections count supplied observations.");
    add(div,"p","Integrated combines MODIS and VIIRS. Sensor sensitivity and observation coverage differ, so comparisons describe the available records.");
    add(div,"p","The historical chart matches calendar dates and sensor eras. Earlier-years references exclude the selected year and later years. Unusualness describes recorded history, not a wildfire warning.");
    const link=add(div,"a","Read the scientific methods on GitHub ↗");link.href="https://github.com/zainnaqvi-ai/IGNIS/blob/main/docs/SCIENCE.md";
  });
}
function exporter(){
  info("Export selection",div=>{
    const {start,end}=interval(),selection={...st,start,end};
    const areaName=st.bounds?"custom_"+st.bounds.join("_"):"parent";
    const filename=(kind,first,last)=>["IGNIS",st.region,st.mode,st.measure,st.classification,kind,areaName,first,last].join("_");
    add(div,"p",niceRegion()+" · "+formatDate(start)+" to "+formatDate(end)+" UTC · "+st.mode+" · "+units(st.measure)+" · "+(st.bounds?"Custom area "+st.bounds.join(", "):"Full study area")+". Includes source counts, grid overlap, method, coverage and baseline status.");
    for(const frequency of ["daily","monthly"]){
      const b=add(div,"button",frequency==="daily"?"Download daily CSV":"Download monthly CSV");
      b.onclick=()=>{
        const rows=rowsForExport({...st,start,end,daily:summary.daily,frequency,sourceIds:sourceSet,envelope:summary.envelope,contextStart:st.start,contextEnd:st.end});
        saveDownload(new Blob([csv(rows)],{type:"text/csv;charset=utf-8"}),filename(frequency,start,end)+".csv");
      };
    }
    add(div,"h3","Hotspot records");
    const allowed=canDownloadRecords(start,end);
    const hint=add(div,"p",allowed?"One row per matching observation, with UTC date, point center, sensor, source member, inferred type and grid-retention flag.":"Select a month, a day or a date range of up to 31 UTC days to download individual observations.");
    add(div,"p","Grid view exports quality-retained observations; raw view includes all confidence levels. These are individual source records, not unique fires or cell-days. This static download omits acquisition time, FRP and original confidence values; consult the original FIRMS files for those fields.");
    hint.setAttribute("role","status");
    const points=add(div,"button","Download hotspot records CSV");points.disabled=!allowed;
    points.onclick=async()=>{
      points.disabled=true;hint.textContent="Preparing selected hotspot records…";
      try{
        const total=summarize(summary.daily,start,end).total;
        const expected=st.measure==="raw"?raw(total,st.mode):st.mode==="integrated"?total[2]+total[3]:total[st.mode==="MODIS"?2:3];
        const {blob,records}=await selectedRecordCSV(selection,sourceSet);
        if(records!==expected)throw new Error("Observation count differs from the selected analytics.");
        if(!div.isConnected||!el("dialog").open)return;
        saveDownload(blob,filename("hotspots",start,end)+".csv");
        hint.textContent=count(records)+" matching observation rows exported.";
      }catch(error){hint.textContent="Download failed. "+error.message}
      finally{points.disabled=false}
    };
    add(div,"h3","Calendar visualization");
    add(div,"p","Full calendar date filter · "+formatDate(st.start)+" to "+formatDate(st.end)+" UTC. The selected month is outlined.");
    add(div,"button","Download calendar SVG").onclick=()=>saveDownload(calendarSVG(st,summary.daily,el("heatBody"),summary.envelope),filename("calendar",st.start,st.end)+".svg");
  });
}
el("monthHeader").innerHTML="<th scope='col'>Year</th>"+MONTHS.map(m=>"<th scope='col'>"+m+"</th>").join("");
el("region").onchange=changeRegion;
el("classification").onchange=()=>{st.classification=el("classification").value;applyArea(st.bounds)};
el("measure").onchange=()=>{st.measure=el("measure").value;if(!busy)render()};
el("referencePolicy").onchange=()=>{st.referencePolicy=el("referencePolicy").value;if(!busy)render()};
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
el("method").onclick=method;el("exportOpen").onclick=exporter;
el("closeDialog").onclick=()=>el("dialog").close();
el("dialog").onclick=e=>{if(e.target===el("dialog")){const r=el("dialog").getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)el("dialog").close()}};
const axis=document.createElement("div");axis.id="historyAxis";el("historyChart").after(axis);
const scope=document.createElement("div");scope.id="metricScope";scope.className="scope";document.querySelector(".metrics").before(scope);

changeRegion();
