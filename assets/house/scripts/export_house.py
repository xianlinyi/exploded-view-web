"""Run in background Blender with --python export_house.py -- --source FILE --out DIR.
Never saves the source blend. Procedural materials are baked on shared swatches;
mesh-local box UVs approximate Generated coordinates, not a Cycles lightmap.
"""
import bpy, sys, json, hashlib, argparse, math
from pathlib import Path
from mathutils import Vector
p=argparse.ArgumentParser(); p.add_argument('--source',required=True); p.add_argument('--out',required=True)
a=p.parse_args(sys.argv[sys.argv.index('--')+1:]); src=Path(a.source).resolve(); out=Path(a.out).resolve(); out.mkdir(parents=True,exist_ok=True)
hash_before=hashlib.sha256(src.read_bytes()).hexdigest()
bpy.ops.wm.open_mainfile(filepath=str(src))
s=next(s for s in bpy.data.scenes if s.name.startswith('NIGHT') and s.camera and s.camera.name=='02_axon'); bpy.context.window.scene=s
rooms=[('public','客厅 · 餐厅','03_'),('music','阅读 · 音乐','04_'),('gaming','双人电竞房','05_'),('master','主卧 · 衣帽间','06_'),('guest','客卧','07_'),('kitchen','厨房','08_'),('bath','两卫','09_'),('balcony','阳台','10_'),('architecture','地面 · 剖切墙','00_'),('context','电梯背景','11_')]
visible=[]
def walk(lc,excluded=False):
    excluded=excluded or lc.exclude or lc.collection.hide_render
    if not excluded:
        for o in lc.collection.objects:
            if o.type=='MESH' and not o.hide_render and o not in visible: visible.append(o)
    for c in lc.children:walk(c,excluded)
walk(s.view_layers[0].layer_collection)
visible.sort(key=lambda o:o.name)
def room_for(o):
    names=[c.name for c in o.users_collection]
    for rid,name,prefix in rooms:
        if any(n.startswith(prefix) for n in names):return rid
    return 'architecture'
def uid(prefix,name):return prefix+'-'+hashlib.sha1(name.encode()).hexdigest()[:12]
translations={'Dining chair':'餐椅','Dining sideboard':'餐边柜','Dressing north cabinet':'衣帽间北柜','Dressing wardrobe':'衣帽柜','Entry bench':'玄关换鞋凳','Entry shoe cabinet':'玄关鞋柜','Entry terrace shrub':'露台灌木','Entry terrace tree':'露台绿植','Ergonomic gaming chair':'电竞椅','Freestanding music library':'独立音乐书柜','Gaming storage':'电竞储物柜','Gaming tower':'电脑主机','Guest 1.5m bed':'客卧 1.5 米床','Guest bedside':'客卧床头柜','Guest lamp':'客卧床头灯','Guest wardrobe':'客卧衣柜','Kitchen base cabinet':'厨房地柜','Loose lounge chair':'休闲椅','Lounge reading lamp':'客厅阅读灯','Master 1.8m bed':'主卧 1.8 米床','Master bedside cabinet':'主卧床头柜','Master bedside lamp':'主卧床头灯','Movable side table':'移动边几','Music fern':'音乐区绿植','Music listening chair A':'聆听椅 A','Music listening chair B':'聆听椅 B','Music reading floor lamp':'音乐区落地灯','Peninsula stool':'吧台凳','Public window plant':'窗边绿植','Record browsing side table':'唱片边几','Record player':'黑胶唱机','Refrigerator | living-side':'冰箱 · 客厅侧','Six-seat dining / activity table':'六人餐桌','Stereo loudspeaker':'音箱','Terrace lounge':'露台休闲椅','Terrace round table':'露台圆桌','Two-person 2.4m desk':'双人 2.4 米书桌','Two-seat lounge':'双人沙发','Vinyl console':'黑胶唱片柜','Walk-in modular wardrobe':'步入式组合衣柜','Bathroom fixtures':'卫浴组合'}
def chinese(n):
    base=n.rsplit('.',1)[0] if n[-3:].isdigit() else n
    return translations.get(base,base)+((' '+str(int(n[-3:])+1)) if n[-3:].isdigit() else '')
# Explicit semantic buckets for unparented meshes. Exported mapping is authoritative.
def loose(o,r):
    n=o.name.lower()
    if r=='architecture':
        return '剖切墙与踢脚线' if n.startswith('cut |') else '地板与结构底板'
    if r=='context':return '电梯与展示背景'
    rules=[(('rug',),'地毯'),(('book','record'),'书籍与唱片'),(('monitor','screen','keyboard','mouse','desk'),'桌面设备'),(('rail','spindle','terrace'),'阳台栏杆与地面'),(('cabinet','worktop','counter','toe kick','handle','sink','tap','hob','hood','oven'),'厨房固定设施'),(('lamp','light','optic'),'照明饰件'),(('wall','skirting'),'墙面构件')]
    return next((label for words,label in rules if any(w in n for w in words)),'软装与固定陈设')
parts={}; mapping=[]
for o in visible:
    r=room_for(o); root=o
    while root.parent and root.parent.type=='EMPTY':root=root.parent
    label=chinese(root.name) if root!=o else loose(o,r)
    key=r+'/'+(root.name if root!=o else label); fid=uid('f',key)
    parts.setdefault(fid,{'id':fid,'name':label,'roomId':r,'sourceGroup':root.name if root!=o else label,'meshIds':[]})
    mid=uid('m',o.name); parts[fid]['meshIds'].append(mid)
    mapping.append({'id':mid,'sourceName':o.name,'roomId':r,'furnitureId':fid,'matrixWorld':[list(row) for row in o.matrix_world]})
cam=s.camera; rot=cam.matrix_world.to_quaternion(); center=cam.matrix_world.translation + (rot@Vector((0,0,-1)))*25
camera={'position':list(cam.matrix_world.translation),'direction':list(rot@Vector((0,0,-1))),'up':list(rot@Vector((0,1,0))),'orthoScale':cam.data.ortho_scale,'sourceName':cam.name,'coordinateSystem':'Blender Z-up'}
# Duplicate evaluated geometry into a clean export scene. Source is never written.
evalgraph=bpy.context.evaluated_depsgraph_get(); exports=[]
for o,meta in zip(visible,mapping):
    mesh=bpy.data.meshes.new_from_object(o.evaluated_get(evalgraph),depsgraph=evalgraph)
    ob=bpy.data.objects.new(meta['id'],mesh); ob.matrix_world=o.matrix_world.copy(); exports.append(ob)
    for k in ['id','roomId','furnitureId']:ob[k]=meta[k]
    ob['sourceName']=o.name
    coords=[ob.matrix_world@v.co for v in mesh.vertices]
    meta['bounds']=[[min(v[i] for v in coords) for i in range(3)],[max(v[i] for v in coords) for i in range(3)]]
    # Shared material swatches use local box projection; no geometry scaling.
    uv=mesh.uv_layers.new(name='WebUV')
    lo=Vector([min(v.co[i] for v in mesh.vertices) for i in range(3)]); hi=Vector([max(v.co[i] for v in mesh.vertices) for i in range(3)])
    for poly in mesh.polygons:
        axis=max(range(3),key=lambda i:abs(poly.normal[i])); axes=[i for i in range(3) if i!=axis]
        for li in poly.loop_indices:
            co=mesh.vertices[mesh.loops[li].vertex_index].co
            uv.data[li].uv=[(co[i]-lo[i])/max(hi[i]-lo[i],.00001) for i in axes]
    mesh.uv_layers.active=uv
export_scene=bpy.data.scenes.new('Web export'); bpy.context.window.scene=export_scene
for ob in exports:export_scene.collection.objects.link(ob)
# Bake original node graphs onto reusable swatches; keep base values for simple materials.
materials=set(m for ob in exports for m in ob.data.materials if m); webmats={}; baked=[]
bake_scene=bpy.data.scenes.new('Material swatches'); bpy.context.window.scene=bake_scene; bake_scene.render.engine='CYCLES'; bake_scene.cycles.samples=1; bake_scene.render.bake.margin=4
bpy.ops.mesh.primitive_plane_add(size=2); swatch=bpy.context.object
for mat in sorted(materials,key=lambda m:m.name):
    mid=uid('mat',mat.name); nodes=mat.node_tree.nodes if mat.use_nodes else []; principled=next((n for n in nodes if n.type=='BSDF_PRINCIPLED'),None)
    web=bpy.data.materials.new(mat.name+' Web'); web.use_nodes=True; wp=next(n for n in web.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    if principled:
        for key in ['Base Color','Roughness','Metallic','Alpha','IOR','Transmission Weight','Emission Color','Emission Strength']:
            wp.inputs[key].default_value=principled.inputs[key].default_value
    procedural=any(n.type=='TEX_NOISE' for n in nodes)
    if procedural:
        swatch.data.materials.clear(); swatch.data.materials.append(mat)
        for kind,bake_type in [('color','DIFFUSE'),('normal','NORMAL')]:
            img=bpy.data.images.new(mid+'-'+kind,width=512,height=512,alpha=False)
            if kind=='normal':img.colorspace_settings.name='Non-Color'
            tex=mat.node_tree.nodes.new('ShaderNodeTexImage');tex.image=img;mat.node_tree.nodes.active=tex
            bake_scene.render.bake.use_pass_direct=False; bake_scene.render.bake.use_pass_indirect=False; bake_scene.render.bake.use_pass_color=True
            bpy.ops.object.bake(type=bake_type)
            path=out/(mid+'-'+kind+'.png');img.filepath_raw=str(path);img.file_format='PNG';img.save();img.pack()
            wn=web.node_tree.nodes.new('ShaderNodeTexImage');wn.image=img
            if kind=='color':web.node_tree.links.new(wn.outputs['Color'],wp.inputs['Base Color'])
            else:
                norm=web.node_tree.nodes.new('ShaderNodeNormalMap');web.node_tree.links.new(wn.outputs['Color'],norm.inputs['Color']);web.node_tree.links.new(norm.outputs['Normal'],wp.inputs['Normal'])
            mat.node_tree.nodes.remove(tex);baked.append(path.name)
        print('BAKED',mat.name,flush=True)
    webmats[mat]=web
bpy.context.window.scene=export_scene
for ob in exports:
    for slot in ob.material_slots:
        if slot.material:slot.material=webmats[slot.material]
# Local lights are metadata; browser uses a bounded set and room-relative motion.
room_centers={}
for rid,_,_ in rooms:
    mm=[m for m in mapping if m['roomId']==rid]
    if mm:room_centers[rid]=Vector([(min(m['bounds'][0][i] for m in mm)+max(m['bounds'][1][i] for m in mm))/2 for i in range(3)])
lights=[]
for lc in s.view_layers[0].layer_collection.children:
    if lc.exclude or not lc.name.startswith('23_'):continue
    for o in lc.collection.all_objects:
        if o.type!='LIGHT' or o.hide_render:continue
        pos=o.matrix_world.translation; room=min((r for r in room_centers if r not in ['architecture','context']),key=lambda r:sum((pos[i]-room_centers[r][i])**2 for i in [0,1]))
        name=o.name.lower()
        room=next((rid for token,rid in [('lounge','public'),('music','music'),('desk','gaming'),('master','master'),('guest','guest'),('kitchen','kitchen'),('dining','public'),('walk-in','master'),('dressing','master')] if token in name),room)
        lights.append({'name':o.name,'roomId':room,'position':list(pos),'color':list(o.data.color),'energy':o.data.energy,'type':o.data.type})
for part in parts.values():
    ms=[m for m in mapping if m['furnitureId']==part['id']];part['bounds']=[[min(m['bounds'][0][i] for m in ms) for i in range(3)],[max(m['bounds'][1][i] for m in ms) for i in range(3)]]
manifest={'version':1,'source':{'file':src.name,'sha256':hash_before,'scene':s.name,'note':'概念装修模型，非施工图'},'coordinateSystem':'Blender Z-up; GLB exported Y-up','camera':camera,'rooms':[{'id':r,'name':n} for r,n,_ in rooms],'furniture':list(parts.values()),'meshes':mapping,'lights':lights,'materials':len(materials),'bakedTextures':baked,'bakeMethod':'512px material swatches from original procedural graphs; box-projected UV approximation, no baked lighting'}
bpy.ops.object.select_all(action='DESELECT')
for ob in exports:ob.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(out/'house.glb'),export_format='GLB',use_selection=True,use_active_scene=True,export_extras=True,export_yup=True,export_apply=False,export_cameras=False,export_lights=False)
assert hashlib.sha256(src.read_bytes()).hexdigest()==hash_before
manifest['glbBytes']=(out/'house.glb').stat().st_size
(out/'house.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
print('EXPORT_OK',len(mapping),'meshes',len(parts),'furniture',manifest['glbBytes'],'bytes',flush=True)
