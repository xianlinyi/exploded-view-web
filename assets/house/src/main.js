import * as T from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {loadHouse,fromBlender} from './house-loader.js';
import {initialState,transition,shown,offset,packFurniture,roomSpreads} from './house-core.js';
import {PointerTap,dampAmount} from './core.js';
import './style.css';
const $=id=>document.getElementById(id), host=$('stage');
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
$('retry').onclick=()=>location.reload();
$('reference').onclick=()=>$('reference-dialog').showModal();$('close-reference').onclick=()=>$('reference-dialog').close();
$('mobile-menu').onclick=()=>{const open=document.body.classList.toggle('menu-open');$('mobile-menu').setAttribute('aria-expanded',String(open));};
let renderer,asset,controls,frame,observer,stopped=false;
const start=performance.now();
try{
renderer=new T.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});renderer.setClearColor(0,0);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
renderer.domElement.setAttribute('aria-label','可交互的房屋模型，拖动旋转，点击选择家具');host.prepend(renderer.domElement);
asset=await loadHouse(n=>{$('progress').value=n;$('load-status').textContent=`读取几何与材质 ${Math.round(n*100)}%`;});
const {manifest,parts}=asset,rooms=manifest.rooms,map=new Map(parts.map(p=>[p.id,p]));
const scene=new T.Scene(),camera=new T.OrthographicCamera(-12,12,9,-9,.1,500);
controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.09;controls.minZoom=.12;controls.maxZoom=15;controls.maxPolarAngle=Math.PI*.85;
const direction=new T.Vector3(...fromBlender(manifest.camera.direction)).negate().normalize();
let state=initialState(rooms),amount=0,last=performance.now(),dirty=true,fitNeeded=true,layoutDirty=true,cells=new Map();
let spreads=roomSpreads(parts,rooms,direction.toArray());for(const p of parts)scene.add(p.group);
const hemi=new T.HemisphereLight('#eee1c2','#413323',.25);scene.add(hemi);
const key=new T.DirectionalLight('#ffdfaa',.85);key.position.set(4,16,1);key.castShadow=true;key.shadow.mapSize.set(2048,2048);Object.assign(key.shadow.camera,{left:-15,right:15,top:15,bottom:-15,near:.5,far:60});key.shadow.bias=-.0004;key.shadow.normalBias=.025;key.target.position.set(7,0,-5);scene.add(key,key.target);
const fill=new T.DirectionalLight('#aabac8',.12);fill.position.set(-10,9,-8);scene.add(fill);
const lights=[];
for(const room of rooms){
  const candidates=manifest.lights.filter(l=>l.roomId===room.id).sort((a,b)=>b.energy-a.energy).slice(0,2);
  for(const data of candidates){const light=new T.PointLight(new T.Color(...data.color).multiply(new T.Color('#ffd398')),data.energy*.32,8,2);const base=new T.Vector3(...fromBlender(data.position));light.position.copy(base);scene.add(light);lights.push({light,base,room:room.id,intensity:light.intensity});}
}
// Each room label is a real button for mouse, touch and keyboard navigation.
const labels=new Map();
for(const room of rooms.filter(r=>!['architecture','context'].includes(r.id))){const b=document.createElement('button');b.className='room-label';b.textContent=room.name;b.onclick=()=>chooseRoom(room.id);$('labels').append(b);labels.set(room.id,b);}
let outlines=[];
function clearOutline(){for(const line of outlines){line.removeFromParent();line.geometry.dispose();line.material.dispose();}outlines=[];}
function outlineSelected(){clearOutline();const p=map.get(state.selected);if(!p)return;for(const mesh of [...p.group.children]){if(!mesh.isMesh||mesh.userData.environmental)continue;const line=new T.LineSegments(new T.EdgesGeometry(mesh.geometry,28),new T.LineBasicMaterial({color:'#e9ca80',transparent:true,opacity:.8,depthTest:true}));line.renderOrder=2;mesh.add(line);outlines.push(line);}}
function set(patch){const oldSelected=state.selected;state=transition(state,patch,rooms,parts);layoutDirty=fitNeeded=dirty=true;sync();if(oldSelected!==state.selected)outlineSelected();}
function chooseRoom(id){set({room:id,selected:null,isolate:false,hidden:state.hidden.filter(x=>x!==id)});closeMenu();}
function closeMenu(){document.body.classList.remove('menu-open');$('mobile-menu').setAttribute('aria-expanded','false');}
function select(id){set({selected:id,isolate:false});closeMenu();}
function reset(){state=initialState(rooms);amount=0;$('search').value='';camera.zoom=1;clearOutline();set({});closeMenu();}
function sync(){
  const room=rooms.find(r=>r.id===state.room),selected=map.get(state.selected),listMode=state.explode>.5;
  $('amount').textContent=String(Math.round(state.explode*100)).padStart(2,'0');$('explode').value=Math.round(state.explode*100);
  $('stage-name').textContent=listMode?'走近每一件':state.explode>0?'空间的组成':'完整的家';
  $('view-title').textContent=listMode?`${room?.name||'全屋'} · 家具清单`:room?room.name:'全屋轴测总览';
  $('view-subtitle').textContent=listMode?'家具保持原有比例，点击查看细节。':'保留生活的温度，也看见空间的秩序。';
  $('tip').textContent=listMode?(room?'正在排列所选房间的家具。':'正在排列全屋家具，可选择房间聚焦查看。'):'沿着时间线，探索空间的组成。';
  $('room-count').textContent=`${rooms.length} 个分组`;
  document.querySelectorAll('[data-amount]').forEach(b=>{const n=Number(b.dataset.amount);b.classList.toggle('active',n===(state.explode>.5?100:state.explode>0?50:0));});
  $('rooms').replaceChildren();
  rooms.forEach((r,i)=>{const row=document.createElement('div');row.className='room-row'+(state.room===r.id?' active':'')+(state.hidden.includes(r.id)?' dim':'');const b=document.createElement('button');b.setAttribute('aria-pressed',String(state.room===r.id));const num=document.createElement('span');num.className='room-number';num.textContent=String(i+1).padStart(2,'0');const name=document.createElement('span');name.textContent=r.name;const total=document.createElement('span');total.className='total';total.textContent=parts.filter(p=>p.roomId===r.id).length;b.append(num,name,total);b.onclick=()=>chooseRoom(r.id);const eye=document.createElement('button');eye.className='eye';eye.textContent=state.hidden.includes(r.id)?'○':'●';eye.setAttribute('aria-label',`${state.hidden.includes(r.id)?'显示':'隐藏'}${r.name}`);eye.onclick=()=>set({hidden:state.hidden.includes(r.id)?state.hidden.filter(x=>x!==r.id):[...state.hidden,r.id],selected:null,isolate:false});row.append(b,eye);$('rooms').append(row);});
  syncResults();$('inspector').hidden=!selected;
  if(selected){$('part-room').textContent=rooms.find(r=>r.id===selected.roomId).name;$('part-name').textContent=selected.name;const dims=selected.bounds[1].map((v,i)=>(v-selected.bounds[0][i]).toFixed(2));$('part-info').textContent=`${dims[0]} × ${dims[2]} × ${dims[1]} 米 · ${selected.meshIds.length} 个构件`;$('isolate').textContent=state.isolate?'显示周围家具':'仅看这件家具';}
}
function syncResults(){const q=$('search').value.trim().toLowerCase();$('results').replaceChildren();const list=parts.filter(p=>q?`${p.name} ${p.sourceGroup} ${rooms.find(r=>r.id===p.roomId).name}`.toLowerCase().includes(q):(state.room?p.roomId===state.room:state.explode>.5));for(const p of list){const b=document.createElement('button');b.dataset.part=p.id;b.classList.toggle('selected',p.id===state.selected);b.textContent=p.name;const small=document.createElement('small');small.textContent=`${rooms.find(r=>r.id===p.roomId).name} · ${p.meshIds.length} 构件`;b.append(small);b.onclick=()=>select(p.id);$('results').append(b);}if(q&&!list.length)$('results').textContent='没有找到匹配的家具';}
$('search').oninput=syncResults;$('explode').oninput=e=>set({explode:Number(e.target.value)/100,isolate:false});
for(const b of document.querySelectorAll('[data-amount]'))b.onclick=()=>set({explode:Number(b.dataset.amount)/100,isolate:false});
$('reset').onclick=reset;$('home').onclick=reset;$('clear').onclick=()=>set({selected:null,isolate:false});$('isolate').onclick=()=>set({isolate:!state.isolate,explode:0});
$('fit').onclick=()=>{fitNeeded=dirty=true;};$('axon').onclick=()=>{fitNeeded=dirty=true;};
controls.addEventListener('change',()=>{dirty=true;});
function visible(){return shown(parts,state);}
function boundsFor(ps){const box=new T.Box3();for(const p of ps)box.union(new T.Box3(new T.Vector3(...p.bounds[0]),new T.Vector3(...p.bounds[1])).translate(p.group.position));return box;}
function fit(){
  let ps=visible();if(state.room&&!state.isolate&&state.explode<=.5){const roomParts=ps.filter(p=>p.roomId===state.room);if(roomParts.length)ps=roomParts;}
  else if(!state.isolate&&state.explode<=.5)ps=ps.filter(p=>p.roomId!=='context');
  const box=boundsFor(ps);if(box.isEmpty())return;
  const c=box.getCenter(new T.Vector3());const dir=direction;
  camera.up.set(0,1,0);camera.position.copy(c).addScaledVector(dir,60);camera.lookAt(c);camera.updateMatrixWorld();
  const points=[];for(const p of ps)for(const x of [p.bounds[0][0],p.bounds[1][0]])for(const y of [p.bounds[0][1],p.bounds[1][1]])for(const z of [p.bounds[0][2],p.bounds[1][2]])points.push(new T.Vector3(x,y,z).add(p.group.position).applyMatrix4(camera.matrixWorldInverse));
  const centerX=(Math.max(...points.map(p=>p.x))+Math.min(...points.map(p=>p.x)))/2,centerY=(Math.max(...points.map(p=>p.y))+Math.min(...points.map(p=>p.y)))/2;
  const shift=new T.Vector3(centerX,centerY,0).applyQuaternion(camera.quaternion);c.add(shift);camera.position.add(shift);
  const w=Math.max(...points.map(p=>p.x))-Math.min(...points.map(p=>p.x)),h=Math.max(...points.map(p=>p.y))-Math.min(...points.map(p=>p.y));
  const rect=host.getBoundingClientRect(),aspect=rect.width/rect.height;const topPad=rect.width<650?145:95,bottomPad=state.selected?(rect.width<650?165:65):45;
  const fraction=Math.max(.25,(rect.height-topPad-bottomPad)/rect.height);const half=Math.max(h/fraction,w/aspect/.88)*.50;
  camera.left=-half*aspect;camera.right=half*aspect;camera.top=half;camera.bottom=-half;camera.zoom=1;
  camera.setViewOffset(rect.width,rect.height,0,-(topPad-bottomPad)/2,rect.width,rect.height);camera.updateProjectionMatrix();controls.target.copy(c);controls.update();
}
const raycaster=new T.Raycaster(),pointer=new T.Vector2(),tap=new PointerTap();
const events={pointerdown:e=>tap.down(e.pointerId,e.clientX,e.clientY,e.pointerType==='touch'?12:5),pointermove:e=>tap.move(e.pointerId,e.clientX,e.clientY),pointercancel:e=>tap.cancel(e.pointerId),lostpointercapture:e=>tap.cancel(e.pointerId),pointerup:e=>{if(!tap.up(e.pointerId,e.clientX,e.clientY))return;const r=host.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,1-(e.clientY-r.top)/r.height*2);scene.updateMatrixWorld(true);raycaster.setFromCamera(pointer,camera);const meshes=visible().flatMap(p=>p.group.children.filter(o=>o.isMesh&&o.visible));const hit=raycaster.intersectObjects(meshes,false)[0];if(hit)select(hit.object.userData.partId);}};
for(const [name,fn] of Object.entries(events))renderer.domElement.addEventListener(name,fn);
renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();stopped=true;cancelAnimationFrame(frame);$('loading').hidden=false;$('load-status').textContent='三维画面连接已中断，请重新加载。';$('retry').hidden=false;});
observer=new ResizeObserver(()=>{const r=host.getBoundingClientRect();renderer.setPixelRatio(Math.min(devicePixelRatio,r.width<650?1.25:1.5));renderer.setSize(r.width,r.height);layoutDirty=fitNeeded=dirty=true;});observer.observe(host);
let fpsFrames=0,fpsTime=performance.now(),fps=0;const animationDeltas=[];
function animate(now){if(stopped)return;frame=requestAnimationFrame(animate);const dt=(now-last)/1000;last=now;const next=dampAmount(amount,state.explode,dt,reduced.matches),moving=next!==amount;amount=next;
  if(moving&&dt>0&&dt<1){animationDeltas.push(dt*1000);if(animationDeltas.length>180)animationDeltas.shift();}
  const ps=visible(),ids=new Set(ps.map(p=>p.id));
  if(layoutDirty){spreads=roomSpreads(parts.filter(p=>!state.hidden.includes(p.roomId)||p.id===state.selected),rooms,direction.toArray());cells=packFurniture(ps,host.clientWidth/host.clientHeight,direction.toArray());layoutDirty=false;}
  if(moving||dirty){for(const p of parts){p.group.visible=ids.has(p.id);for(const child of p.group.children)if(child.userData.environmental)child.visible=amount<.01;p.group.position.fromArray(offset(p,amount,spreads,cells));}for(const l of lights){l.light.position.copy(l.base).add(new T.Vector3(...(spreads.get(l.room)||[0,0,0])).multiplyScalar(Math.min(1,amount*2)));l.light.visible=amount<=.5&&!state.isolate&&!state.hidden.includes(l.room);}
    hemi.intensity=amount>.5||state.isolate?1.35:.25+amount*.6;key.intensity=amount>.5||state.isolate?2.5:.85;
    if(moving)fitNeeded=true;dirty=true;}
  if(fitNeeded){fit();fitNeeded=false;}
  controls.enableRotate=amount<=.5;controls.mouseButtons.LEFT=amount>.5?T.MOUSE.PAN:T.MOUSE.ROTATE;controls.touches.ONE=amount>.5?T.TOUCH.PAN:T.TOUCH.ROTATE;controls.update();
  if(dirty){for(const [rid,label] of labels){label.hidden=amount<.25||amount>.5||state.isolate||state.hidden.includes(rid);if(!label.hidden){const box=boundsFor(ps.filter(p=>p.roomId===rid));if(box.isEmpty()){label.hidden=true;continue;}const pos=box.getCenter(new T.Vector3());pos.y=box.max.y+.45;pos.project(camera);label.style.left=`${(pos.x*.5+.5)*host.clientWidth}px`;label.style.top=`${(-pos.y*.5+.5)*host.clientHeight}px`;}}
    renderer.render(scene,camera);dirty=false;fpsFrames++;}
  if(now-fpsTime>1000){fps=Math.round(fpsFrames*1000/(now-fpsTime));fpsTime=now;fpsFrames=0;}
  $('hint').textContent=amount>.5?'拖动平移 · 滚轮缩放 · 点击家具':'拖动旋转 · 滚轮缩放 · 点击家具';$('status').textContent=`${ps.length} / ${parts.length} 件家具与构件`;
  // Read-only diagnostics for local acceptance, intentionally not controls.
  window.__houseDiagnostics={loaded:true,state:{...state},amount,visible:ps.map(p=>p.id),meshCount:manifest.meshes.length,furnitureCount:parts.length,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,loadMs:loadMs,fps,animationDeltas,positions:parts.map(p=>({id:p.id,position:p.group.position.toArray()}))};
}
const loadMs=Math.round(performance.now()-start);
// Fixed metric: transfer + decode + grouping, separate from frame rendering.
Object.defineProperty(window,'houseLoadMs',{value:loadMs});
$('loading').hidden=true;sync();frame=requestAnimationFrame(animate);
window.addEventListener('pagehide',()=>{stopped=true;cancelAnimationFrame(frame);observer.disconnect();controls.dispose();clearOutline();asset.dispose();renderer.dispose();},{once:true});
}catch(error){console.error(error);$('loading').hidden=false;$('load-status').textContent=`加载失败：${error.message}`;$('retry').hidden=false;renderer?.dispose();asset?.dispose();}
