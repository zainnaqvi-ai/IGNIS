import {inside,matchesType} from "./area.js";
import {MONTHS,count,empty,metric,summarize,units} from "./model.js";

const epochDay=date=>Date.parse(date)/86400000;
export const canDownloadRecords=(start,end)=>epochDay(end)-epochDay(start)>=0 && epochDay(end)-epochDay(start)<31;

// The index has one entry per valid source observation. Use its raw fields
// directly; map marker thinning and unique-cell aggregation never enter here.
export async function selectedRecordCSV(selection,sources){
  const {region,start,end,mode,measure,bounds,classification}=selection;
  if(!canDownloadRecords(start,end))throw new Error("Select at most 31 UTC days.");
  const first=epochDay(start),last=epochDay(end);
  const parts=["region,acq_date_utc,longitude,latitude,sensor,processing,source_member,firms_type,inferred_class,grid_retained\r\n"];
  const classes=["unknown","presumed vegetation fire","active volcano","other static land source","offshore"];
  const memberByProduct=new Map(sources.filter(s=>s.region===region).map(s=>[s.sensor+"/"+s.status,s.member]));
  let records=0,lines=[];
  for(let year=Number(start.slice(0,4));year<=Number(end.slice(0,4));year++){
    const response=await fetch("data/"+region+"/area/"+year+".bin");
    if(!response.ok)throw new Error("Could not load the observation index for "+year+".");
    const view=new DataView(await response.arrayBuffer());
    if(view.byteLength%12)throw new Error("Incomplete spatial index.");
    let date="",previousDay=-1;
    for(let offset=0;offset<view.byteLength;offset+=12){
      const day=view.getUint16(offset+8,true);
      if(day<first)continue;
      if(day>last)break;
      const flags=view.getUint8(offset+10),code=view.getUint8(offset+11);
      const sensor=(flags&2)?"VIIRS":"MODIS",retained=Boolean(flags&4);
      if((mode!=="integrated"&&mode!==sensor)||(measure==="cells"&&!retained)||!matchesType(code,classification))continue;
      const lon=view.getInt32(offset,true)/1e7,lat=view.getInt32(offset+4,true)/1e7;
      if(!inside(lon,lat,bounds))continue;
      if(day!==previousDay){date=new Date(day*86400000).toISOString().slice(0,10);previousDay=day}
      const processing=(flags&1)?"nrt":"archive",member=memberByProduct.get(sensor+"/"+processing);
      if(!member || code>=classes.length)throw new Error("Unexpected source metadata.");
      const quotedMember='"'+member.replaceAll('"','""')+'"';
      lines.push([region,date,lon,lat,sensor,processing,quotedMember,code?code-1:"",classes[code],retained].join(",")+"\r\n");
      records++;
      if(lines.length===4096){parts.push(lines.join(""));lines=[]}
    }
  }
  parts.push(lines.join(""));
  return {blob:new Blob(parts,{type:"text/csv;charset=utf-8"}),records};
}

const escapeXML=value=>String(value).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
export function calendarSVG(selection,daily,tableBody,envelope){
  const {region,start,end,mode,measure,classification,bounds,month}=selection;
  const {months}=summarize(daily,start,end);
  const rows=Array.from(tableBody.rows);
  const width=1000,left=86,top=124,cellWidth=73,cellHeight=28;
  const bottom=top+rows.length*cellHeight,height=bottom+88;
  const text=(x,y,value,attrs="")=>'<text x="'+x+'" y="'+y+'" '+attrs+'>'+escapeXML(value)+'</text>';
  const title="IGNIS · Recorded burning activity";
  const subtitle=[region==="lahore"?"Lahore":"California",mode,units(measure),classification+" class selection",start+" to "+end+" UTC"].join("  /  ");
  const geography=(bounds?"Custom area":"Study envelope")+" W/S/E/N: "+(bounds??envelope).join(", ")+"°";
  const parts=['<svg xmlns="http://www.w3.org/2000/svg" width="'+width+'" height="'+height+'" viewBox="0 0 '+width+' '+height+'" role="img" aria-labelledby="title description">',
    '<title id="title">'+title+'</title><desc id="description">'+escapeXML(subtitle+". "+geography+". Each month has its recorded value or coverage state. Darker cells show higher recorded totals within this selection.")+'</desc>',
    '<rect width="100%" height="100%" fill="#f7f5ef"/><g font-family="Arial,sans-serif" font-size="13" fill="#183e34">',
    text(24,30,title,'font-size="22" font-weight="bold"'),text(24,55,subtitle),text(24,77,geography)];
  MONTHS.forEach((label,i)=>parts.push(text(left+i*cellWidth+(cellWidth-4)/2,top-10,label,'text-anchor="middle"')));
  rows.forEach((row,i)=>{
    const y=top+i*cellHeight;
    parts.push(text(24,y+17,row.cells[0].textContent));
    Array.from(row.querySelectorAll("button")).forEach((button,j)=>{
      const m=button.dataset.month;
      let value=button.textContent;
      if(value==="")value=count(metric(months.get(m)??empty(),mode,measure));
      const x=left+j*cellWidth,fill=button.style.backgroundColor||"#e6e8df";
      const selected=m&&m===month?' stroke="#183e34" stroke-width="3"':"";
      parts.push("<g><title>"+escapeXML(button.getAttribute("aria-label"))+"</title>",
        '<rect x="'+x+'" y="'+y+'" width="'+(cellWidth-4)+'" height="24" rx="3" fill="'+fill+'"'+selected+'/>',
        text(x+(cellWidth-4)/2,y+16,value,'text-anchor="middle" fill="'+(button.style.color||"#183e34")+'"'),"</g>");
    });
  });
  parts.push(text(24,bottom+21,"· unknown coverage     / platform unavailable     – outside date filter     * partial year     outline = selected month"),
    text(24,bottom+42,measure==="cells"?"Occupied 0.02° cells per UTC day, summed over each month. MODIS confidence ≥30; VIIRS nominal/high.":"Raw source detections summed over each month, across all confidence levels."),
    text(24,bottom+63,"Source: NASA FIRMS. Color intensity is relative to the selected calendar. Observation completeness is unknown."),"</g></svg>");
  return new Blob(parts,{type:"image/svg+xml;charset=utf-8"});
}

export function saveDownload(blob,filename){
  const link=document.createElement("a"),url=URL.createObjectURL(blob);
  link.href=url;link.download=filename;link.click();
  setTimeout(()=>URL.revokeObjectURL(url),3000);
}
