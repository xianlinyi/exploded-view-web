# 栖居 · 全屋夜景拆解

使用真实房屋 Blender 夜景版本制作的本地交互网页：全屋组装 → 房间展开 → 所选房间家具排布。原有家具与尺寸不变，夜景使用实时灯光近似呈现。

这是 exploded-view-web 技能的默认房屋示例。公开使用边界见同目录 `HOUSE-DATA-NOTICE.md`；`source/` 中保留了本次发布对应的 Blender 源模型和尺寸说明，便于需要时重新导出。

## 运行

需要 Node.js ≥22.13。

```bash
npm ci
npm run dev -- --port 5175
```

生产构建及本地预览：

```bash
npm run build
npm run preview -- --port 5176
```

浏览器打开终端显示的地址。`dist/` 为独立静态站点，包含全部模型和贴图；请通过 HTTP 服务打开，不能直接双击 HTML。网页不访问远程字体、模型或 API，没有登录与后台服务。

## 操作

- 默认以源 `02_axon` 相机方向查看完整剖切房屋；拖动旋转、滚轮缩放。
- 进度 0–50% 展开空间；继续到 100%，将全屋家具按原比例排布；选中房间时只排列该房间。
- 无需选择空间即可直接拖到 100%；全屋排布中点选家具不会自动缩小为单房间。
- 点击目录或画面选择家具；金色轮廓不改动原材质。可以隔离查看、清除选择或复原。
- 房间右侧圆点控制显隐；搜索会匹配中文名称、原模型名称与所属房间，并恢复目标所在房间的可见性。
- 家具排布阶段保持固定轴测方向，只允许平移和缩放。手机使用底部“空间目录”按钮。
- “原夜景”打开 Blender 渲染参考；“复原”清除筛选、选择和拆解位移。

## 资产与代码

- `public/models/house.glb`：1,296 个源网格、38 种材质，26 张内嵌贴图，18,189,252 字节。
- `public/models/house.json`：源文件哈希、10 个空间、77 个家具／构件分组、每个网格的稳定 ID、原名称、变换、边界、相机和灯光。
- `scripts/export_house.py`：独立后台 Blender 导出与材质烘焙；只导出专用场景，从不保存源文件。
- `src/house-core.js`：单一状态、可见性、房间展开与投影边界排布。
- `src/house-loader.js`：保留 GLB 材质、烘焙世界变换并按同家具同材质合并绘制；纹理在退出时释放。
- `src/main.js`：交互、正交相机、夜景灯光、轮廓、错误与手机布局。

同房间中无家具父节点的网格，通过导出脚本的显式语义规则归为地毯、固定设施、软装等组；结果逐网格记录在清单中。公共墙地面与电梯背景只有一份。展示背景地面不参与房屋尺寸适配，展开时隐藏，避免遮挡家具。

## 重新导出

Blender 5.2.1 已验证。将下列路径替换为实际源文件位置；输出目录应为本项目的 `public/models`。

```bash
/Applications/Blender.app/Contents/MacOS/Blender -b --python-exit-code 1 \
  --python scripts/export_house.py -- \
  --source /path/to/129_Walnut_Home_Overview_Night.blend \
  --out public/models
python3 scripts/verify_asset.py --source /path/to/129_Walnut_Home_Overview_Night.blend
npm test
npm run build
```

烘焙采用原程序化材质节点的 512px 色彩／法线色样，使用物体局部盒式 UV 投射复用；纹理分布与 Cycles 的 Generated 坐标不完全相同。灯光从源夜景元数据提取，每个房间最多选两盏局部灯，浏览器中转换为暖色点光。没有宣称还原 Cycles 全局光照或逐像素一致。

## 验证与边界

详见 `docs/VERIFICATION.md`。`npm test` 包含通用模板回归与真实房屋布局测试。资产校验器逐个读取 GLB 顶点，验证导出世界边界与源模型一致（容差 0.2 毫米），并检查唯一映射、贴图及源哈希。

概念装修模型，不是实测结构或施工图；没有生成未建模的管线、内部结构或拆墙方案。交付为可公开仓库中的本地网页示例，未发布为独立公网站点。手机尺寸测试运行于 Mac 浏览器，未冒充真机性能测试。

原创模板来源于本仓库 `skills/exploded-view-web/assets/starter`，保留其核心算法、基线测试和许可证；未使用人体几何或修改 Human Atlas 上游源码。
