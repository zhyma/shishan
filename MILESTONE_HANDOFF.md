# ShiShan 当前里程碑交接

这份文件写给第一次接触 ShiShan 的 AI Agent。不要假设你能看到创建它时的聊天记录；这里提供完成当前里程碑所需的产品背景、技术边界、工作状态和验收方式。

## 1. 这个项目解决什么问题

AI 可以很快生成大量代码，但人很难逐行阅读并重新建立对程序的理解。ShiShan 让 AI 或开发者在源码附近写入结构化的自然语言叙事，再用真实语法树确认每条说明对应哪个函数、步骤、分支、循环或具体语句。用户可以先从项目的整体流程理解系统，再逐层进入函数流程、实现细节和源码。

ShiShan 不是自动生成调用图的工具，也不执行被分析项目。它把两类信息组合起来：代码语法树提供“实际结构”，版本控制中的自然语言提供“为什么这样做、这一步产生什么结果”。

## 2. 当前里程碑是什么

Phase 0–3D 的 Linux 功能基线已经完成。当前是一个产品质量打磨里程碑：让 AI 生成的叙事真正面向第一次接触项目的人，而不是面向刚写完代码、已经知道所有背景的作者。

这个里程碑有两个直接交付物：

1. `shishan-author` Skill 默认采用“冷读者”模型：叙事必须脱离聊天和源码上下文仍然可理解，使用自然语言说明对象、动作、原因和结果；
2. 本交接文件为下一位 Agent 提供独立、可执行的项目上下文。

功能状态如下：

| 能力 | 当前状态 |
| --- | --- |
| Python、C++、TypeScript/TSX、JavaScript/JSX AST 绑定 | 已完成 |
| `function`、`step`、`branch`、`loop`、`call`、`error`、`async`、`detail` | 已完成 |
| `.shishan/project.json` 项目整体叙事 | 已完成 |
| Web 项目总览、函数流程、实现细节三级下钻 | 已完成 |
| Web 英文/中文界面 | 已完成；作者叙事正文不自动翻译 |
| VS Code 0.3.0 卡片预览、项目大纲和三级下钻 | 已完成并在 Linux 冷启动验证 |
| 面向首次读者的 Skill 写作规则 | 已加入，仍需要真实编码任务的行为评估 |

## 3. 下一位 Agent 的首要任务

下一步不是继续增加协议类型，而是验证新的写作规则是否真的改善理解质量。

1. 选择 5–10 个规模适中的真实编码或重构任务，使用 `shishan-author` 同步代码叙事。
2. 在不看源码、文件名和原始聊天的前提下，只阅读项目卡片、函数节点和实现说明，检查一个新读者是否能回答：
   - 这个项目或流程解决什么问题？
   - 当前函数在整体流程中承担什么角色？
   - 每个节点处理的对象、动作和结果是什么？
   - 分支在做什么选择，循环为什么重复并在何时停止？
   - 实现细节解释了什么不明显的原因、约束或保证？
3. 记录失败模式。优先修正规则中反复出现的缺口，不要为单个措辞例子累积大量机械规定。
4. 同时统计叙事是否随代码同步、`SHISHAN501` 是否正确提示遗漏，以及叙事是否因为补背景而变得重复或过长。
5. 将观察结果写入 `docs/validation.md`，只有出现可重复的问题时才继续修改 Skill。

不要为了让测试看起来更完整而猜测业务意图。如果代码和产品文档没有提供目的，只描述可以确认的实现结果，或向用户询问。

## 4. 接手前的阅读顺序

按以下顺序建立上下文，避免一开始陷入实现细节：

1. [README.md](README.md)：产品定位、快速使用和仓库组成；
2. [docs/PRD.md](docs/PRD.md)：重点阅读产品原则、Phase 3D 和“推荐的下一步行动”；
3. [skills/shishan-author/SKILL.md](skills/shishan-author/SKILL.md)：AI 作者的强制工作规则；
4. [skills/shishan-author/references/protocol.md](skills/shishan-author/references/protocol.md)：注释语法、绑定方式和冷读者写作标准；
5. [docs/architecture.md](docs/architecture.md)：解析、增量更新、Web、VS Code 和安全边界；
6. [docs/validation.md](docs/validation.md)：哪些能力已经由自动化或真实界面验证。

主要实现入口：

- `packages/protocol`：跨语言数据结构与 JSON Schema；
- `packages/core`：Tree-sitter 分析、叙事绑定、项目索引和 Git freshness；
- `apps/cli`：扫描、检查、本地服务、监听和静态导出；
- `apps/web`：项目流程图、三级下钻、源码面板和双语界面；
- `apps/vscode`：卡片预览、项目大纲、惰性详情加载和源码导航；
- `skills/shishan-author`：AI 创建与维护叙事时遵循的规则。

## 5. 当前产品与安全边界

- 当前交付和 CI 只承诺 Linux。
- 当前支持 Python、C++、TypeScript 和 JavaScript，包括 TSX/JSX 方言。
- macOS、Windows 和多 AI 平台 Skill 继续延期，除非用户明确重新调整范围。
- 核心流程不上传源码、不调用模型 API，也不执行被分析项目。
- 项目总览是维护者选择的少量命名流程，不是自动推断的完整调用图。
- 静态导出默认不包含源码；VS Code 和 Web 的源码跳转必须留在当前 workspace。
- 不要在没有真实使用证据时修改 `shishan/v1.2` 或 `shishan/project-v1` 协议。

## 6. 已知但不阻塞当前里程碑的问题

- VS Code 的 Web/check/refresh 标题栏操作和 `vscode://` 返回编辑器仍需要一次完整的人工点击复核；扩展安装、自动激活、真实卡片/大纲渲染和路径安全已验证。
- 浏览器服务与扩展若被手动设置为同一个已占用端口，需要 workspace identity 健康探测后才能安全复用外部服务。
- 当前 TypeScript grammar 对 `export type *` 等现代或复杂语法仍会产生 8 个已知 `SHISHAN001`。
- 大于 5,000 文件的首次扫描、长期 watcher/浏览器内存和人类理解速度还没有形成产品级证据。

这些问题可以成为后续候选，但不要在未与用户对齐时替代当前的“叙事自然语言质量”目标。

## 7. 修改后的最低验收

在仓库根目录运行：

```bash
npm test
npm run typecheck
npm run build
npm run shishan -- check . --strict
python3 "${CODEX_HOME:-$HOME/.codex}/skills/.system/skill-creator/scripts/quick_validate.py" skills/shishan-author
git diff --check
```

如果修改仓库中的 `skills/shishan-author`，还要把相同内容同步到当前 Agent 实际安装的 Skill 目录，并确认两者没有差异。安装路径可能因环境而不同，不要把本机绝对路径写进产品逻辑。

完成汇报应先说明用户现在能获得什么，再列验证证据、仍然存在的边界和从实现过程中发现的优化机会。不要只报告改了哪些文件。

## 8. 当前协作位置

- 工作分支：`codex/shishan-phase-3b`；
- Pull Request：[PR #1](https://github.com/zhyma/shishan/pull/1)；
- Phase 3D 的中型仓库基准：Hono `e2740d5`，详细证据见 `docs/validation.md`。

接手时先运行 `git status` 和 `git log -1 --oneline`，以远端分支最新状态为准，不要假设本文件记录了某个固定提交哈希。
