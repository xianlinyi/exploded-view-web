import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
export const fromBlender=([x,y,z])=>[x,z,-y];
export async function loadHouse(progress){
  const response=await fetch(`${import.meta.env.BASE_URL}models/house.json`);if(!response.ok)throw new Error('模型清单无法读取');const manifest=await response.json();
  const gltf=await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}models/house.glb`,e=>progress(e.total?e.loaded/e.total:0));gltf.scene.updateMatrixWorld(true);
  const metadata=new Map(manifest.meshes.map(m=>[m.id,m]));const seen=new Set(),buckets=new Map();
  gltf.scene.traverse(mesh=>{
    if(!mesh.isMesh)return;
    let node=mesh;while(node&&!metadata.has(node.userData.id))node=node.parent;
    if(!node)throw new Error(`缺少模型映射: ${mesh.name}`);
    const meta=metadata.get(node.userData.id);seen.add(meta.id);
    const geometry=mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    // GLTFLoader splits material primitives; keep materials and UVs per primitive.
    if(Array.isArray(mesh.material))throw new Error('预期 glTF 独立材质 primitive');
    const environmental=meta.sourceName==='Presentation ground';
    if(environmental){mesh.material=mesh.material.clone();mesh.material.color.set('#181913');mesh.material.roughness=1;mesh.material.map=null;}
    const key=meta.furnitureId+'/'+mesh.material.uuid;
    if(!buckets.has(key))buckets.set(key,{id:meta.furnitureId,material:mesh.material,environmental,geometries:[]});
    // Normalize attributes for safe merging across different source meshes.
    if(!geometry.getAttribute('normal'))geometry.computeVertexNormals();
    if(!geometry.getAttribute('uv'))geometry.setAttribute('uv',new T.Float32BufferAttribute(new Float32Array(geometry.getAttribute('position').count*2),2));
    for(const key of Object.keys(geometry.attributes))if(!['position','normal','uv'].includes(key))geometry.deleteAttribute(key);
    const plain=geometry.index?geometry.toNonIndexed():geometry;buckets.get(key).geometries.push(plain);if(plain!==geometry)geometry.dispose();
  });
  if(seen.size!==metadata.size)throw new Error(`模型缺失: ${seen.size}/${metadata.size}`);
  const parts=manifest.furniture.map(p=>({...p,group:new T.Group()}));const map=new Map(parts.map(p=>[p.id,p]));
  for(const b of buckets.values()){
    const merged=mergeGeometries(b.geometries,false);if(!merged)throw new Error('网格合并失败');
    for(const g of b.geometries)g.dispose();
    const mesh=new T.Mesh(merged,b.material);mesh.userData.partId=b.id;mesh.userData.environmental=b.environmental;mesh.castShadow=!b.environmental;mesh.receiveShadow=true;
    map.get(b.id).group.add(mesh);
  }
  for(const p of parts){const box=new T.Box3();for(const child of p.group.children)if(!child.userData.environmental)box.union(new T.Box3().setFromObject(child));p.bounds=[box.min.toArray(),box.max.toArray()];p.group.userData.partId=p.id;}
  const oldGeometries=new Set();gltf.scene.traverse(o=>{if(o.isMesh)oldGeometries.add(o.geometry);});for(const g of oldGeometries)g.dispose();
  const dispose=()=>{const materials=new Set(),textures=new Set();for(const p of parts)p.group.traverse(o=>{if(o.isMesh){o.geometry.dispose();materials.add(o.material);}});for(const m of materials){for(const v of Object.values(m))if(v?.isTexture)textures.add(v);m.dispose();}for(const t of textures){t.source?.data?.close?.();t.dispose();}};
  return {manifest,parts,dispose,drawCalls:buckets.size};
}
