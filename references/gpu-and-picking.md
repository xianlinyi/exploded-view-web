# 数千零件路径：GPU 状态纹理与准确拾取

只在确有高零件数/高 draw calls 或用户要求复刻原案例时读。完整可执行参考就在 `assets/human-atlas/app/scene.tsx`，优先沿源码改，不凭下面片段拼出新引擎。以下示意中的 atlas、groups、shader 都必须来自场景初始化；它们不是单独可执行文件。

## CPU 与 GPU 的选型

| 条件 | 起点 | 扩容依据 |
|---|---|---|
| 十几个到几十个不同零件 | 独立 Mesh + mesh.position | 实测帧时、draw calls、三角形和内存 |
| 很多相同几何重复体 | 考虑 InstancedMesh | 每实例 ID 和拾取也需映射 |
| 数千个不同几何、按零件平移 | 原版合批 + partIndex + DataTexture | 实测不同设备，不能凭数量承诺 FPS |

这里的数量是工程启发，不是硬性容量。两个超高面数 Mesh 也可能比数百个简单 Mesh 慢。

## 初始化顺序（不要调换依赖）

1. 读 atlas，建立 partId→index，systemId→index、bounds、centers。
2. 根据 N 建 state texture；先检查 GPU 的 maxTextureSize 和浮点纹理支持。
3. 创建每个 system 的材质，注入 shader；把 uniform 引用指向长期存在的纹理对象。
4. 加载 chunk，构建每个 part 的 position/normal/index 和 partIndex 属性。
5. 留存每个 part 的几何作为 CPU picker；按 chunk+system 合并渲染几何。
6. 设置合批 Mesh.frustumCulled=false，或实现覆盖全部动态位置的正确边界。
7. 根据真实可见集排布，得到 target cell；计算 CPU offsets。
8. 同一轮更新 GPU texture、CPU picker、marker、用于相机的 bounds。
9. dirty 时 render，之后更新屏幕候选命中区。
10. 卸载 abort fetch、cancel RAF、断 observer、dispose 所有资源。

## 着色器契约

原版一行纹理索引：`uv=((partIndex+.5)/stateWidth,.5)`。+.5 采样像素中心；使用 NearestFilter，不要对相邻零件的位移做线性混合。关闭 mipmap，纹理用于数据不做 sRGB 色彩变换。原版 DataTexture 默认满足相应数据采样要求，迁移时显式检查。

```glsl
// 顶点阶段：原版通过 onBeforeCompile 注入 begin_vertex 后
vec4 state = texture2D(partState, stateUv);
transformed += state.xyz;
partVisible = state.w;
partSelected = texture2D(selectionState, stateUv).r;
```

```glsl
// 片元阶段
if (partVisible < 0.5) discard;
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42,0.85,0.78), partSelected*0.75);
```

CPU 每轮写 `data[4*i+0..2]=offset.xyz`、`data[4*i+3]=visible?1:0`，`selectedData[4*i]=selected?255:0`，之后 texture.needsUpdate=true。Uint8 的 255 会被纹理采样归一到 1；写 1 只会得到 1/255 的弱高亮。

Three.js 的 shader chunk 属于版本耦合点。`#include <begin_vertex>`、`<clipping_planes_fragment>`、`<color_fragment>` 在固定 r159 已验证；升级后检查实际 ShaderLib，不要认为 replace 没报错就已经注入。可增加 replace 前后包含检查，并在浏览器确认平移、高亮和隐藏。

## 超过一行纹理容量时

原版 `ceilPowerOfTwo(N)` 宽度可能超过 GPU 限制。改为二维时，CPU 和 shader 必须一起改：

```text
width  = min(maxTextureSize, chosenWidth)
height = ceil(N / width)
要求 height <= maxTextureSize
x = index % width
y = floor(index / width)
uv = ((x+.5)/width, (y+.5)/height)
```

CPU 数据仍可连续 `4*index`；padding 必须初始化成不可见。纹理尺寸改成 width×height，两张纹理一致。这个扩展是建议，不是原仓库已实现功能。

## 拾取不能省略的同步

- 渲染合批只是 GPU 平移，默认 CPU Raycaster 无法知道。
- 创建独立 picker Mesh 但不 scene.add；保存对应 part id。
- offset 每次改变：picker.position.copy(offset)，updateMatrix，updateMatrixWorld。
- 先跳过隐藏 part，再 `bounds.clone().translate(offset)` 做 ray/AABB 粗筛。
- 对通过粗筛者做 Raycaster 精确三角形测试，选择最小距离。
- 透明外壳是否挡住内部选择要按产品定义，原版遇到实心部件时跳过皮肤。
- 小部件补选可从屏幕投影矩形找最近候选，只在拆开模式启用，且同样过滤不可见对象。

如果增加旋转：AABB 必须变换 8 个角并重建；picker 应使用完整相同 matrix；顶点和 normal 一起转。把静态 bounds 加一个 offset 已经不够。

## 性能优化的先后顺序

先用 renderer.info.render.calls/triangles、帧时间和内存做记录。后续可缓存 system index、selection Set、layoutKey/version，避免每帧 find、filter 和长字符串；只在 visible set 或 viewport 变化时计算 pack。GPU 纹理只在变化时上传，空闲状态跳过 render。

需要在应用中把性能统计显式显示在开发面板或诊断接口后再读取；不要凭页面“看起来顺滑”写 60 FPS。原版仍有常驻 RAF，discard 的隐藏部件仍参与部分 GPU 工作；不要宣传为零开销。
