// Pure functions: no DOM, no Three.js. Original template implementation.
export const clamp = (x, low, high) => Math.max(low, Math.min(high, x));
export function validateParts(parts) {
  const ids = new Set();
  for (const part of parts) {
    if (!part.id || ids.has(part.id)) throw new Error('Each part needs a unique nonempty id');
    ids.add(part.id);
    if (!part.name?.trim() || !part.system) throw new Error(`Missing metadata: ${part.id}`);
    const b = part.bounds;
    if (!Array.isArray(b) || b.length !== 2 || b.some(v => !Array.isArray(v) || v.length !== 3 || v.some(n => !Number.isFinite(n)))) throw new Error(`Invalid bounds: ${part.id}`);
    if (b[0].some((v, i) => v > b[1][i])) throw new Error(`Reversed bounds: ${part.id}`);
  }
}
export function centerOf(part) {
  return part.bounds[0].map((n, i) => (n + part.bounds[1][i]) / 2);
}
export function visibleParts(parts, state) {
  const selected = new Set(state.selected);
  const systems = new Set(state.visible);
  return parts.filter(p => state.isolate ? selected.has(p.id) : systems.has(p.system) || selected.has(p.id));
}
export function packParts(parts, aspect = 1, gap = 0.04) {
  if (!parts.length) return {cells: new Map(), width: 0, height: 0};
  const cards = parts.map(p => ({id:p.id, width:Math.max(.035,p.bounds[1][0]-p.bounds[0][0])+gap, height:Math.max(.035,p.bounds[1][1]-p.bounds[0][1])+gap}));
  const target = Math.max(...cards.map(c => c.width), Math.sqrt(cards.reduce((sum,c) => sum+c.width*c.height,0)*clamp(aspect,.5,1.5))*1.18);
  cards.sort((a,b) => b.height-a.height || a.id.localeCompare(b.id));
  const cells = new Map();
  let x=0, y=0, rowHeight=0, width=0;
  for (const c of cards) {
    if (x>0 && x+c.width>target) {x=0; y+=rowHeight; rowHeight=0;}
    cells.set(c.id,{x:x+c.width/2,y:-y-c.height/2,width:c.width,height:c.height});
    x+=c.width; rowHeight=Math.max(rowHeight,c.height); width=Math.max(width,x);
  }
  const height=y+rowHeight;
  for (const c of cells.values()) {c.x-=width/2; c.y+=height/2;}
  return {cells,width,height};
}
export function partOffset(part, cell, amount, systems, radius=.48, vertical=.28) {
  const a=clamp(amount,0,1), center=centerOf(part);
  const group=systems.indexOf(part.system);
  if (group<0) throw new Error(`Unknown system: ${part.system}`);
  const angle=group/systems.length*Math.PI*2;
  const spread=[Math.sin(angle)*radius,center[1]*vertical,Math.cos(angle)*radius];
  if (a<=.45) return spread.map(v=>v*(a/.45));
  if (!cell) return [0,0,0]; // Hidden parts do not participate in the layout.
  const target=[cell.x-center[0],cell.y-center[1],-center[2]], t=(a-.45)/.55;
  return spread.map((v,i)=>v+(target[i]-v)*t);
}
export function dampAmount(current,target,dt,reducedMotion=false) {
  if (reducedMotion || Math.abs(current-target)<1e-5) return target;
  return current+(target-current)*(1-Math.exp(-8*clamp(dt,0,.05)));
}
export class PointerTap {
  active = new Map();
  blocked = false;
  down(id,x,y,threshold=5) {
    if (!this.active.size) this.blocked=false;
    this.active.set(id,{x,y,threshold});
    if (this.active.size>1) this.blocked=true;
  }
  move(id,x,y) {
    const p=this.active.get(id);
    if (p && Math.hypot(x-p.x,y-p.y)>p.threshold) this.blocked=true;
  }
  up(id,x,y) {
    this.move(id,x,y);
    const tap=this.active.has(id) && this.active.size===1 && !this.blocked;
    this.active.delete(id); return tap;
  }
  cancel(id) {this.active.delete(id);this.blocked=true;}
}
