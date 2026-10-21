# TeXPro 功能想法与实施状态

> 最后更新：2026-10-21
>
> 本文是产品想法池，不等同于已发布功能。状态分为：进行中 / 待开始 / 已搁置 / 已完成。

## 状态总览

| # | 想法 | 状态 | 备注 |
|---|---|---|---|
| 1 | 图片粘贴 / 拖拽自动入库 | 已完成 | 截图粘贴、拖拽、自动写入素材库并插入 |
| 2 | 表格可视化编辑 | 已完成 | 网格编辑、行列、对齐、booktabs、caption/label |
| 3 | PDF 大文档性能 | 已完成 | 懒渲染、离屏释放、缩略图、搜索 |
| 4 | 编译策略优化 | 已完成 | 手动 / idle / PDF 可见三档，编译排队、取消旧任务 |
| 5 | TeX 环境 / 项目医生 | 已完成 | 工具检测、缺包、断链、label/ref/cite 检查、清理构建 |
| 6 | 选中文字浮动工具条 | 已完成 | 粗体/斜体/等宽/公式/引用/引用跳转 |
| 7 | 命令 / 引用悬停预览 | 已完成 | ref/cite/package/image 悬停卡片 |
| 8 | **本地版本历史** | **已完成** | 内容寻址分块、快照、行级 diff、恢复、手动删除/清空 |
| 9 | LaTeX → Markdown / Typst / HTML 导出 | 已完成 | 三种格式导出、预览、复制、下载 |
| 10 | Bib 管理器增强 | 已完成 | DOI/arXiv、RIS/EndNote、BibTeX/BibLaTeX 模式、样式选择 |
| 11 | 模板工坊升级 | 已完成 | 编译首页缩略图、复制为变体（继承） |
| 12 | 文件重构 | 已完成 | 文件/目录移动、引用更新、孤立 TeX 文件检测；文件跨目录移动与文件夹 CRUD |
| 13 | 注释 / 评审模式 | 已完成 | 源码锚定、自动重锚定、导出报告、解决/重开 |
| 14 | PDF 增强 | 已完成 | 搜索、缩略图、文字层选择、双页、演示、编译前后叠加 diff |
| 15 | 可选 AI | 已完成 | 流式输出、Keychain（safeStorage）、受控智能体操作 |
| 16 | arXiv 投稿包 | 已完成 | 源文件/素材收集、排除 build/aux、zip 导出 |
| 17 | Overfull / Underfull 热区 | 已完成 | 编译问题映射到 PDF 页面热区，点击跳转 |
| 18 | 拼写检查 | 已完成 | 命令/公式/URL/verbatim 掩码，项目词表 |
| 19 | 智能粘贴 | 已完成 | HTML 表格/标题/列表/粗体、Unicode 数学转 LaTeX |
| 20 | 引用 / label 关系图 | 已完成 | 文件、label、citation、include 边，孤立 label 标记 |
| 21 | 字体覆盖检查 | 已完成 | 文字脚本计数、声明字体、PDF 字体、问题列表 |
| 22 | 字母变体面板 | 已完成 | mathbb / mathcal / mathfrak / mathscr / mathbf / mathsf / mathtt / boldsymbol |
| 23 | **手写 / 墨迹引擎** | 已完成 | perfect-freehand 压感笔刷、速度回退、橡皮、撤销/重做、PNG/TikZ 输出 |
| 24 | **电路 / 逻辑 / 结构式工作室** | 已完成 | 三个独立可视化工作室、拖拽节点、端口连线、属性、模板、缩放、撤销 |
| 25 | **局域网实时协作** | 已完成 | Yjs CRDT、WebSocket 房间、在线人数、共享文本、应用到文档 |
| 26 | **WebDAV / iCloud / SSH 备份** | 已完成 | 时间戳 zip；WebDAV PUT；SSH/SCP；不记录密码 |
| 27 | **MCP 生态** | 进行中 | 16 tools、resources、prompts、内置 stdio 客户端（连接/列工具/调用）、Git/Overleaf、Zotero Better BibTeX 导入；外部服务器持久化与插件安装仍待继续 |
| 28 | SVG 素材兼容 | 已完成 | `sips` 栅格化缓存；插入时自动转 PNG；可批量改写旧引用 |
| 29 | 统一设计系统 | 进行中 |
| 30 | **宏包与文档类管理器** | 已完成 | 解析/写回 preamble，类选项、宏包目录、安装检测、排序与自定义 |
| 31 | **可配置补全与构建动作** | 已完成 | `.cwl` 导入、宏 JSON、动作 JSON、`txs:///` 解析、内置/自定义命令 |
| 32 | Git-first 版本管理 | 已完成 | 检测 Git 仓库后停用内部快照 |
| 33 | MCP 剧组 | 已完成 | 五个只读角色，经本地 MCP server 收集项目报告 |
| 34 | 写作房间 | 已完成 | LAN 协作参与者名字与在线名单 |
| 35 | 插件市场与 CWL 自动扫描 | 已完成 | 统一插件市场；扫描 TeXstudio 与项目 `.cwl`，加载/导入/重扫 |
| 36 | Paper as API + Referee Mode | 已完成 | 只读本地 API；确定性审稿报告与跳转 |
| 37 | 零界面模式 | 已完成 | 只保留纸面，Esc 退出 |
| 38 | Compile Theater | 已完成 | 构建时间线、诊断卡和 log | Typora 纸面感 + Xcode 控件；统一字号、圆角、间距、动效与图标 |

## 版本历史实现（#8）

- 存储：`.texpro/history/objects/<hash>.br`（Brotli 压缩块）+ `.texpro/history/manifests/<id>.json`。
- 分块：按行累积到约 4KB；相同内容只存一份，manifest 记录每个文件的 chunk hash 列表。
- 触发：手动「创建快照」和显式保存（⌘S）；**不在每次编译或自动保存时快照**。
- 审阅：快照列表、文件选择、行级红绿 diff、恢复文件。
- 清理：逐条删除快照、清空全部历史；删除后对未引用对象做 GC。
- 保留：最多 80 个 manifest；旧快照自动淘汰。

## 工作室实现（#24）

- 入口分离：Circuit studio / Logic studio / Structure studio，不再共用一张表单。
- 元件库：电阻、电容、电感、电池/电压源/电流源、二极管、LED、开关、灯泡、电表、电位器、接地；AND/OR/NOT/XOR/NAND/NOR/XNOR；原子/基团/苯环。
- 交互：从元件库拖到画布、节点拖动与 10px 网格吸附、端口点击连线、导线选中、Delete、属性编辑、模板、缩放、撤销/重做、项目内自动保存。
- 输出：circuitikz、circuitikz logic ports、chemfig；预览使用真实 TikZ 编译，失败时回退最小 preamble。

## 墨迹引擎实现（#23）

- `perfect-freehand` 轮廓笔刷；手写笔使用 `PointerEvent.pressure`，鼠标使用速度模拟。
- 压感开关、笔宽、颜色、画笔/橡皮、撤销/重做、清空。
- PNG 通过 canvas 2x 输出，兼容所有 LaTeX 引擎；TikZ 输出可直接继续编辑。

## 设计方向（#29）

- 主线：Typora 的纸面感、单列写作、克制的 chrome。
- 参考：Apple Human Interface Guidelines 的「目标感、能动性、熟悉感、简洁、匠心」；Xcode 的紧凑分段控件与工具条。
- 统一 token：28px 控件高度、6px 控件圆角、14px 工作室圆角、62px header、50px footer；120/180ms 动效；所有图标来自 lucide SVG 图标库。
- 无 Liquid Glass 主题；已移除失败的半透明实验。

## 后续仍值得做

- MCP：Zotero / Git / Overleaf 的完整客户端集成、elicitation、插件市场。
- 结构式：环、立体化学、官能团模板与更智能的 chemfig 排版。
- 电路：旋转、节点/网表编辑、spice 风格属性、导线自动避让。
- 版本：项目级恢复、快照命名、跨项目去重。
- 备份：定时备份、保留策略、WebDAV 证书/密钥链集成。
