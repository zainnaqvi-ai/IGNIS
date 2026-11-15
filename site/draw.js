import {validateBounds} from "./area.js";

const el=id=>document.getElementById(id);
const fields=["west","south","east","north"];
let map,parent,current,onApply,layer,preview,mode="",anchor,pressed=false;
const leafletBounds=([w,s,e,n])=>[[s,w],[n,e]];
function message(text){el("areaHint").textContent=text}
function stop(){
  mode="";anchor=null;pressed=false;
  preview?.remove();preview=null;
  if(map){map.dragging.enable();map.getContainer().classList.remove("drawing")}
  el("cancelDraw").hidden=true;
}
export function showBounds(bounds){
  stop();current=bounds;layer?.remove();layer=null;
  const box=bounds??parent;
  fields.forEach((f,i)=>el(f).value=box[i]);
  el("areaName").textContent=bounds?"Custom area":"Full study area";
  el("areaExtent").textContent=fields.map((f,i)=>f[0].toUpperCase()+" "+box[i]+"°").join("   ·   ");
  el("editArea").disabled=el("resetArea").disabled=!bounds;
  if(bounds && !map.getPane("areaOutline")){const pane=map.createPane("areaOutline");pane.style.zIndex=450;pane.style.pointerEvents="none"}
  if(bounds)layer=L.rectangle(leafletBounds(bounds),{pane:"areaOutline",color:"#134f42",weight:3,fillColor:"#4c8265",fillOpacity:.09,interactive:false}).addTo(map);
  message(bounds?"Solid outline · reported centers on the boundary are included.":"Dashed outline · observed-point envelope.");
}
function submit(box){
  try{validateBounds(box,parent);onApply(box)}
  catch(e){stop();message(e.message)}
}
function arm(action){
  stop();mode=action;map.dragging.disable();map.getContainer().classList.add("drawing");el("cancelDraw").hidden=false;
  message(action==="draw"?"Drag between opposite corners inside the dashed outline.":"Drag from the corner you want to move. The opposite corner stays fixed.");
}
function pointer(e){
  if(!mode || e.target.closest(".leaflet-control"))return;
  if(e.type==="pointerdown" && (pressed||e.button!==0))return;
  const p=map.mouseEventToLatLng(e);
  const here=[p.lng,p.lat];
  e.preventDefault();e.stopImmediatePropagation();
  if(e.type==="pointerdown"){
    pressed=true;map.getContainer().setPointerCapture(e.pointerId);
    anchor=mode==="draw"?here:[Math.abs(here[0]-current[0])<Math.abs(here[0]-current[2])?current[2]:current[0],
      Math.abs(here[1]-current[1])<Math.abs(here[1]-current[3])?current[3]:current[1]];
  }
  if(!pressed)return;
  const box=[Math.min(anchor[0],p.lng),Math.min(anchor[1],p.lat),Math.max(anchor[0],p.lng),Math.max(anchor[1],p.lat)].map(v=>Number(v.toFixed(7)));
  if(e.type==="pointerup"){stop();submit(box);return}
  if(e.type==="pointermove"){
    if(!preview)preview=L.rectangle(leafletBounds(box),{color:"#195b49",weight:2,interactive:false}).addTo(map);
    else preview.setBounds(leafletBounds(box));
  }
}
export function setupDrawing(instance,envelope,callback){
  map=instance;parent=envelope;onApply=callback;
  for(const type of ["pointerdown","pointermove","pointerup"])map.getContainer().addEventListener(type,pointer,true);
  map.getContainer().onpointercancel=()=>{if(mode){stop();message("Area selection cancelled.")}};
  el("drawArea").onclick=()=>arm("draw");
  el("editArea").onclick=()=>arm("edit");
  el("cancelDraw").onclick=()=>showBounds(current);
  el("resetArea").onclick=()=>onApply(null);
  el("coords").onsubmit=e=>{e.preventDefault();submit(fields.map(f=>el(f).valueAsNumber))};
  showBounds(null);
}
