import * as T from 'three';
// Positions and bounds share one model coordinate system. Geometry is baked once.
export const systems = [
  {id:'housing',name:'外壳',color:'#acc4c8'},
  {id:'drive',name:'传动',color:'#d0ad70'},
  {id:'fasteners',name:'紧固件',color:'#9fa6b1'}
];
export function createModel() {
  const parts=[];
  function add(id,name,system,geometry,position,description) {
    geometry.translate(...position);
    geometry.computeBoundingBox();
    const bounds=[geometry.boundingBox.min.toArray(),geometry.boundingBox.max.toArray()];
    parts.push({id,name,system,geometry,bounds,description});
  }
  add('base','底座','housing',new T.BoxGeometry(1.6,.16,1),[0,-.5,0],'支撑整套装配的底座。');
  add('cover','上盖','housing',new T.BoxGeometry(1.6,.12,1),[0,.5,0],'覆盖内部传动结构。');
  add('left','左侧板','housing',new T.BoxGeometry(.12,.86,1),[-.74,0,0],'左侧固定板。');
  add('right','右侧板','housing',new T.BoxGeometry(.12,.86,1),[.74,0,0],'右侧固定板。');
  add('shaft','主轴','drive',new T.CylinderGeometry(.10,.10,1.3,24).rotateZ(Math.PI/2),[0,0,0],'沿 X 轴放置的主传动轴。');
  add('wheel-left','左传动轮','drive',new T.CylinderGeometry(.32,.32,.13,40).rotateZ(Math.PI/2),[-.35,0,0],'左传动轮，展示轴向部件。');
  add('wheel-right','右传动轮','drive',new T.CylinderGeometry(.26,.26,.13,40).rotateZ(Math.PI/2),[.35,0,0],'右传动轮。');
  add('bearing','中央轴套','drive',new T.TorusGeometry(.15,.05,12,32).rotateY(Math.PI/2),[0,0,0],'示意轴套，几何仅用于交互演示。');
  let i=1;
  for (const x of [-.55,.55]) for (const z of [-.32,.32]) add(`bolt-${i}`,`螺栓 ${i++}`,'fasteners',new T.CylinderGeometry(.06,.06,.95,12),[x,0,z],'连接上下壳体的示意紧固件。');
  return parts;
}
