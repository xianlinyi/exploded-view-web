import * as T from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {createModel,systems} from './model.js';
import {validateParts,visibleParts,packParts,partOffset,dampAmount,PointerTap} from './core.js';
import './style.css';

const $=id=>document.getElementById(id);
const host=$('stage'), status=$('status');
const initial=()=>({explode:0,visible:systems.map(s=>s.id),selected:[],isolate:false,rotate:false});
let state=initial(), amount=0, dirty=true, needsLayout=true, needsFit=true, frame=0, stopped=false;
let layout, previousTime=performance.now();
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
let renderer;
try {renderer=new T.WebGLRenderer({antialias:true,powerPreference:'high-performance'});}
catch {status.textContent='无法启动 WebGL，请在支持 WebGL 的浏览器中打开。';status.className='error';throw new Error('WebGL unavailable');}
renderer.setClearColor('#edf1f1');renderer.outputColorSpace=T.SRGBColorSpace;
renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
host.appendChild(renderer.domElement);
renderer.domElement.setAttribute('aria-label','装配模型，拖动旋转，点击选择零件');
const scene=new T.Scene(),camera=new T.PerspectiveCamera(34,1,.01,100);
const controls=new OrbitControls(camera,renderer.domElement);
controls.enableDamping=true;controls.dampingFactor=.085;controls.minDistance=.1;controls.maxDistance=100;
controls.addEventListener('change',()=>{dirty=true;});
scene.add(new T.HemisphereLight('#ffffff','#879caa',2));
const key=new T.DirectionalLight('#fff9ed',2.4);key.position.set(-3,5,4);scene.add(key);
const rim=new T.DirectionalLight('#d4edf8',2);rim.position.set(3,2,-3);scene.add(rim);
const parts=createModel();validateParts(parts);
const partMap=new Map(parts.map(p=>[p.id,p]));
const meshes=new Map();
for (const p of parts) {
  const style=systems.find(s=>s.id===p.system);
  const mesh=new T.Mesh(p.geometry,new T.MeshStandardMaterial({color:style.color,roughness:.5,metalness:.12,side:T.DoubleSide}));
  mesh.userData.partId=p.id;meshes.set(p.id,mesh);scene.add(mesh);
}
let view='quarter';
function setState(patch) {
  state={...state,...patch};needsLayout=true;needsFit=true;dirty=true;syncUI();
}
function syncUI() {
  const selected=new Set(state.selected);
  $('explode').value=String(Math.round(state.explode*100));$('amount').textContent=`${Math.round(state.explode*100)}%`;
  $('count').textContent=`${visibleParts(parts,state).length} / ${parts.length} 个零件可见`;
  $('rotate').setAttribute('aria-pressed',String(state.rotate));
  $('rotate').disabled=state.explode>=.4 || state.isolate || reduced.matches;
  $('quarter').disabled=state.explode>=.8;
  $('isolate').disabled=$('clear').disabled=state.selected.length===0;
  $('isolate').textContent=state.isolate?'显示周围结构':'仅查看所选';
  $('inspector').classList.toggle('has-selection',selected.size>0);
  const part=partMap.get(state.selected[0]);
  $('part-name').textContent=part?.name??'选择一个零件';
  $('part-description').textContent=part?.description??'从目录或画面选择一个零件。示例为程序生成的装配结构。';
  $('systems').replaceChildren();
  for (const system of systems) {
    const label=document.createElement('label'), input=document.createElement('input');input.type='checkbox';input.checked=state.visible.includes(system.id);
    input.addEventListener('change',()=>setState({visible:input.checked?[...state.visible,system.id]:state.visible.filter(s=>s!==system.id),selected:[],isolate:false}));
    label.append(input,document.createTextNode(system.name));$('systems').append(label);
  }
  const query=$('search').value.toLocaleLowerCase().trim();
  $('results').replaceChildren();
  for (const p of parts.filter(p=>`${p.name} ${p.id}`.toLocaleLowerCase().includes(query))) {
    const button=document.createElement('button');button.textContent=p.name;button.dataset.part=p.id;button.classList.toggle('selected',selected.has(p.id));
    const id=document.createElement('small');id.textContent=p.id;button.append(id);
    button.addEventListener('click',()=>selectPart(p.id));$('results').append(button);
  }
  if (!$('results').children.length) $('results').textContent='没有匹配的零件';
}
function selectPart(id) {setState({selected:[id],isolate:false,rotate:false});}
$('search').addEventListener('input',syncUI);
$('explode').addEventListener('input',e=>{state={...state,explode:Number(e.target.value)/100,rotate:false};syncUI();dirty=true;});
for (const button of document.querySelectorAll('[data-amount]')) button.addEventListener('click',()=>setState({explode:Number(button.dataset.amount)/100,rotate:false}));
$('clear').addEventListener('click',()=>setState({selected:[],isolate:false}));
$('isolate').addEventListener('click',()=>setState({isolate:!state.isolate,explode:0,rotate:false}));
$('reset').addEventListener('click',()=>{state=initial();view='quarter';$('search').value='';setState({});});
$('front').addEventListener('click',()=>{view='front';needsFit=dirty=true;});
$('quarter').addEventListener('click',()=>{view='quarter';needsFit=dirty=true;});
$('fit').addEventListener('click',()=>{needsFit=dirty=true;});
$('rotate').addEventListener('click',()=>setState({rotate:!state.rotate}));

function availableRect() {
  const r=host.getBoundingClientRect();
  let left=12,right=r.width-12,top=66,bottom=r.height-28;
  const panel=$('inspector');
  if (panel.classList.contains('has-selection') && getComputedStyle(panel).position==='absolute') {
    const p=panel.getBoundingClientRect();
    if (p.left<r.right && p.right>r.left && p.top<r.bottom && p.bottom>r.top) {
      const abovePanel=p.top-r.top-10;
      if (innerWidth<=600 && abovePanel-top>=60) bottom=Math.min(bottom,abovePanel);
      else right=Math.min(right,p.left-r.left-10);
    }
  }
  // Small viewports still need a finite safe rectangle.
  right=Math.max(left+30,right);bottom=Math.max(top+30,bottom);
  return {left,right,top,bottom,width:r.width,height:r.height};
}
function fit() {
  const box=new T.Box3();
  for (const p of visibleParts(parts,state)) box.union(p.geometry.boundingBox.clone().translate(meshes.get(p.id).position));
  if (box.isEmpty()) {status.textContent='当前没有可见零件';return;}
  const center=box.getCenter(new T.Vector3()),size=box.getSize(new T.Vector3()),r=availableRect();
  const fractionY=(r.bottom-r.top)/r.height, fractionX=(r.right-r.left)/r.width;
  const tanY=Math.tan(T.MathUtils.degToRad(camera.fov/2))*fractionY;
  const tanX=Math.tan(T.MathUtils.degToRad(camera.fov/2))*camera.aspect*fractionX;
  const angle=Math.atan(Math.min(tanX,tanY)),radius=Math.max(.06,size.length()/2);
  const distance=radius/Math.sin(angle)*1.08;
  camera.setViewOffset(r.width,r.height,r.width/2-(r.left+r.right)/2,r.height/2-(r.top+r.bottom)/2,r.width,r.height);
  const direction=amount>=.8||view==='front'?new T.Vector3(0,0,1):new T.Vector3(.65,.4,1).normalize();
  camera.near=Math.max(.001,distance-radius*2);camera.far=distance+radius*4+10;camera.updateProjectionMatrix();
  controls.maxDistance=Math.max(100,distance*3);controls.target.copy(center);camera.position.copy(center).addScaledVector(direction,distance);controls.update();
  status.textContent=`${amount>.99?'零件清单':amount>.01?'分离结构':'组装结构'} · ${visibleParts(parts,state).length} 个零件`;
}
const resize=new ResizeObserver(()=>{
  const {width,height}=host.getBoundingClientRect();if(width<1||height<1)return;
  renderer.setPixelRatio(Math.min(devicePixelRatio,width<600?1.5:2));renderer.setSize(width,height);
  camera.aspect=width/height;camera.updateProjectionMatrix();needsLayout=needsFit=dirty=true;
});resize.observe(host);

const tap=new PointerTap(),raycaster=new T.Raycaster(),pointer=new T.Vector2();
function down(e) {tap.down(e.pointerId,e.clientX,e.clientY,e.pointerType==='touch'?12:5);}
function move(e) {tap.move(e.pointerId,e.clientX,e.clientY);}
function cancel(e) {tap.cancel(e.pointerId);}
function up(e) {
  if (!tap.up(e.pointerId,e.clientX,e.clientY)) return;
  const r=renderer.domElement.getBoundingClientRect();
  pointer.set((e.clientX-r.left)/r.width*2-1,1-(e.clientY-r.top)/r.height*2);
  scene.updateMatrixWorld(true);raycaster.setFromCamera(pointer,camera);
  const targets=[...meshes.values()].filter(m=>m.visible);
  const hit=raycaster.intersectObjects(targets,false)[0];if(hit)selectPart(hit.object.userData.partId);
}
for (const [event,fn] of Object.entries({pointerdown:down,pointermove:move,pointerup:up,pointercancel:cancel,lostpointercapture:cancel})) renderer.domElement.addEventListener(event,fn);
renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();stopped=true;cancelAnimationFrame(frame);status.className='error';status.textContent='WebGL 上下文已丢失，请刷新页面重试。';});
function animate(now) {
  if(stopped)return;
  frame=requestAnimationFrame(animate);
  const dt=(now-previousTime)/1000;previousTime=now;
  const next=dampAmount(amount,state.explode,dt,reduced.matches),moving=next!==amount;amount=next;
  if(needsLayout) {layout=packParts(visibleParts(parts,state),camera.aspect);dirty=true;}
  if(moving||needsLayout) {
    const visible=new Set(visibleParts(parts,state).map(p=>p.id));
    for(const p of parts) {
      const mesh=meshes.get(p.id);mesh.visible=visible.has(p.id);
      mesh.position.fromArray(partOffset(p,layout.cells.get(p.id),amount,systems.map(s=>s.id)));
      mesh.material.emissive.set(state.selected.includes(p.id)?'#1d6359':'#000000');
      mesh.material.emissiveIntensity=.5;
    }
    needsLayout=false;needsFit=true;dirty=true;
  }
  if(needsFit) {fit();needsFit=false;}
  controls.enableRotate=amount<.8;
  controls.mouseButtons.LEFT=amount<.8?T.MOUSE.ROTATE:T.MOUSE.PAN;
  controls.touches.ONE=amount<.8?T.TOUCH.ROTATE:T.TOUCH.PAN;
  controls.autoRotate=state.rotate && !state.isolate && amount<.4 && !reduced.matches;
  controls.autoRotateSpeed=.65;controls.update();
  $('hint').textContent=amount>=.8?'拖动平移 · 滚轮缩放 · 点击查看':'拖动旋转 · 滚轮缩放 · 点击查看';
  if(controls.autoRotate)dirty=true;
  if(dirty) {renderer.render(scene,camera);dirty=false;}
}
syncUI();frame=requestAnimationFrame(animate);
// Disposal entrypoint for SPA integration. Remove the pagehide listener when mounting in a framework.
export function dispose() {
  stopped=true;cancelAnimationFrame(frame);resize.disconnect();controls.dispose();
  for(const mesh of meshes.values()) {mesh.geometry.dispose();mesh.material.dispose();}
  renderer.dispose();renderer.domElement.remove();
}
window.addEventListener('pagehide',dispose,{once:true});
