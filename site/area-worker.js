import {queryYear} from "./area.js";
const partitions=new Map();
let newest=0;
self.onmessage=async({data:{id,region,start,end,bounds,classification}})=>{
  newest=id;
  try{
    const rows=[], first=Date.parse(start)/86400000,last=Date.parse(end)/86400000;
    for(let y=+start.slice(0,4);y<=+end.slice(0,4);y++){
      const path="data/"+region+"/area/"+y+".bin";
      if(!partitions.has(path))partitions.set(path,fetch(path).then(r=>{
        if(!r.ok)throw new Error("Spatial index unavailable for "+y);
        return r.arrayBuffer();
      }).catch(e=>{partitions.delete(path);throw e}));
      const buf=await partitions.get(path);
      if(id!==newest)return;
      rows.push(...queryYear(buf,bounds,first,last,classification));
    }
    postMessage({id,rows});
  }catch(e){postMessage({id,error:e.message})}
};
