import test from 'node:test';
import assert from 'node:assert/strict';
import {validateParts,visibleParts,packParts,partOffset,dampAmount,PointerTap} from '../src/core.js';
import {createModel} from '../src/model.js';
const sample=(id,w,h,z=0)=>({id,name:id,system:'a',bounds:[[-w/2,-h/2,z-.1],[w/2,h/2,z+.1]]});
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('packed cells cover each id once and do not overlap at 5 aspect ratios',()=>{
 const parts=Array.from({length:70},(_,i)=>sample(String(i),.02+(i%9)*.13,.03+(i%11)*.17));
 for(const aspect of [.35,.46,1,1.7,2.2]) {
  const {cells,width,height}=packParts(parts,aspect),rows=[...cells.values()];assert.equal(cells.size,parts.length);
  for(let i=0;i<rows.length;i++) {const a=rows[i];assert.ok(Math.abs(a.x)+a.width/2<=width/2+1e-8);assert.ok(Math.abs(a.y)+a.height/2<=height/2+1e-8);
   for(const b of rows.slice(i+1)) assert.ok(Math.abs(a.x-b.x)>=(a.width+b.width)/2-1e-8||Math.abs(a.y-b.y)>=(a.height+b.height)/2-1e-8);
  }
 }
});
test('two-stage transition is continuous, terminates at the cell, and reassembly never drifts',()=>{
 const p=sample('x',.2,.3,.8),cell={x:2,y:-1};
 const zero=partOffset(p,cell,0,['a']);zero.forEach(x=>near(x,0));
 const a=partOffset(p,cell,.45,['a']),b=partOffset(p,cell,.450000001,['a']);a.forEach((x,i)=>near(x,b[i]));
 assert.deepEqual(partOffset(p,cell,1,['a']),[2,-1,-.8]);
 for(let i=0;i<1000;i++) {partOffset(p,cell,1,['a']);partOffset(p,cell,0,['a']).forEach(x=>near(x,0));}
});
test('selection reveals a hidden group, isolation and empty scenes agree',()=>{
 const parts=[sample('a',1,1),{...sample('b',1,1),system:'b'}];
 assert.deepEqual(visibleParts(parts,{visible:[],selected:['b'],isolate:false}).map(p=>p.id),['b']);
 assert.deepEqual(visibleParts(parts,{visible:['a'],selected:['b'],isolate:true}).map(p=>p.id),['b']);
 assert.equal(packParts([]).width,0);assert.equal(visibleParts(parts,{visible:[],selected:[],isolate:false}).length,0);
});
test('tap, drag-return, multi-pointer, cancellation, and next gesture',()=>{
 const tap=new PointerTap();tap.down(1,0,0);assert.equal(tap.up(1,2,1),true);
 tap.down(1,0,0);tap.move(1,20,0);assert.equal(tap.up(1,0,0),false);
 tap.down(1,0,0);tap.down(2,10,0);assert.equal(tap.up(2,10,0),false);assert.equal(tap.up(1,0,0),false);
 tap.down(1,0,0);tap.cancel(1);assert.equal(tap.up(1,0,0),false);
 tap.down(1,0,0);assert.equal(tap.up(1,0,0),true);
});
test('damping is frame-rate independent and reduced motion snaps',()=>{
 let a=0,b=0;for(let i=0;i<30;i++)a=dampAmount(a,1,1/30);for(let i=0;i<120;i++)b=dampAmount(b,1,1/120);near(a,b);
 assert.equal(dampAmount(.2,1,.016,true),1);
});
test('model metadata validates, bad data fails, each actual geometry fits its declared bounds',()=>{
 const parts=createModel();validateParts(parts);assert.equal(parts.length,12);
 for(const p of parts){const pos=p.geometry.getAttribute('position');for(let i=0;i<pos.count;i++)for(let a=0;a<3;a++){const n=pos.array[i*3+a];assert.ok(n>=p.bounds[0][a]-1e-8&&n<=p.bounds[1][a]+1e-8);}p.geometry.dispose();}
 assert.throws(()=>validateParts([sample('x',1,1),sample('x',1,1)]));
 assert.throws(()=>validateParts([{...sample('x',1,1),bounds:[[NaN,0,0],[1,1,1]]}]));
});
