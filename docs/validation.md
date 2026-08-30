# Phase 0–3A 验证记录

验证日期：2026-08-30
本地环境：Linux x86_64、Node.js 24.18.0、npm 11.16.0

## Phase 0：协议与技术风险

| 验证项 | 证据 | 结果 |
| --- | --- | --- |
| 版本化协议 | `PROTOCOL_VERSION = shishan/v1` | 通过 |
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
| Linux CI 定义 | Ubuntu + Node 24 测试、类型检查、构建与增量不变量 | 已实现，待远端运行 |

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

## 自动化测试结果

```text
Test Files  8 passed (8)
Tests      32 passed (32)
```

完整构建：

```text
TypeScript protocol/core/cli build: passed
Vite production build: 176 modules transformed
Web JS gzip: 136.60 kB
Web CSS gzip: 5.49 kB
Production source map: disabled
```

## 250 文件增量基准

单次本地观测：

| 指标 | 结果 |
| --- | ---: |
| 初始扫描 | 152.78 ms |
| 单文件更新 | 0.78 ms |
| 更新时解析文件 | 1 |
| 复用文件 | 249 |
| 初始 snapshot | 393,274 bytes |
| 单文件 patch | 1,984 bytes |
| patch / snapshot | 0.50% |

这些数字用于发现性能回退，不作为不同机器上的 SLA。CI 的 benchmark job 断言结构不变量，不断言绝对耗时。

## 尚未由本地环境证明的内容

- GitHub-hosted Linux workflow 的远端结果（当前分支尚未推送）；
- 大于 5,000 文件仓库的首次扫描体验；
- C++ 宏、复杂模板与预处理器语义；
- 长时间运行时的 watcher/浏览器内存曲线；
- 人类理解速度和叙事质量等产品指标。

macOS、Windows 与多 AI 平台 Skill 已按产品决策延期，不列为当前未通过项。
