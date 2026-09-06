import test from 'node:test';import assert from 'node:assert/strict';
import {initialState,transition,shown,offset,packFurniture,roomSpreads} from '../src/house-core.js';
const rooms=[{id:'a'},{id:'b'}],parts=[{id:'one',roomId:'a',bounds:[[0,0,0],[2,1,3]]},{id:'two',roomId:'a',bounds:[[3,0,1],[4,2,2]]},{id:'three',roomId:'b',bounds:[[-3,0,0],[-1,1,1]]}];
test('global furniture layout works without a room; optional room filters and reset remain valid',()=>{let s=initialState(rooms);s=transition(s,{explode:1},rooms,parts);assert.equal(s.explode,1);assert.equal(shown(parts,s).length,3);const selected=transition(s,{selected:'one'},rooms,parts);assert.equal(selected.room,null);assert.equal(shown(parts,selected).length,3);const hidden={...s,hidden:['a']};assert.equal(shown(parts,hidden).length,1);s=transition(s,{room:'a',explode:1},rooms,parts);assert.equal(s.explode,1);assert.equal(shown(parts,s).length,2);assert.deepEqual(initialState(rooms).hidden,[])});
test('selection reveals hidden furniture; isolation and clearing agree',()=>{let s={...initialState(rooms),hidden:['a']};assert.equal(shown(parts,s).length,1);s=transition(s,{selected:'one'},rooms,parts);assert.equal(shown(parts,s).length,3);s=transition(s,{isolate:true},rooms,parts);assert.deepEqual(shown(parts,s).map(p=>p.id),['one']);s=transition(s,{selected:null},rooms,parts);assert.equal(s.isolate,false)});
test('furniture cells do not overlap at narrow and wide aspects',()=>{for(const aspect of [.4,1,2]){const cells=[...packFurniture(parts,aspect).values()];for(let i=0;i<cells.length;i++)for(let j=i+1;j<cells.length;j++){const a=cells[i],b=cells[j];assert.ok(Math.abs(a.x-b.x)>=(a.width+b.width)/2-1e-8||Math.abs(a.y-b.y)>=(a.height+b.height)/2-1e-8)}}});
test('two stages continuous; repeated reassembly never accumulates offsets',()=>{const spread=roomSpreads(parts,rooms),cells=packFurniture(parts,1);for(const p of parts){const a=offset(p,.5,spread,cells),b=offset(p,.50000001,spread,cells);assert.ok(a.every((x,i)=>Math.abs(x-b[i])<1e-5));for(let i=0;i<20;i++){offset(p,1,spread,cells);assert.deepEqual(offset(p,0,spread,cells),[0,0,0])}}});

import fs from 'node:fs';
const manifest=JSON.parse(fs.readFileSync(new URL('../public/models/house.json',import.meta.url)));
const actual=manifest.furniture.map(p=>({...p,bounds:[[p.bounds[0][0],p.bounds[0][2],-p.bounds[1][1]],[p.bounds[1][0],p.bounds[1][2],-p.bounds[0][1]]]}));
const direction=[.34626776,.67089337,.65574443];
test('real house: all room furniture packs without projected overlap at 3 viewports',()=>{
 for(const r of [...manifest.rooms,{id:null}])for(const aspect of [.46,1,1.8]){const ps=actual.filter(p=>!r.id||p.roomId===r.id);const cells=[...packFurniture(ps,aspect,direction).values()];for(let i=0;i<cells.length;i++)for(let j=i+1;j<cells.length;j++){const a=cells[i],b=cells[j];assert.ok(Math.abs(a.x-b.x)>=(a.width+b.width)/2-1e-7||Math.abs(a.y-b.y)>=(a.height+b.height)/2-1e-7,`${r.id} overlap`);}}
});
test('real house: every mesh is assigned once and room hiding produces exact counts',()=>{
 const ids=manifest.furniture.flatMap(p=>p.meshIds);assert.equal(new Set(ids).size,manifest.meshes.length);assert.equal(ids.length,manifest.meshes.length);
 for(const r of manifest.rooms){const state={...initialState(manifest.rooms),hidden:[r.id]};assert.equal(shown(actual,state).length,actual.length-actual.filter(p=>p.roomId===r.id).length);}
});
