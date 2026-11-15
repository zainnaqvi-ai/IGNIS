import {empty} from "./model.js";

export function validateBounds(bounds, parent) {
  const [w,s,e,n]=bounds;
  if(bounds.length!==4 || !bounds.every(Number.isFinite) || w>=e || s>=n)
    throw new Error("Enter four coordinates with west < east and south < north.");
  if(w<parent[0] || s<parent[1] || e>parent[2] || n>parent[3])
    throw new Error("Choose a rectangle entirely inside the dashed study envelope.");
}
export function inside(x,y,bounds){
  return !bounds || (x>=bounds[0] && y>=bounds[1] && x<=bounds[2] && y<=bounds[3]);
}

// Rows sorted by UTC day. Only the current day's occupied cells need memory.
export function matchesType(code,selection){
  return selection==='all' || (selection==='vegetation' && code===1) || (selection==='other' && code>=2 && code<=4) || (selection==='unknown' && code===0);
}
export function queryYear(buffer,bounds,first,last,classification='all'){
  if(buffer.byteLength%12)throw new Error("Incomplete spatial index");
  const view=new DataView(buffer), output=[];
  let date=-1, row, cells;
  function finish(){
    if(!row)return;
    for(const flags of cells.values())row[flags===1?4:flags===2?5:6]++;
    output.push([new Date(date*86400000).toISOString().slice(0,10),...row]);
  }
  for(let i=0;i<view.byteLength;i+=12){
    const day=view.getUint16(i+8,true);
    if(day<first)continue;
    if(day>last)break;
    const x=view.getInt32(i,true), y=view.getInt32(i+4,true);
    if(!matchesType(view.getUint8(i+11),classification))continue;
    if(!inside(x/1e7,y/1e7,bounds))continue;
    if(day!==date){finish();date=day;row=empty();cells=new Map()}
    const flags=view.getUint8(i+10), sensor=(flags&2)>>1;
    row[sensor]++;
    if(!(flags&1))row[7+sensor]++;
    if(flags&4){
      row[2+sensor]++;
      const cell=Math.floor((x+180e7)/200000)*9001+Math.floor((y+90e7)/200000);
      cells.set(cell,(cells.get(cell)??0)|(1<<sensor));
    }
  }
  finish();return output;
}
