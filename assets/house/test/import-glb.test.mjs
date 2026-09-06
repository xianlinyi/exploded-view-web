import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {normalizeStaticMeshes} from '../src/import-glb.js';
test('nested translation/rotation/scale are baked once with shared normalization',()=>{
 const root=new T.Group(),nested=new T.Group();root.add(nested);root.position.set(40,20,-50);nested.rotation.z=Math.PI/2;nested.scale.setScalar(2);
 const geometry=new T.BoxGeometry(1,1,1),material=new T.MeshBasicMaterial();
 for(const x of [-1,1]){const m=new T.Mesh(geometry,material);m.position.x=x;nested.add(m);}
 root.updateMatrixWorld(true);
 const original=new T.Box3().setFromObject(root),extent=Math.max(...original.getSize(new T.Vector3()).toArray());
 const output=normalizeStaticMeshes(root);assert.equal(output.length,2);
 const all=new T.Box3();for(const p of output)all.union(p.geometry.boundingBox);
 assert.ok(Math.abs(Math.max(...all.getSize(new T.Vector3()).toArray())-2)<1e-6);
 assert.ok(all.getCenter(new T.Vector3()).length()<1e-6);
 const a=output[0].geometry.boundingBox.getCenter(new T.Vector3()),b=output[1].geometry.boundingBox.getCenter(new T.Vector3());
 assert.ok(Math.abs(a.distanceTo(b)-4*2/extent)<1e-6);
 assert.equal(geometry.attributes.position.getX(0),.5); // Source remains untouched.
 output.forEach(p=>p.geometry.dispose());geometry.dispose();material.dispose();
});
test('unsupported skinned asset fails before flattening',()=>{
 const root=new T.Group();const g=new T.BoxGeometry(),m=new T.MeshBasicMaterial();root.add(new T.SkinnedMesh(g,m));
 assert.throws(()=>normalizeStaticMeshes(root),/Bake skinning/);g.dispose();m.dispose();
});
test('actual GLB parsing yields two independently movable parts',async()=>{
 const {GLTFLoader}=await import('three/examples/jsm/loaders/GLTFLoader.js');
 const vertices=new Float32Array([0,0,0,1,0,0,0,1,0]);
 const gltf={asset:{version:'2.0'},buffers:[{byteLength:vertices.byteLength}],bufferViews:[{buffer:0,byteOffset:0,byteLength:vertices.byteLength}],accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[0,0,0],max:[1,1,0]}],meshes:[{primitives:[{attributes:{POSITION:0}}]}],nodes:[{name:'first',mesh:0,translation:[-2,0,0]},{name:'second',mesh:0,translation:[2,0,0]}],scenes:[{nodes:[0,1]}],scene:0};
 const json=Buffer.from(JSON.stringify(gltf));const padded=Buffer.alloc(Math.ceil(json.length/4)*4,0x20);json.copy(padded);
 const binary=Buffer.from(vertices.buffer),header=Buffer.alloc(12),jsonHeader=Buffer.alloc(8),binHeader=Buffer.alloc(8);
 header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(28+padded.length+binary.length,8);
 jsonHeader.writeUInt32LE(padded.length,0);jsonHeader.writeUInt32LE(0x4e4f534a,4);binHeader.writeUInt32LE(binary.length,0);binHeader.writeUInt32LE(0x004e4942,4);
 const file=Buffer.concat([header,jsonHeader,padded,binHeader,binary]);
 const parsed=await new GLTFLoader().parseAsync(file.buffer.slice(file.byteOffset,file.byteOffset+file.byteLength),'');
 const parts=normalizeStaticMeshes(parsed.scene);
 assert.equal(parts.length,2);assert.notEqual(parts[0].geometry,parts[1].geometry);
 const one=parts[0].geometry.boundingBox.getCenter(new T.Vector3()),two=parts[1].geometry.boundingBox.getCenter(new T.Vector3());
 assert.ok(Math.abs(one.distanceTo(two)-1.6)<1e-6);
 parts.forEach(p=>p.geometry.dispose());parsed.scene.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}});
});
