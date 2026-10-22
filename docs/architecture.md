# 架构与维护

TeXPro 保留普通 LaTeX 源文件。渲染进程负责编辑与展示，preload 提供类型化 IPC，主进程负责本地文件、外部进程和服务。可视组件是编辑辅助，最终排版来自 TeX 编译。

## 模块边界

| 模块 | 职责 |
| --- | --- |
| `src/App.tsx` | 活动工程、文档及核心写作流程编排 |
| `src/app/settings.ts` | 默认设置、最近工程与本地设置读取 |
| `src/app/project.ts` | 工程树遍历、文件路径与评论锚点 |
| `src/app/lazyTools.tsx` | 工具按需加载、保留关闭后的状态、隔离渲染错误 |
| `src/editor/` | CodeMirror 配置、补全、可视 decoration 与协作扩展 |
| `src/lib/music.ts` | 乐谱模型、校验、模板、普通 TeX 生成与注释数据往返 |
| `src/editor/MusicBlock.tsx` / `musicWidget.tsx` | 正文内记谱、真实 TeX 预览及 CodeMirror 原位更新 |
| `electron/services/music.cjs` | MusiXTeX 间距计算，使用 TeX 自带 texlua |
| `src/lib/pdfSync.ts` | PDF 坐标变换、文字盒子合并、框选取样 |
| `src/lib/schematic.ts` | 图形类型、模板、缓存校验、原生 LaTeX 生成；不依赖 React |
| `src/hooks/useDiagramPreview.ts` | 防抖预览、异步失败和过期响应隔离 |
| `src/hooks/useDialogFocus.ts` | 弹层焦点约束、Esc 和返回触发器 |
| `src/styles/workbench.css` / `schematic.css` / `pdf.css` / `welcome.css` | 本轮主工作台/图形工作室样式；共享主题保留在 `app.css` |
| `electron/main.cjs` / `preload.cjs` | 桌面生命周期、菜单、IPC 与能力边界 |
| `electron/services/tex.cjs` | 工程、编译、SyncTeX、资源等主服务及兼容导出 |
| `electron/services/project-root.cjs` | 工程主文件候选、持久化选择、编译解析与重命名路径更新 |
| `electron/services/project-files.cjs` | 工程文件类型与忽略目录规则 |
| `electron/services/history.cjs` | 内容寻址快照、精确恢复、GC 和 Git 优先边界 |
| `electron/services/git.cjs` | Git 状态与命令、Overleaf clone |
| `electron/services/collab.cjs` | 局域网 Yjs 文档及 awareness 转发 |
| `electron/services/mcp-client.cjs` / `mcp/server.mjs` | MCP stdio 客户端与服务端 |
| `electron/services/paper-api.cjs` | 绑定回环地址、token 保护的只读 API |
| `electron/smoke.cjs` / `regression.cjs` | 完整巡检与有断言的桌面交互回归 |

`tex.cjs` 保留原有对外函数名称，IPC 与 MCP 无需感知历史/Git 服务的迁移。工具首次打开时载入，关闭后仍保留组件实例；Writing Room 的生命周期独立管理，关闭面板不代表离开会话。

## 工程入口与生命周期

工程主文件按 `.texpro/project.json.rootFile` → 唯一未注释的 `\documentclass` 候选解析。多个候选无默认入口；失效配置不回退，删除主文件不自动提升其他文档。打开的编辑标签和 `% !TeX root` 不改变工程入口。侧栏选择以相对路径写入配置，保留未知配置字段。移动/重命名主文件或父目录会同步配置。

编译先保存全部脏缓冲区，再重新读取磁盘上的主文件配置；构建目录也从工程配置解析。结构/目录、版式和宏包设置定位到主文件的编辑器后应用。工具链动作在服务端展开 `{rootFile}`、`{rootName}`、`{buildDir}`，MCP 每次调用刷新工程身份；arXiv 包保留入口相对路径并写入 README。

关闭工程在保存完成前保留界面，失败则继续编辑。成功后取消编译、结束协作、清空工程文档及预览，回到统一主题的 Welcome，最近工程保留。工程代数与编译 ID 阻止旧工程的异步加载、编译和 SyncTeX 结果写回当前视图。

## 正文内乐谱

乐谱 decoration 先于公式和 TikZ 扫描占据完整块。React 控件通过 CodeMirror transaction 更新普通 TeX，保留撤销与保存；手写 TeX 与注释数据不一致时以源码为准。插入操作在工程主文件加依赖，在当前文件写块，并从编辑器实时文档读取插入位置，避免导言区刚修改而 React 状态尚未刷新的偏移问题。

`runCompile` 在第一轮 latexmk 后检查 mx1，必要时执行 TeX 自带 musixflx.lua 并重跑 latexmk。每次预览使用独立构建目录与 runId，不覆盖主编译的取消控制器；仅成功 PDF 原子发布到缓存，失败或取消会删除临时目录。PDF.js 在编辑器内渲染并裁去空白页边，正文排版仍以主文件 PDF 为准。

## 图形状态与手势

每次拖拽记录指针 ID、捕获元素、起始文档快照和画布偏移。移动坐标包含滚动量并按缩放还原。结束手势时先捕获快照、清除引用，再排队更新历史，避免延迟执行的 React updater 读取空引用。只有位置变化才生成撤销步骤。释放、取消、捕获丢失或窗口失焦都会结束手势。

本地缓存是外部数据，须校验元件种类、唯一 ID、有限坐标与边端点。预览 IPC 拒绝在工具内显示并提供重试，不能成为未处理的 Promise。工具渲染错误由独立恢复边界拦截，主文档保持打开。

## PDF 双向定位

SyncTeX 的 `x/y` 是文字锚点，`h/v/W/H` 是排版盒子；不能把锚点当成矩形左上角。服务保留锚点并提供独立 `bounds`，PDF.js viewport 统一处理缩放、旋转与裁切。原生 TextLayer 负责文字几何，定位高亮合并同一行的相邻文字，跨栏保持分离。滚动只操作 PDF 容器，使目标盒子进入可视区。

反向点击选择源码行；拖框按实际文字行最多取样七点，汇总同一文件的行范围。跨文件区域打开匹配最多的文件并提示，不拼接无关源文件。异步结果用请求序列和工程/文档身份拦截，反向定位后暂缓光标跟随。重新编译同一 PDF 更新文档而不卸载整个阅读器，保留阅读位置。精度仍以 SyncTeX 的行级映射为准。

## 构建与发布

1. 定时和手动触发先按上海时区检查当天提交（committer 时间、first-parent 历史）。空提交不计；当天无实际文件变更则跳过测试、打包、发布。有变更时测试任务运行回归测试、类型检查与前端构建。
2. 每个平台在独立 checkout 中安装依赖、设置版本、构建前端。
3. `scripts/before-pack.cjs` 校验实际待打包目录，缺少入口/资源即失败。
4. electron-builder 创建应用；`scripts/after-pack.cjs` 读取实际 ASAR 并复核资源，同时检查外部 MCP 服务及其六个服务依赖。MCP 由普通 Node 启动，不能依赖 Electron 的 ASAR 加载能力。
5. 三个平台成功后，既有 release job 收集安装包并发布 Nightly。

本地运行 `npm run package -- --publish never` 可生成未签名 macOS 目录包。校验依赖开发依赖 `@electron/asar`。验收还需从安装后的应用启动测试；其他系统安装包的存在不证明编译工具、字体、外部命令和文件操作在该系统可用。

## 维护边界

- 新增 UI 文案同步中文/英文；图标使用 Lucide，保持现有纸面风格。
- 新增回归应覆盖用户可观察的行为，尤其手势结束、异步拒绝与状态切换。
- `.ai-notes/`、`docs/superpowers/` 是本地工作记录，已忽略，不进入源码提交或发布包。
- 本轮未彻底拆解所有历史大文件。`App.tsx`、`tex.cjs` 和共享样式仍需随实际功能逐步分离，避免一次性重写引入流程回归。
