import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {validateParts} from './core.js';
// Static, uncompressed glTF/GLB adapter. Existing material appearance is intentionally not retained.
export function normalizeStaticMeshes(root, defaultSystem='housing') {
  root.updateMatrixWorld(true);
  const source=[];
  root.traverse(object=>{
    if (!object.isMesh) return;
    if (object.isSkinnedMesh || object.isInstancedMesh || Object.keys(object.geometry.morphAttributes).length) throw new Error('Bake skinning, instances and morph targets before importing');
    source.push(object);
  });
  if (!source.length) throw new Error('No mesh found');
  const prepared=source.map((mesh,i)=>({
    id:mesh.userData.partId || `part-${String(i+1).padStart(4,'0')}`,
    name:mesh.name || `Part ${i+1}`,
    system:mesh.userData.system || defaultSystem,
    description:mesh.userData.description || 'Imported static mesh',
    geometry:mesh.geometry.clone().applyMatrix4(mesh.matrixWorld)
  }));
  try {
    const box=new T.Box3();
    for (const p of prepared) {p.geometry.computeBoundingBox();box.union(p.geometry.boundingBox);}
    const center=box.getCenter(new T.Vector3()),size=box.getSize(new T.Vector3()),extent=Math.max(size.x,size.y,size.z);
    if (!Number.isFinite(extent)||extent<=0) throw new Error('The model has no finite extent');
    const scale=2/extent;
    for (const p of prepared) {
      p.geometry.translate(-center.x,-center.y,-center.z).scale(scale,scale,scale);
      if (!p.geometry.getAttribute('normal')) p.geometry.computeVertexNormals();
      p.geometry.computeBoundingBox();p.geometry.computeBoundingSphere();
      p.bounds=[p.geometry.boundingBox.min.toArray(),p.geometry.boundingBox.max.toArray()];
    }
    validateParts(prepared);return prepared;
  } catch(error) {for (const p of prepared) p.geometry.dispose();throw error;}
}
export async function loadStaticGLB(url,defaultSystem='housing') {
  const gltf=await new GLTFLoader().loadAsync(url);
  try {return normalizeStaticMeshes(gltf.scene,defaultSystem);}
  finally {
    const geometries=new Set(),materials=new Set(),textures=new Set();
    gltf.scene.traverse(o=>{if(o.isMesh){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);}});
    for(const m of materials)for(const value of Object.values(m))if(value?.isTexture)textures.add(value);
    for(const t of textures){t.source?.data?.close?.();t.dispose();}
    for(const m of materials)m.dispose();for(const g of geometries)g.dispose();
  }
}
