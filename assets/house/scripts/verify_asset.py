"""Validate delivered GLB/manifest without Blender or third-party dependencies."""
import argparse,hashlib,json,struct,math
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--source',type=Path);a=p.parse_args()
root=Path(__file__).resolve().parents[1];folder=root/'public/models';m=json.loads((folder/'house.json').read_text());raw=(folder/'house.glb').read_bytes()
magic,version,length=struct.unpack_from('<III',raw);assert magic==0x46546c67 and version==2 and length==len(raw)
jlen,jtype=struct.unpack_from('<II',raw,12);assert jtype==0x4e4f534a;g=json.loads(raw[20:20+jlen]);blen,btype=struct.unpack_from('<II',raw,20+jlen);assert btype==0x004e4942
meshes={p['id']:p for p in m['meshes']};parts={p['id']:p for p in m['furniture']};rooms={p['id'] for p in m['rooms']}
assert len(meshes)==len(m['meshes'])==1296;assert len(parts)==77
assigned=[mid for p in parts.values() for mid in p['meshIds']];assert len(assigned)==len(set(assigned))==len(meshes) and set(assigned)==set(meshes)
for p in m['meshes']:
    assert p['roomId'] in rooms and p['furnitureId'] in parts
    assert p['roomId']==parts[p['furnitureId']]['roomId']
    assert all(math.isfinite(x) for row in p['matrixWorld'] for x in row)
    assert all(math.isfinite(x) for row in p['bounds'] for x in row)
    assert all(p['bounds'][0][i]<=p['bounds'][1][i] for i in range(3))
assert len(g['scenes'])==1 and g['scenes'][0]['name']=='Web export'
# Every exported node resolves to the stable source mapping, exactly once.
nodes=[n for n in g['nodes'] if 'mesh' in n];assert len(nodes)==len(meshes)
assert {n['extras']['id'] for n in nodes}==set(meshes)
# Compare every exported position in world coordinates against source evaluated bounds.
binary=raw[28+jlen:28+jlen+blen]
for node in nodes:
    assert not node.get('children') and 'matrix' not in node
    q=node.get('rotation',[0,0,0,1]); scale=node.get('scale',[1,1,1]); tr=node.get('translation',[0,0,0])
    low=[math.inf]*3;high=[-math.inf]*3
    for primitive in g['meshes'][node['mesh']]['primitives']:
        ac=g['accessors'][primitive['attributes']['POSITION']];assert ac['componentType']==5126 and ac['type']=='VEC3'
        bv=g['bufferViews'][ac['bufferView']];start=bv.get('byteOffset',0)+ac.get('byteOffset',0);stride=bv.get('byteStride',12)
        for i in range(ac['count']):
            v=[x*scale[k] for k,x in enumerate(struct.unpack_from('<fff',binary,start+i*stride))]
            # Quaternion rotation: v + 2w(q cross v) + 2(q cross (q cross v)).
            cross=[q[1]*v[2]-q[2]*v[1],q[2]*v[0]-q[0]*v[2],q[0]*v[1]-q[1]*v[0]]
            cross2=[q[1]*cross[2]-q[2]*cross[1],q[2]*cross[0]-q[0]*cross[2],q[0]*cross[1]-q[1]*cross[0]]
            world=[v[k]+2*q[3]*cross[k]+2*cross2[k]+tr[k] for k in range(3)]
            low=[min(low[k],world[k]) for k in range(3)];high=[max(high[k],world[k]) for k in range(3)]
    b=meshes[node['extras']['id']]['bounds'];expected=[[b[0][0],b[0][2],-b[1][1]],[b[1][0],b[1][2],-b[0][1]]]
    assert all(abs(actual[k]-wanted[k])<.0002 for actual,wanted in zip([low,high],expected) for k in range(3)),node['name']

assert any(p['sourceName'].startswith('CUT |') for p in meshes.values())
assert not any(p['sourceName'].startswith('D01 |') for p in meshes.values())
for image in g.get('images',[]):assert 'bufferView' in image and image['mimeType'] in ['image/png','image/jpeg']
assert len(g['images'])==len(m['bakedTextures'])==26
for texture in m['bakedTextures']:assert (folder/texture).read_bytes().startswith(b'\x89PNG')
for view in g['bufferViews']:assert view.get('byteOffset',0)+view['byteLength']<=blen
for accessor in g['accessors']:
    for key in ['min','max']:assert all(math.isfinite(v) for v in accessor.get(key,[]))
assert all(l['roomId'] in rooms and l['energy']>=0 for l in m['lights'])
if a.source:assert hashlib.sha256(a.source.read_bytes()).hexdigest()==m['source']['sha256']
result={'status':'PASS','meshes':len(meshes),'furniture':len(parts),'rooms':len(rooms),'materials':len(g['materials']),'embeddedImages':len(g['images']),'glbBytes':len(raw),'sourceHashVerified':bool(a.source),'sourceSHA256':m['source']['sha256']}
(root/'docs/asset-verification.json').write_text(json.dumps(result,indent=2));print(json.dumps(result,indent=2))
