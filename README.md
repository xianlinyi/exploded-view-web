# exploded-view-web

一个用于制作可交互三维结构拆解网页、装配爆炸图和零件清单的 Codex 技能包。

## 默认示例

用户没有提供模型时，技能默认使用 `assets/house/` 的“胡桃木之家”概念房屋模型。它包含可运行的 Vite + Three.js 网页、1,296 个网格、77 个家具／构件、10 个空间、静态 GLB、分组清单、材质贴图、夜景参考图和一份 Blender 源模型。

```bash
python3 scripts/create_project.py /tmp/house-explorer
cd /tmp/house-explorer
npm ci
npm test
npm run build
npm run dev
```

需要通用 12 零件示例时使用 `--mode starter`；需要固定的人体参考实现时使用 `--mode human-atlas`。房屋资产的公开使用边界见 `assets/house/HOUSE-DATA-NOTICE.md`。

## 设计边界

技能保留原始零件、基准变换、单一状态来源、可点选与可复原的拆解流程；不会从照片或一体 Mesh 推断不存在的内部零件，也不把概念装修模型当作结构或施工依据。

Human Atlas 源码快照固定在提交 `7a383d3ee2759e3ddf157c704fb8814fd0c50bcb`，人体几何不随包提交，恢复和署名方式见 `references/NOTICE.md`。

## 许可证

技能代码、文档和通用模板按根目录 MIT License 分发。Human Atlas 代码保留其上游许可证；人体数据按随包归属文件处理。房屋模型和房屋网页数据是单独的用户资产，不能仅因仓库根目录存在 MIT 文件就推断其获得相同授权。
