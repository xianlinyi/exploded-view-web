# Human Atlas：从源码到效果的具体实现

核查日期：2026-09-06。固定版本：[7a383d3ee2759e3ddf157c704fb8814fd0c50bcb](https://github.com/ashemag/human-atlas/tree/7a383d3ee2759e3ddf157c704fb8814fd0c50bcb)。本分析来自该提交的实际源码和元数据；不是根据首页文案推测。在线演示的部署提交没有公开校验，因此在线截图只证明当时可见行为。

目录：1 入口和职责；2 模型管线；3 动画数学；4 排布；5 GPU；6 拾取；7 相机；8 状态；9 局限与迁移。

## 1. 真正的入口和结构

```text
web/index.html
  → web/main.tsx   createRoot(...).render(<Home />)
    → app/page.tsx UI、元数据加载、搜索、系统筛选、详情与 SceneState
      → app/scene.tsx Three.js 的场景、渲染器、加载、GPU 材质、相机、拾取
        → app/explosion-layout.ts 可见零件排布
        → app/pointer-tap.ts 点击/拖动/多指判定
        → app/model-download.ts gzip 识别与解码
app/anatomy.ts 数据类型、系统调色板和解释文案
app/agent-tools.ts 可选浏览器 WebMCP 工具
public/models/atlas.json 模型目录和二进制切片索引
public/models/body-N.bin(.gz) 顶点、法线、索引
scripts/convert-anatomy.py → optimize-anatomy.mjs → compress-models.mjs
components/ui/ 界面组件库；lib/utils.ts 合并 className
```

**它运行的是 Vite 静态 React 应用。** `app/page.tsx` 的文件名像 Next.js，但实际入口是 `web/main.tsx`，`vite.config.ts` 把 `web` 设为根目录、`public` 设为静态资源、构建到 `dist`。没有服务端动画，也不需要账号或模型 API。React 负责 UI 状态，Three.js 通过 `useEffect + ref` 直接操作，不使用 React Three Fiber。动画不依赖 GSAP、Framer Motion、物理引擎或 WebGPU。

`package.json` 中的 vinext、Cloudflare 等依赖不等于它们在当前渲染链路里使用。不要复制全部依赖作为通用模板的最低要求。证据：[入口](https://github.com/ashemag/human-atlas/blob/7a383d3ee2759e3ddf157c704fb8814fd0c50bcb/web/main.tsx)、[构建配置](https://github.com/ashemag/human-atlas/blob/7a383d3ee2759e3ddf157c704fb8814fd0c50bcb/vite.config.ts)。

## 2. 模型资产是效果成立的前提

`atlas.json` 实际包含 2,234 个独立 `parts`、3,432 个 `concepts`、15 个二进制 chunk；这两个 15 分别是展示系统数和文件块数，不是“一个系统一个文件”。原始三角形计数 6,681,030，优化后 2,288,268。恢复工具核验全部文件的长度和 Git blob。

- Part 是实际零件：唯一 `id`、`name`、`conceptId`、`system`、`chunk`、三个字节偏移、两个计数、AABB。
- Concept 是语义条目：`id/name/elements[]`；例如一个器官名可以关联多个 Part。
- 同一 Part 可属于多个概念，但只渲染一次。搜索选概念时高亮 `elements`，点击画面时只选一个 Part。

加载流程：先 fetch 元数据，再启动 3 个 worker 式异步加载循环。每个 chunk 中按 Part 的字节偏移建立视图：位置 `Float32Array`，法线 `Int16Array`（BufferAttribute normalized=true），索引 `Uint32Array`。不要把 `positions` 误认为顶点数偏移；它是 byte offset。四字节对齐使这些 TypedArray 可以直接构建。

支持 `DecompressionStream` 时下载 `.gz`；否则加载 `.bin`。读取前两个字节 `1f 8b` 来判断 Fetch 后的内容是否仍是 gzip，避免服务器已经通过 Content-Encoding 解压后再次解压。解压后必须检查 `chunk.bytes`。进度是完成 chunk 数 / chunk 总数，并不是实时下载字节比例。证据：[解码](https://github.com/ashemag/human-atlas/blob/7a383d3ee2759e3ddf157c704fb8814fd0c50bcb/app/model-download.ts)、[场景加载 L59–74](https://github.com/ashemag/human-atlas/blob/7a383d3ee2759e3ddf157c704fb8814fd0c50bcb/app/scene.tsx#L59)。

可选重建链：OBJ → 坐标转换 → 紧凑二进制 → meshoptimizer 简化 → gzip。原始坐标转换为 `(x*.001, z*.001+.0781112, -y*.001-.1)`，即毫米 Z-up 到米 Y-up，再加人体舞台偏移。**两个平移常量属于该人体数据，不能用于任意 GLB。** 简化目标大约是原索引的 22%，受每个部件相对误差 `.002` 约束，不保证每个部件都降到同一比例；每个 Part 仍被保留。

重建不是完全自包含：需要原始 OBJ 与整理好的 concept/system mapping。当前仓库没有把上游表格到这两份研究映射的完整生成过程交付出来。最可靠的复现方式是用已打包的 atlas + bin，而不是让弱模型自行猜测解剖层级。

## 3. “爆炸”的真正数学

从 `app/scene.tsx` L96–115 可见，爆炸没有改顶点拓扑，只算每个 Part 的平移。

设滑块目标值 `E ∈ [0,1]`；实际动画值 `a` 用阻尼追赶：

```text
a_next = a + (E - a) × (1 - exp(-8 × dt))
dt = min(frame_delta_seconds, 0.05)
```

`a` 是渲染时的平滑值，React 中的 `explode` 是目标值。不要每帧 setState 强迫整个面板重新渲染。

设 Part 原始中心 `c=(cx,cy,cz)`，系统序号 `g`，系统数 `G=15`：

```text
θ = (g/G) × 2π
S = (sin(θ) × 0.48, (cy-0.85) × 0.28, cos(θ) × 0.48)
```

S 是第一段结束时的分组散开位移。系统沿 XZ 环绕方向分散，Y 根据部件相对人体中心的高度进一步拉开。它不是每个零件随机飞散，也不是沿零件法线移动。

排布单元中心为 `(cell.x,cell.y)`，最终目标中心 `D=(cell.x,cell.y+0.85,0)`。最终位移是 `D-c`，不是 D：

```text
0 ≤ a ≤ 0.45: Δ = S × (a/0.45)
0.45 < a ≤ 1: Δ = lerp(S, D-c, (a-0.45)/0.55)
最终顶点 = 原始顶点 + Δ
```

45% 左右必须连续。100% 时中心来到 D；0% 时位移严格回零。generic starter 把整套模型归一到中心原点，因此使用 `cy` 和 `cell.y`，省去 `.85`。这是显式适配，不是原仓库原样公式。

原版角度序号来自 `SYSTEMS` 固定顺序。切换可见系统时不能重新按剩余类别编号，否则第一段方向会突然改变。

## 4. 最终排布：有尺寸的货架式二维装箱

[explosion-layout.ts](https://github.com/ashemag/human-atlas/blob/7a383d3ee2759e3ddf157c704fb8814fd0c50bcb/app/explosion-layout.ts) 只有一个核心函数。

1. 先计算真正可见的 parts；隐藏对象不占格子。
2. 每个零件取原始包围盒的 X/Y 尺寸，最小尺寸 `.035`，再各加 `.04` 间隙。
3. 面积 `A=Σ(width×height)`；目标行宽 `max(maxPartWidth, sqrt(A×clamp(aspect,.5,1.5))×1.18)`。
4. 按高度降序、相同高度按 ID 排序；这使结果可重复，不受随机数影响。
5. 从左到右装行，放不下就换行；行高取该行最大高度。
6. 所有 cell 整体平移到排布中心。

这比等尺寸网格适应长短不一的骨骼/血管；也比纯球面向外散开更容易形成清晰目录。代码中的 card 带有 system 字段，但排序实际上按高度/ID，**最终清单不是按系统分栏**。

测试证明 cell 在布局边界内、任意两个 cell 的 X 或 Y 不相交。但这是二维布局证明：不能据此声称整个动画没有穿插、倾斜观看永不重叠或 UI 面板永不遮挡。透视深度、标记大小和浮层还要在屏幕上验收。

## 5. 为什么数千个零件还能交互

原版把同一 chunk 内、同一 system 的 geometry 合并，用少量 Mesh 承载多个形状不同的零件。不是 2,234 个 Mesh 每帧分别提交；也不是只适合同一几何副本的 InstancedMesh。确切批次数取决于每个 chunk 包含多少 system，不能声称只有 15 个 draw call。

每个顶点增加 float `partIndex`，指向两张状态纹理：

| 状态 | 存储 | 含义 |
|---|---|---|
| partState | Float32 RGBA，一行，宽度取零件数的下一次幂 | RGB 为平移，A 为可见 0/1 |
| selectionState | Uint8 RGBA，同样尺寸 | R 为 0 或 255，对 shader 采样为 0 或 1 |

`onBeforeCompile` 向 `MeshStandardMaterial` 注入：顶点阶段查 `((partIndex+.5)/width,.5)` 并累加平移；片元阶段按 visible 丢弃，按 selected 混合青绿色。仍保留标准材质的光照。

平移不改变法线，所以这里无须每帧重算法线。若扩展到旋转/缩放，不能只加三个位移数字；要增加变换和法线处理。shader 改了位置，CPU 默认 frustum 不知道，因此合批 Mesh 设置 `frustumCulled=false`。

动画每帧更新约 N 个状态，而不是所有顶点。`dirty` 决定是否调用 render；rAF 本身仍然持续运行，不能称为完全停掉帧循环。还保留 CPU 几何用于拾取；这部分内存成本并未被合批消除。隐藏使用 fragment discard，仍有顶点和部分 GPU 开销。

## 6. 点选为什么不偏移

只用 Raycaster 去点“shader 移动过的合批 Mesh”会错，因为 Raycaster 看到的是 CPU 原始顶点。

原版为每个 Part 保存一个不加入场景绘制的 picker Mesh。动画更新状态纹理时，同步 `picker.position=Δ`，再更新 matrix/matrixWorld。点击时先做平移后 AABB 粗筛，再做该 Part 三角形射线求交，取最近距离。

- 用统一可见条件跳过隐藏 Part。
- 有其他实心结构时，透明皮肤层不抢选中。
- 拆开后对小零件再用屏幕投影包围盒补选；鼠标 16px、触摸 24px 候选半径。
- 75% 后显示不随距离缩放的 5px 圆点，小血管也有可见目标。
- 鼠标移动可显示 hover；触摸没有 hover。
- 直接点击阈值鼠标 5px、触摸 12px；一旦拖动越界，即使回到起点也不算 tap；多指和取消序列不会触发选中。

证据：[pointer-tap.ts](https://github.com/ashemag/human-atlas/blob/7a383d3ee2759e3ddf157c704fb8814fd0c50bcb/app/pointer-tap.ts)、[拾取 L83–94](https://github.com/ashemag/human-atlas/blob/7a383d3ee2759e3ddf157c704fb8814fd0c50bcb/app/scene.tsx#L83)。

## 7. 相机和 UI 是效果的一部分

透视相机 FOV=34°；OrbitControls 启用 damping，初始三分之四视图。光照包括 RoomEnvironment 的 PMREM、半球光、暖主光和冷轮廓光，ACEs 色调映射、曝光 1.12。地面、圆台和细环是舞台，不属于人体可拆零件。

相机随着展开程度适配清单宽高，计算时给顶部、侧栏、底部滑块预留空间。高展开时强制正视：动画拟合在 `amount>.5` 开始选 front；`.8` 后禁转动，左键和单指改平移；`.4` 后不再自动旋转。UI 禁用值采用目标 explode，而场景采用平滑 amount，动画过渡期间二者不是完全同步。

隔离时合并所有已选零件移动后的 AABB；读取详情面板真实 DOM 边界；用 `camera.setViewOffset` 把选中内容安排在剩余空间。移动端详情是底部面板，横屏改右侧面板；这些决定了用户是否能看清选中部件。

原版使用固定像素预留和部分真实 DOM 测量的混合策略。中等宽度布局仍应重点复核，不能只跑打包布局测试就宣布浮层完全不遮挡。

## 8. 页面状态及 React/Three 边界

`SceneState = { explode, visible, selected, isolate, view, rotate, reset, inspectorOpen? }`。

- `page.tsx` 更新目标 state；scene 用 `latest.current` 拿最新状态，不因滑块变化销毁重建场景。
- `visible` 是系统 ID 集合；`selected` 是 Part ID 集合，两者不能混用。
- 普通可见公式：`visible.has(part.system) || selected.has(part.id)`。
- 隔离可见公式：`selected.has(part.id)`。
- choose(concept) 设置该概念所有 elements；choosePart 只选单个零件。
- 选中令目标自动显现并打开详情；隔离按钮将 explode 归零后适配所选集合。
- 类别开关清掉选择和隔离；reset 恢复默认系统、视角、关闭面板并增加 reset 计数。
- 搜索以概念 name/id 子串匹配；不是向量数据库、全文服务或 AI 搜索。
- WebMCP 的 find/inspect 只是同一 UI 状态的可选工具入口；浏览器不支持也能完整使用页面。

## 9. 复用价值与明确局限

最值得复用：资产身份与几何分离、可见集驱动排布、两阶段确定性位移、CPU/GPU 同步、相机为 UI 留白、单一状态与契约测试。

不应直接泛化：人体中心 `.85`、米制间距 `.04`、15 个系统的配色和默认顺序、BodyParts3D 的 OBJ 转换假设、2,234/3,432 硬编码验收计数。

已知边界：

1. 不模拟碰撞、不生成零件、不做切面布尔运算；原始装配中本来可能互相接触或交叠。
2. 一维纹理宽度必须小于设备 MAX_TEXTURE_SIZE；扩大到数万零件应改二维状态纹理。
3. 原动画移动时每帧过滤 parts、拼接 ID 字符串、查系统下标；更大数据需缓存布局版本、类别索引和集合，避免重复工作。
4. shader 注入绑定 Three r159 的 chunk 名；升级必须编译检查并截图验证，不能盲换 latest。
5. gzip 解码、合并几何在主线程执行；低端手机可能有加载峰值。原仓库没有真机多点触控/FPS 证明。
6. 原版的 package-lock 在本轮 `npm audit` 报告 11 项（8 high/2 moderate/1 low），类型检查和构建通过不消除该风险。本技能保留它作为基线；通用 starter 单独精简依赖并升级 Vite。
7. 许可分开处理：代码是 MIT；数据官方许可是 [CC BY 4.0](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html)，保留署名、来源和修改说明。包内有原始 LICENSE 和 ATTRIBUTION.md。

后续产品化建议来自本次分析而非仓库现有功能：Web Worker 解码、资源释放回归、布局缓存、二维状态纹理、基于可用画布的更精确相机、按实际业务定义 concept 层级。按需求逐项加入，不在第一次复刻时同时引入。
