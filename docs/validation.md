# Phase 0–3C 验证记录

验证日期：2026-08-30
本地环境：Linux x86_64、Node.js 24.18.0、npm 11.16.0

## Phase 0：协议与技术风险

| 验证项 | 证据 | 结果 |
| --- | --- | --- |
| 版本化协议 | `PROTOCOL_VERSION = shishan/v1.2` | 通过 |
| JSON Schema | Draft 2020-12 snapshot/patch Schema + Ajv | 通过 |
| 四语言同构 IR | Python、C++、TS、JS fixtures | 通过 |
| JSX/TSX 方言 | 独立 JSX、TSX fixtures | 通过 |
| Golden 稳定性 | `fixtures/golden/polyglot.json` | 通过 |
| `detail` 单/多语句 | 默认 1 条与 `statements=2` | 通过 |
| 普通注释忽略 | protocol unit test | 通过 |
| 资源上限 | 2 MiB 文件不调用 parser | 通过 |

依赖兼容性验证将 Tree-sitter Node 固定为 0.21.1，并选择共同兼容的 Python、C++、JavaScript、TypeScript grammar。`npm ls` 无 invalid peer dependency。

## Phase 1：端到端纵切

| 验证项 | 证据 | 结果 |
| --- | --- | --- |
| CLI scan | 6 files、6/6 functions、100% coverage | 通过 |
| CLI check strict | 0 errors、0 warnings | 通过 |
| JSON export 能力 | snapshot 通过统一 Schema | 通过 |
| 本地服务 | `/api/project`、`/api/source`、静态 UI | 通过 |
| 路径隔离 | `../../etc/passwd` 返回 403 | 通过 |
| Host/Origin | 非 loopback 请求返回 403 | 通过 |
| Web 流程图 | React Flow + Dagre 真实浏览器渲染 | 通过 |
| `detail` 交互 | 徽标默认折叠，展开后定位 L12–13 | 通过 |
| Authoring Skill | `quick_validate.py` | 通过 |

真实浏览器检查内容：

- 项目、文件和函数层级；
- loop、branch、step 边和标签；
- C++ 与 TypeScript 函数切换；
- `detail` 展开；
- 精确源码范围；
- 浏览器 console warning/error 为 0。

## Phase 2：四语言与在线增量

| 验证项 | 证据 | 结果 |
| --- | --- | --- |
| C++ / JS / JSX / TSX | Golden fixtures | 通过 |
| 覆盖率 | file + project accumulator | 通过 |
| 诊断 | 协议、绑定、语法、资源诊断 | 通过 |
| 文件监听 | Chokidar add/change/unlink | 通过 |
| 解析增量 | `oldTree.edit` + `parse(content, oldTree)` | 通过 |
| 传输增量 | SSE `ProjectPatch` 不含全量 files | 通过 |
| UI 增量 | Map 只替换 changed entries | 通过 |
| 真实在线更新 | generation 1 → 2；last update 仅 `order.ts` | 通过 |
| Linux CI | Ubuntu + Node 24 测试、类型检查、构建与增量不变量 | 通过 |

## Phase 3A：叙事可信度与静态分享

| 验证项 | 证据 | 结果 |
| --- | --- | --- |
| AST 实现指纹 | Python/C++/JS/TS/JSX/TSX 参数化测试；忽略 comment 与空白 | 通过 |
| 叙事指纹 | 稳定投影 summary/fields/children/details | 通过 |
| 过期检测 | 代码 token 变化、叙事未变产生 `SHISHAN501` | 通过 |
| 同步恢复 | 有意义地更新叙事后 warning 清除 | 通过 |
| 误报控制 | 空白与普通注释变化不产生 warning | 通过 |
| Git 基线 | `--base` 固定 commit hash，baseline AST 按文件缓存 | 通过 |
| live 增量 | 一次 `order.ts` 变更只上送该文件，显示 `1 stale` | 通过 |
| 诊断跳转 | 点击 `SHISHAN501` 切换函数并定位源码 | 通过 |
| CLI 管道输出 | 非零退出时 stdout/stderr 仍完整可捕获 | 通过 |
| 静态站点 | 无 ShiShan API 的普通 HTTP server 正常加载 | 通过 |
| 默认源码保护 | 默认 0 sources，并显示显式 opt-in 提示 | 通过 |
| 显式源码导出 | `--include-source` 后 6 个源码面板均可用 | 通过 |
| 静态资源边界 | 25 MiB source、64 MiB data 上限；不生成 production source map | 通过 |

真实浏览器的 live freshness 序列：

- 初始 generation 1，`0 stale`；
- 仅修改 `order.ts` 实现后 generation 2，`1 stale`，last update 只有 `order.ts`，11.28 ms；
- 同步修改对应叙事后 generation 3，`0 stale`，last update 仍只有 `order.ts`，6.86 ms；
- 恢复 fixture 后再次回到 `0 stale`；
- live、包含源码的 static、默认不含源码的 static 页面 console warning/error 均为 0。

## Phase 3B：语义节点、集成与批量维护

| 验证项 | 证据 | 结果 |
| --- | --- | --- |
| 调用/错误/异步协议 | `NarrativeKind`、annotation parser、JSON Schema 同步升级到 v1.1 | 通过 |
| 四语言 AST 绑定 | Python、C++、TypeScript、JavaScript advanced fixtures 均形成 call → error → async 层级 | 通过 |
| 错误 kind 拒绝 | 无调用语句上的 `call` 与只在 nested function 内出现的调用均产生 `SHISHAN302` | 通过 |
| Web 语义 | Call、Error boundary、Async wait 独立卡片和 target/failure/resume 字段 | 通过 |
| 大图策略 | 80 节点以上走 ELK；最多 600 节点；5 秒预算与 Dagre 回退单元测试 | 通过 |
| ELK 真实运行 | 97 张卡片的 live 页面报告 `data-layout-engine=elk`，console error/warning 为 0 | 通过 |
| VS Code 构建 | `shishan-vscode` CommonJS 扩展被顶层 typecheck/build 覆盖 | 通过 |
| 源码 URI 隔离 | 绝对路径、目录穿越、workspace 外符号链接均拒绝；live href 使用一基坐标 | 通过 |
| 静态分享隔离 | static 页面仍展示三种语义节点，但不显示 `Open in VS Code` 且默认无源码 | 通过 |
| 批量草案 | 实际 CLI 生成 `status=draft`、`summary=null`，不会猜测业务意图 | 通过 |
| 人工写入闸门 | 默认 dry-run；只有 approved 可写；已有 plan 不覆盖 | 通过 |
| 批量安全 | stale hash 无部分写、AST 预验证、ID/换行/插入位置/路径与符号链接防护 | 通过 |
| Authoring Skill | 新增三种节点规则，仓库版与安装版 `quick_validate.py` 通过且内容一致 | 通过 |
| Linux CI | Ubuntu Node 24 覆盖测试、双 fixture strict check、类型检查、全构建和增量不变量 | 通过 |

Phase 3B 真实浏览器检查：

- advanced live 项目显示 4/4 functions、100% coverage、0 diagnostics；
- C++ 函数图依次展示 Function、Call、Error boundary、Async wait，并显示 `client.load`、失败结果和恢复语义；
- live 源码面板给出 `vscode://zhyma.shishan-vscode/open?...`，static 模式不生成该入口；
- 97 节点 synthetic function 实际渲染 97 张卡片并完成 ELK Worker 布局；
- advanced live、advanced static、97 节点 live 页面控制台均为 0 条日志。

## Phase 3C：项目整体叙事与可安装 VS Code 入口

| 验证项 | 证据 | 结果 |
| --- | --- | --- |
| 项目清单 Schema | `shishan-project.schema.json` + Ajv；字段、字符串和图规模有界 | 通过 |
| 清单安全读取 | 256 KiB 上限；拒绝 symlink、绝对路径和 parent traversal | 通过 |
| 图拓扑 | entry flow、flow/node/edge 唯一性和端点存在性测试 | 通过 |
| AST 源码绑定 | `{path,symbol}` 绑定 `SourceRange` 和 `narrativeId`；缺失/歧义符号有诊断 | 通过 |
| IR 兼容 | Snapshot/Patch 的项目叙事字段通过 Draft 2020-12 Schema | 通过 |
| manifest-only 增量 | watcher 观察 `.shishan/project.json`，只发布 project patch，不 upsert 源码 | 通过 |
| Web 默认 Overview | 有 manifest 时首屏选择 entry flow，不再默认显示文件列表 | 通过 |
| 项目图交互 | Request lifecycle 与 Runtime architecture 可切换，源码和 Function story 下钻通过 | 通过 |
| 响应式项目图 | 宽屏 LR 总览；760 px 以下切为 TB、90% 缩放并把入口置于首屏；顶部保留层级与流程切换 | 通过 |
| 中型仓库可读性 | Functions 只列 6 个已有叙事文件；info 归入 coverage，诊断面板保留 8 个 warning/error | 通过 |
| VSIX 打包/安装 | `shishan-vscode-0.2.0.vsix` 12 个文件，`code --install-extension --force` 成功 | 通过 |
| Activity Bar | 安装 manifest 包含 `viewsContainers.activitybar` 和 `shishan.projectNarrative` TreeView | 通过 |
| VS Code 启动 | VS Code 1.135.0 独立 profile 的 Hono workspace 因 `workspaceContains:.shishan/project.json` 自动激活 | 通过 |
| Authoring Skill | 项目 flow 维护规则加入仓库 Skill；`quick_validate.py` | 通过 |
| 自举验证 | 仓库根清单描述代码叙事管道与 Overview 交付链；0 project diagnostics | 通过 |

真实浏览器检查：

- 首屏显示 Hono `Request lifecycle` 的 11 张项目卡片和 14 条语义边；
- 切换 `Runtime architecture` 后显示 6 个模块/外部系统/输出节点；
- 点击 `fetch` 在 Overview 右侧打开 `src/hono-base.ts` 精确范围；
- 点击 `Function story` 切到 `fetch-entry` 的 Function → Call 局部图；
- Functions 页从 357 个文件清单收敛为 6 个已有叙事文件；
- 顶部 diagnostics 从 1,787 条（绝大多数为 info）收敛为 8 条真实 grammar warning。
- 618 px Codex 侧栏中项目图从入口开始纵向展示，卡片文字可读且不再被全图 `fitView` 过度缩小；Overview → Functions → Overview 往返和两条 flow 的下拉切换均通过。

## 真实中型仓库：Hono

测试对象：[Hono `e2740d5`](https://github.com/honojs/hono/tree/e2740d5a1bd0b4254e517e3af8b60789284bc7bd)。测试使用 `/tmp` 中的 shallow clone，没有修改或推送 Hono 上游。

| 验证项 | 证据 | 结果 |
| --- | --- | --- |
| 仓库规模 | 456 个文件；357 个受支持源码文件进入 ShiShan 索引 | 通过 |
| 真实注释 | 6 个源码文件中的 12 个函数，覆盖 branch、loop、call、error、async、detail | 通过 |
| 局部严格检查 | `src/client`、`src/middleware/etag`、`src/middleware/language` 均为 0 errors、0 warnings | 通过 |
| 大文件解析 | 修复前 16 个大于 32 KiB 的文件产生 `SHISHAN003 Invalid argument`；修复后 357/357 文件均进入 parser | 通过 |
| 函数恢复 | 修复前 1,281 个函数；修复后 1,791 个函数 | 通过 |
| 首次扫描 | 当前约 8.2 s；既有峰值 RSS 261,184 KiB（约 255 MiB） | 通过，继续观察 |
| live 更新 | 修改一处叙事后 generation 1 → 2，只解析 `src/middleware/etag/digest.ts`，10.10 ms | 通过 |
| 中型流程图 | 15 个真实节点使用 Dagre；节点计数、默认缩放、源码行号和 detail 展开正确 | 通过 |
| 项目整体流程 | request lifecycle 11 节点 + runtime architecture 6 节点；0 project diagnostics | 通过 |
| static 默认隔离 | 导出约 3.2 MiB；0 source；0 个 `Open in VS Code`；无 API 依赖 | 通过 |
| 浏览器日志 | live 与 static 的 console warning/error 均为 0 | 通过 |
| VS Code 安装宿主 | VSIX 安装为 `zhyma.shishan-vscode@0.2.0`；VS Code 1.135.0 日志确认启动激活 | 通过 |

试用中发现并修复：

- Node Tree-sitter 0.21 的默认 32 KiB string callback buffer 会让长源码在多 chunk 路径抛出 `Invalid argument`；parser 现在按源码长度设置 buffer，并覆盖首次与增量解析回归测试；
- 函数列表原先只显示顶层 children 数量，现改为真实可见节点总数；
- 15 节点图原先 `fitView` 过度缩小，现为 20 节点以内设置可读的初始最小缩放；
- 项目 Overview 原先在 618 px 嵌入窗口把 11 节点 LR 图缩到约 24%，现窄屏改用 TB 并从入口以 90% 缩放阅读；
- 首次加载 357 条完整路径会占满底部状态区，现压缩为 `initial snapshot · 357 files`，多文件增量也会摘要显示。

完整 Hono 扫描仍有 8 个 `SHISHAN001`。检查对应源码后，它们是当前 `tree-sitter-typescript` 对有效现代语法或复杂类型签名的 grammar error node，例如 `export type *`，不是 Hono 语法错误。该边界保留为显式诊断；没有通过全局忽略来制造“全绿”结果。

VS Code 的安装、Activity Bar manifest、启动激活、TreeView parser、启动参数和 URI 安全逻辑已证明。由于已按用户要求卸载 Orca 桌面控制组件，本轮没有自动点击 VS Code 标题栏命令，也没有自动触发 `vscode://`；这两项仍保留为人工交互复核。

## 自动化测试结果

本地收尾结果如下；远程最新提交的 `Linux · Node 24` 与 `Incremental invariants` 状态以 [PR #1](https://github.com/zhyma/shishan/pull/1) 和 [CI workflow](https://github.com/zhyma/shishan/actions/workflows/ci.yml) 为准。

```text
Test Files  17 passed (17)
Tests      66 passed (66)
```

完整构建：

```text
TypeScript protocol/core/cli/vscode build: passed
Vite production build: 186 modules transformed
Web main JS gzip: 139.91 kB
ELK lazy layout JS gzip: 2.20 kB
ELK worker asset: 1,595.33 kB
Web CSS gzip: 6.66 kB
Production source map: disabled
```

## 250 文件增量基准

单次本地观测：

| 指标 | 结果 |
| --- | ---: |
| 初始扫描 | 172.74 ms |
| 单文件更新 | 0.80 ms |
| 更新时解析文件 | 1 |
| 复用文件 | 249 |
| 初始 snapshot | 393,277 bytes |
| 单文件 patch | 1,986 bytes |
| patch / snapshot | 0.50% |

这些数字用于发现性能回退，不作为不同机器上的 SLA。CI 的 benchmark job 断言结构不变量，不断言绝对耗时。

## 尚未由本地环境证明的内容

- VS Code 安装窗口中的 Web/check/refresh 人工点击和 `vscode://` 实际跳转；本地已证明 VSIX 安装、Activity Bar contribution、启动激活、构建、进程参数和 URI 安全逻辑；
- 大于 5,000 文件仓库的首次扫描体验；
- C++ 宏、复杂模板与预处理器语义；
- TypeScript grammar 对 `export type *` 等有效新语法和复杂类型签名的覆盖；
- 长时间运行时的 watcher/浏览器内存曲线；
- 人类理解速度和叙事质量等产品指标。

macOS、Windows 与多 AI 平台 Skill 已按产品决策延期，不列为当前未通过项。
