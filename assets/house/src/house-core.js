import {clamp,packParts} from './core.js';
export const initialState=rooms=>({explode:0,room:null,selected:null,isolate:false,hidden:[],roomIds:rooms.map(r=>r.id)});
export function transition(state,patch,rooms,parts){
  const next={...state,...patch};
  if(patch.selected){const p=parts.find(p=>p.id===patch.selected);if(p){if(next.room)next.room=p.roomId;next.hidden=next.hidden.filter(id=>id!==p.roomId);}}
  if(!next.selected)next.isolate=false;
  next.explode=clamp(next.explode,0,1);return next;
}
export function shown(parts,s){return parts.filter(p=>s.isolate?p.id===s.selected:(!s.hidden.includes(p.roomId)||p.id===s.selected)&&(s.explode<=.5||!s.room||p.roomId===s.room));}
function viewBasis(direction=[0,0,1]){
  const length=Math.hypot(...direction),d=direction.map(x=>x/length),rl=Math.hypot(d[2],d[0]);
  const right=[d[2]/rl,0,-d[0]/rl],up=[d[1]*right[2],d[2]*right[0]-d[0]*right[2],-d[1]*right[0]];
  return {right,up,d};
}
const dot=(a,b)=>a.reduce((v,x,i)=>v+x*b[i],0);
function projected(p,basis){
  const pts=[];for(const x of [p.bounds[0][0],p.bounds[1][0]])for(const y of [p.bounds[0][1],p.bounds[1][1]])for(const z of [p.bounds[0][2],p.bounds[1][2]])pts.push([dot([x,y,z],basis.right),dot([x,y,z],basis.up),dot([x,y,z],basis.d)]);
  return {...p,bounds:[0,1].map(side=>[0,1,2].map(i=>(side?Math.max:Math.min)(...pts.map(p=>p[i]))))};
}
export function packFurniture(parts,aspect,direction=[0,0,1],gap=.5){
  const basis=viewBasis(direction),projectedParts=parts.map(p=>projected(p,basis));
  const cells=packParts(projectedParts,aspect,gap).cells;
  for(const p of parts){const cell=cells.get(p.id);const center=p.bounds[0].map((x,i)=>(x+p.bounds[1][i])/2);cell.target=basis.right.map((v,i)=>v*cell.x+basis.up[i]*cell.y-center[i]);}
  return cells;
}
export function roomSpreads(parts,rooms,direction=[0,0,1]){
  const groups=rooms.map(r=>{const ps=parts.filter(p=>p.roomId===r.id);return {id:r.id,bounds:[0,1].map(side=>[0,1,2].map(i=>(side?Math.max:Math.min)(...ps.map(p=>p.bounds[side][i]))))};}).filter(p=>p.bounds.flat().every(Number.isFinite));
  const cells=packFurniture(groups,1.5,direction,1.6);return new Map(groups.map(p=>[p.id,cells.get(p.id).target]));
}
export function offset(p,amount,spreads,cells){
  if(amount===0)return [0,0,0];const spread=spreads.get(p.roomId)||[0,0,0];
  if(amount<=.5)return spread.map(x=>x*amount*2);
  const cell=cells.get(p.id);if(!cell)return spread;
  const c=p.bounds[0].map((x,i)=>(x+p.bounds[1][i])/2);const target=cell.target||[cell.x-c[0],cell.y-c[1],-c[2]];const t=(amount-.5)*2;
  return spread.map((x,i)=>x+(target[i]-x)*t);
}
