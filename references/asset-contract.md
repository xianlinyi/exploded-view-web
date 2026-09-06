# 资产与数据契约

## 先判定输入是否能做结构拆解

| 输入 | 能立即完成 | 还需要什么 |
|---|---|---|
| 已分件、静态、命名合理的 GLB | 导入并平移每个 Mesh | 确认组装关系、类别、描述 |
| OBJ 多对象或多个 OBJ | 建模工具保留对象导出 GLB | 保留位置，不逐件归零 |
| 单个不分件的封闭 Mesh | 整体浏览或明确示意 | 手动拆件/重新建模；连通分量不等于语义部件 |
| 带骨骼/实例/morph 的模型 | 模板应拒绝直接扁平化 | 烘焙静态姿态/实例后导出副本 |
| 单张照片、产品名 | 可做概念示例 | 无法从照片证明隐藏结构；需要真实资产或用户接受示意 |
| Human Atlas bin+manifest | 原始 GPU 路径直接加载 | 不交给 GLTFLoader |

## 通用 Part（CPU 路径）

```js
{
  id: 'bolt-01',            // 稳定唯一；高亮/布局/点击都用它
  name: '固定螺栓',
  system: 'fasteners',      // 必须在 systems 中定义
  description: '固定壳体的示意零件',
  geometry: BufferGeometry,// 已烘焙装配变换；统一模型坐标
  bounds: [[minX,minY,minZ],[maxX,maxY,maxZ]]
}
```

所有数字有限，min≤max。bbox 不是随意填的尺寸说明，必须覆盖 geometry 中所有顶点。每个 geometry 保持真实比例；不能每个零件分别 normalize 到 1 米。

## 通用静态 GLB 导入的精确步骤

1. 将用户模型及其来源说明放到项目 `public/models/assembly.glb`。优先单文件、未使用 Draco/KTX2 压缩的静态 GLB；外部贴图路径应能从站点访问。模板不包含额外解码器。
2. 在 `src/model.js` 顶部增加导入：

```js
import {loadStaticGLB} from './import-glb.js';
```

3. 保留并修改 `systems` 类别表；把整个 `createModel` 函数替换为：

```js
export async function createModel() {
  const parts = await loadStaticGLB('/models/assembly.glb', 'housing');
  const allowed = new Set(systems.map(s => s.id));
  for (const part of parts) {
    if (!allowed.has(part.system)) throw new Error(`Unknown system: ${part.system}`);
  }
  return parts;
}
```

4. 在 `src/main.js` 找到唯一的 `const parts=createModel();validateParts(parts);`，替换为：

```js
let parts;
try {
  parts = await createModel();
  validateParts(parts);
} catch (error) {
  status.textContent = `模型加载失败：${error.message}`;
  status.className = 'error';
  renderer.dispose();
  throw error;
}
```

模板 `vite.config.js` 的 build.target=es2022 支持这里的顶层 await。已有框架请放在自己的 async 挂载流程里，不直接向不支持 TLA 的构建链粘贴。

5. 改 index.html 的示例“12 个零件”徽章与文案；实际数量从 parts.length 取。修改模型专属的计数测试，保留几何边界/ID/排布测试。不要仍然断言真实 GLB 只有 12 个 Mesh。
6. 执行 npm test、npm run build，并在浏览器检查 0/45/100 和点击。

适配器做了什么：读取世界矩阵 → 为每个静态 Mesh clone geometry 并 applyMatrix4 → 从整套模型联合 AABB 得到中心和最大边长 → 所有零件共享同一个 translate 与 scale（最大边长归一到 2）→ 计算新的 bounds。Part 对应新的 scene-root Mesh，初始 position 全为 0；原 glTF 层级不再作为父节点二次施加变换。

素材 extras 中的 `partId/system/description` 会被读取；没有 partId 时使用稳定遍历序号 `part-0001` 等。名字可重复，但 ID 不可重复。素材导出顺序变化会改变 fallback ID，因此正式资产应在 extras 提供稳定 ID 或维护显式映射。

**颜色和材质边界：** 通用模板采用 system 调色板的新 MeshStandardMaterial，适配器不保留原纹理/透明度/多材质外观。这是教学基线。若用户要求真实 PBR 材质，应把原材质克隆、纹理生命周期和高亮恢复单独实现并验收，不能声称本模板已经保真恢复原材质。

适配器明确拒绝 SkinnedMesh、InstancedMesh 和 morph geometry。它只把一个 Mesh 当一个零件；对于一个零件含多个 Mesh 的文件，应先建立 partRoot 与 children 的分组契约，不得假定一切 glTF 节点都是独立部件。

## 如果保留模型层级，而不烘焙

这是另一种方案，不要混用：保存原始 local position/quaternion/scale；目标位移定义在世界空间时，用父节点 worldToLocal 转换目标点，再减原 local position。父子节点不能同时作为可拆 Part 施加位移，否则子部件会被移动两遍。弱模型默认使用上面的烘焙方案。

## 转成 Human Atlas 风格二进制

需要实现自己的转换器，不能直接复制人体转换脚本处理任意 OBJ。明确输出：

- 全局 `parts[]` 的顺序即 GPU partIndex；同一个零件不能在每个 chunk 里重新编号。
- 每个 part 有 positions/normals/indices 字节偏移和顶点/索引计数。
- Position float32 XYZ；Normal signed int16 XYZ，GPU normalized；Index uint32。
- 每个字段写入前按 4 字节补齐。indices.length 是 3 的倍数，所有索引小于 vertexCount。
- 一个 part 不跨 chunk；一个 chunk 可混多个 system。
- 坐标已统一，bounds 从相同坐标的 geometry 产生。
- chunk.bytes 是解压后字节数；gzipBytes 是压缩文件字节数。
- concept.elements 引用合法且存在的 Part ID；几何只保留一份。
- 每个源网格的简化误差单独约束，小零件不能被整体误差预算吞掉。

若只做普通商品十几个部件，无需制造这套二进制格式；GLB 或程序几何就足够。

## 来源与分发

原代码 MIT 和人体数据 CC BY 4.0 是两个许可层。保留包内上游 LICENSE、ATTRIBUTION.md。人体数据署名和最新条款链接在上游归属文档及官方许可页中。不要因网页代码 MIT 就给别人的模型改发 MIT。用户模型按它自己的授权处理；缺失许可时不对外声称可公用分发资产。
