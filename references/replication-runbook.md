# 给执行模型的逐步复刻手册

先读 SKILL.md，确定路径。下面 `<SKILL_DIR>` 是 SKILL.md 所在目录，`<PROJECT_DIR>` 是用户的目标项目目录。先解析真实路径再执行。每一步有明确结束条件；发生错误时只修当前错误，不重新设计全部项目。

## A. 精确复现 Human Atlas

### A1. 创建固定版本源码

```bash
python3 <SKILL_DIR>/scripts/create_project.py <PROJECT_DIR> --mode human-atlas
```

预期：生成 app、web、components、public/models/atlas.json、package-lock 等。没有 `.bin/.gz` 是有意设计，不是下载失败。模板是完整文本源码，不是需要自己填充的框架。不要改入口、升级依赖或翻译文案。

### A2. 恢复模型

```bash
python3 <SKILL_DIR>/scripts/restore_models.py <PROJECT_DIR>
```

预期：15 行 Verified 和固定 commit。工具下载约 33 MB gzip、解压出约 59 MB 原始数据；实际值以 upstream-lock.json 为准。脚本优先使用系统 curl 的证书校验，否则使用 Python HTTPS。没有关闭证书验证的选项。

网络断开可再次执行：正确的既有文件复用。不同内容的同名文件会在下载前停止，避免覆盖用户资产。不要手工删除已有模型来强行过关，先确认目标是否选错。

### A3. 安装和验证

```bash
cd <PROJECT_DIR>
npm ci
npm run check
node scripts/validate-atlas.mjs
node scripts/validate-interactions.mjs
npm run build
npm run dev -- --host 127.0.0.1
```

打开终端实际显示的 URL，默认 `http://127.0.0.1:3016`。发生端口占用按终端给出的地址访问，不结束其他未知进程。`dist` 是静态构建产物；不要用 file:// 双击 HTML。

完成条件：模型加载到 100%，能看见人体；0/45/100 三态切换；隐藏 Muscles 后可见数变化；搜索 heart 后详情与高亮出现；隔离后只剩所选；reset 回初始。不能把上游 README 中宣称的验证当作本次测试结果。

### A4. 有基线后才修改

| 想改什么 | 修改位置 | 暂时别改 |
|---|---|---|
| 标题、文案、搜索展示 | app/page.tsx、app/anatomy.ts | scene.tsx 算法 |
| 面板位置、字号、颜色 | app/globals.css | 模型坐标 |
| 第一段散开方向/幅度 | scene.tsx dx/dy/dz 分支 | 0.45 边界两端各自改成不同公式 |
| 清单的间距、行宽 | explosion-layout.ts | 每帧随机位置 |
| 新类别 | anatomy.ts、atlas.json 及默认可见集合 | 将 Part ID 当作类别 ID |
| 替换成其他大型模型 | 先完成资产契约和转换器 | 把 GLB 改名为 .bin |

原版 `validate-atlas.mjs` 固定检查 2234/3432；只有数据正式变化后才能把计数改成新 manifest 的已知期望值。不要为掩盖数据遗漏删除计数断言。

原版依赖含历史问题。可在独立工作副本升级或删除未使用依赖，但每次升级后跑 check/build 和界面回归，特别是 Three.js shader 注入与 shadcn 组件。固定基线和安全改造结果分别记录。

## B. 通用结构网页（弱模型首选）

### B1. 创建、验证、启动，不写任何新动画

```bash
python3 <SKILL_DIR>/scripts/create_project.py <PROJECT_DIR> --mode starter
cd <PROJECT_DIR>
npm ci
npm test
npm run build
npm run dev
```

默认 `http://127.0.0.1:5173`。首先显示一个有底座、上盖、轴、轮、轴套和螺栓的 12 零件装配。该模型仅作示意。

### B2. 读最少的源码

1. `src/model.js`：返回 Part 数组；改模型只从这里开始。
2. `src/core.js`：packParts、partOffset、visibleParts、PointerTap。第一次改外观时不要碰。
3. `src/main.js`：DOM 事件、单一 state、场景、相机和渲染。
4. `src/style.css`、`index.html`：UI。
5. 导入文件时才读 `src/import-glb.js` 和 asset-contract.md。

通用模板没有框架依赖，降低 JSX/React 生命周期额外负担。集成 React/Vue 时把场景初始化放进挂载钩子，保留 dispose，在卸载时调用；状态变化只调用统一更新入口，不重新 new WebGLRenderer。此时还需移除模板 DOM 全局事件或改成 AbortSignal，不能只复制 pagehide。

### B3. 只改一类内容

无模型：可按用户主题改 `createModel()` 的几何和 Part 描述；不凭想象补“准确机械结构”。有 GLB：执行 asset-contract.md 的静态导入步骤。有 OBJ：先在建模工具导出静态分件 GLB。用户要上千不同零件：先用少量样本证明数据正确，再转 GPU 路径。

每增加一个 Part，填全：id、name、system、geometry、bounds、description。system 必须存在于 systems 配色表。geometry 在统一坐标中，Mesh 初始 position 为零，bounds 由已经烘焙变换的 geometry 计算。

### B4. 按状态表接功能

| 动作 | 状态更新 | 可见结果 |
|---|---|---|
| 拖动滑块 | explode=百分比/100；rotate=false | 平滑追赶目标，无位置累计 |
| 点击列表/模型 | selected=[part.id]；isolate=false；rotate=false | 高亮、详情、隐藏类别里的目标也可见 |
| 切类别开关 | 更新 visible；selected=[]；isolate=false | 清单只对实际可见集重新排布 |
| 仅查看所选 | isolate=true；explode=0 | 只剩选中集，相机按其边界适配 |
| 显示周围结构 | isolate=false；explode=0 | 类别可见集恢复 |
| 清除选择 | selected=[]；isolate=false | 高亮取消，普通可见公式恢复 |
| 全部重置 | initial state；view=quarter；清空 query | 初始类别、组装位置、无高亮 |
| resize | 更新 renderer/aspect、重算排布、fit | 画布和控件可见，不沿用旧窗口尺寸 |

不要另设一份 selectedMesh 数组让它与 selected IDs 分离。整个页面的可见数、目录、高亮、Raycaster 都应消费同一个状态。

### B5. 动画改造检查点

- 0%：全部 position=(0,0,0)，原模型已在几何里保留装配位置。
- 45%：按固定类别序号散开，单个零件仍保持朝向和比例。
- 100%：每个零件中心位于 cell 中心，所有中心 z=0，切正视。
- 重复开合十次：不能漂移。
- 在 70% 切类别：剩余部件重排，不能保留隐藏部件空位。
- 在完全展开时点击：点选的是真正显示的 Mesh，不是原装配中的空位置。

### B6. 验证和交付

运行 npm test/build，按 acceptance-and-debugging.md 检查浏览器。提交路径、启动命令、三态截图和本次通过/未覆盖项。只要真实模型尚未提供，就明确标记“交互可用的示例”，不能称为已完成指定实体的外形复刻。

## 已有项目集成时的文件边界

1. 读现有 package、路由、生命周期和样式系统，只添加实际用到的 Three/loader。
2. core.js 的纯函数可直接迁移；model.js 改为资产适配模块。
3. main.js 的 DOM 查询换成框架 refs；不要把另一套完整 index.html 挤进已有页面。
4. 把状态上提到页面的既有 store；按实际变化设置 layout/fit/dirty 标志。
5. renderer 的 canvas 只挂载一次；离开路由应清掉 ResizeObserver、RAF、controls、geometry/material/texture 和事件监听。
6. 不因本技能把用户已有架构强改成 Vite 或删除原依赖锁文件。
