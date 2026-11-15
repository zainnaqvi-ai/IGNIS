import {count, monthLabel} from "./model.js";
import {inside,matchesType} from "./area.js";
import {setupDrawing} from "./draw.js";
const el=id=>document.getElementById(id);
const cache=new Map();
export function data(path) {
  if(!cache.has(path)) cache.set(path,fetch("data/"+path).then(r=>{
    if(!r.ok) throw new Error("Could not load "+path);
    return r.json();
  }).catch(e=>{cache.delete(path);throw e}));
  return cache.get(path);
}
let map, geography, observations, rectangle, tile, regionVersion=0, selectionVersion=0;
const sites={
  lahore:[[31.55,74.34,"Lahore"],[31.71,73.99,"Sheikhupura"],[31.12,74.45,"Kasur"]],
  california:[[38.58,-121.49,"Sacramento"],[34.05,-118.24,"Los Angeles"],[37.77,-122.42,"San Francisco"],[36.74,-119.79,"Fresno"],[40.59,-122.39,"Redding"],[39.53,-119.81,"Reno"],[36.17,-115.14,"Las Vegas"]]
};
function fit(){if(rectangle) map.fitBounds(rectangle.getBounds(),{padding:[16,12],animate:false})}
export async function initMap(region,envelope,onArea) {
  const token=++regionVersion;
  ++selectionVersion;
  if(!map){
    map=L.map("map",{preferCanvas:true,scrollWheelZoom:false,zoomSnap:.1,minZoom:2,maxZoom:16,attributionControl:true});
    map.attributionControl.setPrefix(false);
    map.attributionControl.addAttribution('Natural Earth · NASA FIRMS');
    L.control.scale({imperial:false,maxWidth:75}).addTo(map);
    el("fitMap").onclick=fit;
    tile=L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'});
    tile.on("tileerror",()=>{
      if(map.hasLayer(tile)){map.removeLayer(tile);geography.addTo(map);rectangle.bringToFront();observations?.eachLayer(p=>p.bringToFront());el("streets").checked=false;el("mapDesc").textContent="Street tiles unavailable · showing offline geography."}
    });
    el("streets").onchange=()=>{
      if(el("streets").checked){geography.remove();tile.addTo(map)}
      else{tile.remove();geography.addTo(map);rectangle.bringToFront();observations?.eachLayer(p=>p.bringToFront())}
    };
    new ResizeObserver(()=>{map.invalidateSize({pan:false})}).observe(el("map"));
  }
  if(geography) geography.remove();
  if(observations) observations.remove();
  if(rectangle) rectangle.remove();
  if(map.hasLayer(tile)) map.removeLayer(tile);
  el("streets").checked=false;
  geography=L.layerGroup().addTo(map);
  const [w,s,e,n]=envelope;
  rectangle=L.rectangle([[s,w],[n,e]],{color:"#79613d",weight:2,dashArray:"6 5",fill:false,interactive:false}).addTo(map);
  fit();
  const lines=await data(region+"/backdrop.json");
  if(token!==regionVersion) return;
  for(const [layer,coords] of lines) {
    const ll=coords.map(([x,y])=>[y,x]);
    if(layer==="land") L.polygon(ll,{stroke:true,color:"#9cab95",weight:1,fillColor:"#e6e9da",fillOpacity:1,interactive:false}).addTo(geography);
    else L.polyline(ll,{color:layer==="states"?"#6b735f":"#608082",weight:1,opacity:.75,interactive:false}).addTo(geography);
  }
  const step=region==="lahore"?.1:2;
  for(let v=Math.floor((w-step)/step)*step;v<=e+step;v+=step)
    L.polyline([[s-step,v],[n+step,v]],{color:"#b2c1ac",weight:.5,opacity:.17,interactive:false}).addTo(geography);
  for(let v=Math.floor((s-step)/step)*step;v<=n+step;v+=step)
    L.polyline([[v,w-step],[v,e+step]],{color:"#b2c1ac",weight:.5,opacity:.17,interactive:false}).addTo(geography);
  for(const [lat,lon,name] of sites[region]){
    L.marker([lat,lon],{icon:L.divIcon({className:"maplabel",html:name,iconAnchor:[-3,-3]}),interactive:false,keyboard:false}).addTo(geography);
  }
  rectangle.bringToFront();
  setupDrawing(map,envelope,onArea);
}
function popup(month,r,source){
  const [day,time,lat,lon,,sat,conf,frp,dn,type,version,kept]=r;
  const content=document.createElement("div");
  const title=document.createElement("strong");title.textContent=source.sensor+" · "+sat;content.append(title);
  for(const line of [month+"-"+String(day).padStart(2,"0")+" · "+time.slice(0,2)+":"+time.slice(2)+" UTC",
    lat+"°, "+lon+"°","Confidence "+conf+" · FRP "+(frp===null?"unknown":frp+" MW"),
    (dn==="D"?"Day":"Night")+" · "+(({"0":"Presumed vegetation fire","1":"Active volcano","2":"Other static land source","3":"Offshore"})[type]??"Unknown classification")+" · Version "+version,
    kept?"Retained for grid":"Excluded by grid quality rule",source.member]){
    const block=document.createElement("div");block.textContent=line;content.append(block);
  }
  return content;
}
export async function showMap({region,start,end,mode,measure,bounds,classification,sources,total}) {
  const token=++selectionVersion;
  if(observations) observations.remove();
  observations=L.layerGroup().addTo(map);
  el("samples").replaceChildren();el("mapCount").textContent="Loading mapped observations…";
  el("mapDesc").textContent=(region==="lahore"?"Lahore":"California")+" · observed-point envelope";
  let rows=[];
  const firstYear=Number(start.slice(0,4)),lastYear=Number(end.slice(0,4));
  if(lastYear-firstYear<=1){
    const years=Array.from({length:lastYear-firstYear+1},(_,i)=>firstYear+i);
    const parts=await Promise.all(years.map(y=>data(region+"/maps/"+y+".json")));
    for(const part of parts) for(const [month,points] of Object.entries(part)){
      if(month<start.slice(0,7)||month>end.slice(0,7)) continue;
      for(const p of points) rows.push([month,...p]);
    }
  }else rows=await data(region+"/overview.json");
  if(token!==selectionVersion) return;
  const eligible=rows.filter(row=>{
    const [month,day]=row, id=row[5], kept=row[12];
    const date=month+"-"+String(day).padStart(2,"0");
    return matchesType(({"0":1,"1":2,"2":3,"3":4})[row[10]]??0,classification) && date>=start && date<=end && inside(row[4],row[3],bounds) && (mode==="integrated" || sources[id].sensor===mode) && (measure==="raw" || kept===1);
  });
  const cap=Math.min(650,eligible.length);
  for(let i=0;i<cap;i++){
    const [month,...r]=eligible[Math.floor(i*eligible.length/cap)], source=sources[r[4]];
    const marker=L.circleMarker([r[2],r[3]],{radius:4.1,color:source.sensor==="MODIS"?"#a44729":"#3f657a",
      opacity:.95,weight:.55,fillOpacity:.68}).bindPopup(()=>popup(month,r,source)).addTo(observations);
    if(i%Math.max(1,Math.floor(cap/8))===0 && el("samples").children.length<8){
      const b=document.createElement("button");
      b.textContent=monthLabel(month)+" · "+source.sensor+" · "+r[2].toFixed(3)+"°";
      b.onclick=()=>{map.panTo(marker.getLatLng());marker.openPopup()};el("samples").append(b);
    }
  }
  el("mapCount").textContent="Display sample · "+count(cap)+" sampled points shown · "+count(total)+" "+(measure==="cells"?"retained":"raw")+" observations in interval";
}
