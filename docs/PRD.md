# ShiShan PRD：AI 代码叙事协议与可视化平台

| 项目 | 内容 |
| --- | --- |
| 文档状态 | v0.3，Phase 0–2 与 Phase 3A 维护性基线已实现，待真实仓库试用 |
| 日期 | 2026-08-30 |
| 产品阶段 | Linux 优先的四语言本地 MVP 与叙事可信度验证 |
| 第一阶段语言 | Python、C++、TypeScript、JavaScript |
| 推荐形态 | 本地优先的 CLI + Web 应用，编辑器集成为可选适配层 |

## 1. 执行摘要

AI 可以在很短时间内生成大量可运行代码，但人类理解、审查和接管代码的速度并没有同步提升。现有的源码视图、符号大纲和传统控制流图主要描述“代码长什么样”，无法直接回答：

- 这个模块为什么存在？
- 一个函数整体完成什么任务？
- 函数内部按什么叙事顺序推进？
- 一个循环在反复处理什么、何时结束？
- 一个分支为什么出现，各路径分别意味着什么？
- 某一条或几条看似普通的语句为什么必须这样写？
- 哪些步骤会产生副作用、调用外部系统或失败？

ShiShan 的目标是建立一层随代码共同维护的“程序叙事层”：

1. AI 编程代理安装 ShiShan Skill；
2. AI 在创建或修改代码时，按照版本化协议写入结构化自然语言解释；
3. 本地解析器用语法树确认真实的函数、分支、循环和源码范围；
4. ShiShan 将语法结构与自然语言语义合并成语言无关的叙事图；
5. 用户通过独立网页逐层浏览“项目 → 文件 → 函数 → 内部流程”，并随时跳回源码。

一句话定位：

> ShiShan 是连接 AI 代码生产速度与人类代码理解速度的叙事协议和可视化工具。

## 2. 背景与问题

### 2.1 用户问题

AI 生成代码后，人类通常面对以下困难：

- 代码规模增长太快，无法逐行阅读；
- 函数名和普通注释不足以还原整体设计意图；
- 实现细节掩盖了函数内部的业务步骤；
- 接手者不知道循环、分支和调用链在业务上的意义；
- AI 会继续修改代码，已有说明容易与实现漂移；
- 不同 AI 工具生成的解释没有统一格式，难以被工具消费。

### 2.2 现有仓库的作用

当前仓库是一个 VS Code Python 折叠插件原型，证明了“隐藏实现、保留叙事线索”具有可行性，但它不是未来架构的约束。

可选择性复用的内容：

- VS Code 命令注册、状态栏和源码折叠经验；
- “逐步展开实现”的交互理念；
- Python 示例和折叠测试思路。

不建议继续作为核心的内容：

- 用正则表达式判断 Python 语义；
- 将 VS Code `FoldingRangeProvider` 作为主要展示能力；
- 只识别普通注释、`def` 和 `class`；
- 将产品限定为单语言、单编辑器插件。

## 3. 产品愿景与原则

### 3.1 产品愿景

用户不必先阅读全部实现，就能回答：

- 项目由哪些功能区域组成；
- 每个函数的目标、输入、输出和副作用是什么；
- 函数内部有哪些主要步骤；
- 循环、分支、错误路径和异步过程如何组织；
- 任意叙事节点对应哪一段真实源码。

### 3.2 核心原则

#### 原则一：结构来自代码，语义来自叙事

- AST/解析器负责确认函数、循环、分支、调用位置和嵌套关系；
- AI/人类负责解释这些结构“为什么存在”和“业务上做什么”；
- 第一版不允许 AI 手工编造与源码无关的完整流程拓扑。

这可以概括为：

> AST 是事实层，叙事注释是解释层。

#### 原则二：叙事与源码共同版本化

- 叙事必须进入 Git；
- 修改代码时应在同一变更中更新相关叙事；
- 不把聊天记录、模型记忆或云端数据库作为唯一信息源。

#### 原则三：Web 优先，编辑器可选

- 核心体验通过本地网页提供；
- 用户不必安装或使用 VS Code；
- VS Code、JetBrains 等集成未来只作为打开网页、跳转源码和编辑注释的薄适配层。

#### 原则四：本地优先与最小权限

- 默认不上传源码；
- 默认不执行被分析项目中的任何代码；
- 本地服务只读取指定仓库；
- 核心浏览和校验不依赖在线 AI API。

#### 原则五：渐进式披露

- 首屏先展示项目和函数级叙事；
- 用户需要时再展开循环、分支、实现细节、异常和源码；
- 避免把传统控制流图的全部细节直接暴露给用户。

#### 原则六：协议独立于 AI 厂商

- ShiShan 协议是公共、版本化、工具无关的规范；
- Skill 是某一种 AI 平台的“协议生产者适配器”；
- 第一版可先提供一种 Skill，但不能把协议绑定到某家模型或 API。

## 4. 产品目标与非目标

### 4.1 MVP 目标

1. 定义 `shishan/v1.1` 跨语言叙事协议；
2. 支持 Python、C++、TypeScript 和 JavaScript；
3. MVP 先支持函数、步骤、分支和循环，Phase 3B 扩展调用、错误和异步节点，并保留精确绑定局部源码的 `detail` 实现细节注解；
4. 提供 AI Authoring Skill，指导 AI 生成和维护合法叙事；
5. 提供本地 CLI，对仓库进行扫描、校验、导出和启动网页；
6. 提供独立 Web UI，支持层级浏览、流程图和源码定位；
7. 对格式错误、重复 ID、孤立注释和缺失解释提供诊断；
8. 在文件变化后增量刷新叙事图；
9. 用 Git 基线识别“实现变化但叙事未同步”的疑似过期函数；
10. 导出不依赖 ShiShan API 的只读静态站点。

### 4.2 后续目标

- 调用、返回、异常、并发和异步的高级叙事节点；
- 跨文件和跨模块调用关系；
- VS Code 和其他编辑器集成；
- 对既有代码进行批量 AI 注释；
- 团队评审、评论和叙事质量评分。

### 4.3 非目标

MVP 不负责：

- 执行、调试或动态追踪用户程序；
- 证明自然语言解释一定正确；
- 替代单元测试、类型系统或代码审查；
- 构建完整、精确的跨语言调用图；
- 自动理解完全没有叙事注释的全部业务语义；
- 提供云端代码托管或强制用户注册账号；
- 取代源代码本身。

## 5. 目标用户

### 5.1 AI 辅助开发者

需要快速理解 AI 刚刚生成或修改的大量代码，并决定是否接受。

### 5.2 代码审查者

需要先理解设计叙事，再深入高风险实现。

### 5.3 新加入项目的开发者

希望从功能和流程进入代码，而不是从目录和文件名开始猜测。

### 5.4 技术负责人

希望确认实现结构与预期设计一致，并发现缺少解释或可能过期的区域。

## 6. 关键概念

| 概念 | 定义 |
| --- | --- |
| 叙事注释 | 写在源码附近、符合 ShiShan 协议的结构化自然语言 |
| 锚点 | 叙事注释所绑定的真实 AST 节点和源码范围 |
| 叙事节点 | `function`、`step`、`branch`、`loop`、`call`、`error`、`async` 等语言无关节点 |
| 实现细节注解 | `detail`；附着在叙事节点上的精确源码说明，默认不进入主流程图 |
| 叙事图 | 由节点、顺序、嵌套和控制关系组成的可视化模型 |
| IR | 解析器输出的语言无关中间表示 |
| 适配器 | 将某种语言的 AST 和注释转换为统一 IR 的实现 |
| Skill | 约束 AI 如何创建、更新和校验叙事注释的操作规范 |
| 叙事覆盖率 | 应被解释的函数/控制结构中，已经有合法叙事的比例 |
| 疑似过期 | 代码发生语义变化，但相关叙事没有同步变化的状态 |

## 7. 支持语言

MVP 必须覆盖：

- Python；
- C++；
- TypeScript，包括 TSX；
- JavaScript，包括 JSX。

实现上可视为三组适配器：

1. Python；
2. C++；
3. JavaScript/TypeScript 共享基础实现，并分别处理语法差异。

第一版聚焦常规函数、方法、`if`、`switch/match`、`for` 和 `while`。C++ 宏展开、模板实例化和预处理后的真实控制流不属于 MVP。

## 8. 端到端用户流程

### 8.1 新代码流程

1. 用户在 AI 编程工具中安装或启用 ShiShan Authoring Skill；
2. 用户要求 AI 实现功能；
3. AI 编写源码，并在函数及重要控制结构附近生成叙事注释；
4. AI 运行 `shishan check`；
5. 用户运行 `shishan serve`；
6. 浏览器打开本地项目叙事页面；
7. 用户从函数摘要进入内部流程；
8. 用户点击循环或分支节点查看自然语言说明和对应源码；
9. 用户基于理解结果要求 AI 调整代码；
10. AI 在同一次修改中更新代码与叙事。

### 8.2 既有代码流程

MVP 支持人或 AI 逐步补充叙事，但不要求一次性覆盖整个仓库：

1. `shishan scan` 建立符号清单；
2. Web 页面显示尚未叙事化的函数；
3. 用户选择高价值文件或函数；
4. AI Skill 为选择范围补充注释；
5. `shishan check` 校验并更新覆盖率。

## 9. 叙事协议 v1

### 9.1 设计选择

MVP 推荐“源码内嵌为规范来源，独立 IR 为生成产物”：

- 完整自然语言解释写在源码注释中；
- `shishan init` 创建项目级配置，由配置声明 `protocolVersion: "shishan/v1.1"`；
- `.shishan/cache` 保存可丢弃的本地解析缓存；
- `shishan export` 可生成 JSON IR，但该文件不是人工编辑的规范来源；
- 暂不把详细叙事拆到 sidecar 文件，避免源码与解释失去位置关联。

如果以后发现注释体积过大，可在 v2 引入“源码锚点 + sidecar 详情”的混合模式。

### 9.2 通用语法

协议采用逐行指令，避免在注释中嵌入复杂 JSON/YAML。

v1 的规范写法只使用连续行注释：Python 使用 `#`，C++、TypeScript 和 JavaScript 使用 `//`。普通注释、文档字符串和块注释可以继续存在，但不会因为内容相似而自动成为 ShiShan 叙事。

Python 示例：

```python
# @shishan function load-config
# @summary 读取配置并生成应用启动所需的最终配置
# @why 集中处理默认值、环境覆盖和输入校验
# @input path 配置文件路径
# @output config 已校验的配置对象
# @side-effect 读取本地文件与环境变量
def load_config(path):
    # @shishan step read-file
    # @summary 规范化路径后读取并解析本地配置

    # @shishan detail normalize-path
    # @summary 这两条语句分别展开用户目录并生成绝对路径，避免缓存键和错误信息使用不同路径形式
    # @covers statements=2
    expanded_path = expand_user_path(path)
    canonical_path = resolve_absolute_path(expanded_path)

    raw = read_file(canonical_path)

    # @shishan loop merge-overrides
    # @summary 逐项合并可用的环境变量覆盖
    # @iterates 已声明的可覆盖配置项
    # @continue 当前配置项仍有对应环境变量
    # @exit 所有候选配置项均已检查
    for key in overridable_keys:
        apply_override(raw, key)

    # @shishan branch validate-result
    # @summary 区分合法配置与不可启动的配置
    if not is_valid(raw):
        raise InvalidConfig()

    return raw
```

C++、TypeScript 和 JavaScript 使用同一套字段，仅改变注释符号：

```typescript
// @shishan loop retry-request
// @summary 在瞬时错误下重试请求
// @iterates 尚未用完的重试次数
// @continue 错误可重试且次数未耗尽
// @exit 请求成功、错误不可重试或次数耗尽
for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
  // ...
}
```

### 9.3 锚定规则

1. `@shishan` 头部声明节点类型和局部 ID；
2. 紧随其后的 `@field` 行属于同一个叙事块；
3. 叙事块绑定到同一语法作用域内紧随其后的兼容 AST 节点；
4. `function` 必须绑定函数、方法或等价声明；
5. `loop` 必须绑定循环 AST 节点；
6. `branch` 必须绑定条件或模式匹配 AST 节点；
7. `step` 绑定其后的第一个同层语句；`call`、`error`、`async` 还必须分别由真实调用、错误边界和异步语法验证；嵌入其中的 `detail` 不会制造独立主流程；
8. `detail` 默认绑定紧随其后的一个同层 AST 语句；`@covers statements=N` 可以绑定接下来的 N 个连续同层 AST 语句；
9. `detail` 附着到包含其语句范围的最小主流程节点，不生成主流程边；
10. 协议不持久化物理行号；解析器每次根据 AST 重新计算 `detail` 的实际源码范围；
11. ID 在所属函数内唯一；函数 ID 在所属文件内唯一；
12. 完整 ID 由项目相对路径、符号和局部 ID 组合，不依赖行号；
13. 不能可靠绑定或 `@covers` 超出当前作用域时生成诊断，不做静默猜测。

### 9.4 节点类型

| 类型 | MVP | 作用 | 主要字段 |
| --- | --- | --- | --- |
| `function` | 是 | 描述函数整体契约和目标 | `summary`、`why`、`input`、`output`、`side-effect` |
| `step` | 是 | 描述一个有意义的内部步骤 | `summary`、`why` |
| `branch` | 是 | 描述判断目的和路径意义 | `summary`、`case` |
| `loop` | 是 | 描述循环目标和生命周期 | `summary`、`iterates`、`continue`、`exit` |
| `detail` | 是，非主流程节点 | 解释一个或多个连续 AST 语句为何这样实现 | `summary`、`why`、`covers` |
| `call` | 预留 | 描述关键内部/外部调用 | `summary`、`target` |
| `return` | 预留 | 解释返回路径 | `summary` |
| `error` | 预留 | 解释失败与恢复路径 | `summary`、`recovery` |
| `parallel` | 预留 | 解释并发、异步和汇合关系 | `summary`、`join` |

### 9.5 内容质量规则

叙事应该：

- 解释目的和业务意义，而不是重复语法；
- 对函数保持一到三句摘要；
- 只为有意义的逻辑段创建 `step`，不逐行注释；
- 只在正确性、安全性、性能、兼容性或非显然实现选择需要解释时创建 `detail`；
- 对循环说明迭代对象、继续条件和退出条件；
- 对分支说明“为什么分”，而不只是复述布尔表达式；
- 明确关键副作用、外部调用和不可恢复失败；
- 使用项目团队选择的自然语言，不强制英文或中文。

不推荐：

```python
# @summary 遍历 items
for item in items:
    ...
```

推荐：

```python
# @summary 逐个提交尚未同步的本地变更
# @iterates 当前批次中待同步的变更
# @exit 全部提交完成或出现不可恢复的权限错误
for item in pending_changes:
    ...
```

### 9.6 细粒度实现说明

`detail` 用于回答“这一条或这几条语句为什么这样写”，但它不是第五种主流程节点。主流程图默认只展示函数、步骤、分支和循环；`detail` 以数量徽标、可展开说明和源码高亮的方式附着在最近的主流程节点上。

默认绑定下一条 AST 语句：

```typescript
// @shishan detail cache-key
// @summary 同时包含用户和 schema 版本，防止不同数据格式错误复用同一缓存
const cacheKey = userId + ":" + schemaVersion;
```

绑定连续的两个 AST 语句：

```python
# @shishan detail clamp-and-round
# @summary 先限制两个坐标的合法范围再取整，避免绘制越界和亚像素抖动
# @covers statements=2
x = max(0, min(width - 1, round(x)))
y = max(0, min(height - 1, round(y)))
```

这里的 `statements=2` 表示两个语法语句，而不是两个物理行。格式化、换行或参数列表展开不会改变绑定；如果语句被删除或覆盖范围跨出当前作用域，`shishan check` 必须报错。

普通、短小且不需要进入可视化索引的说明仍然使用普通代码注释。`detail` 只用于需要在 Web 中检索、展开、定位或维护的非显然实现理由。

## 10. 语言无关叙事 IR

解析器输出 JSON 兼容 IR。JSON Schema Draft 2020-12 作为规范描述格式。

核心对象：

```typescript
interface NarrativeProject {
  protocolVersion: "shishan/v1.1";
  root: string;
  files: NarrativeFile[];
  diagnostics: Diagnostic[];
}

interface NarrativeNode {
  id: string;
  kind: "function" | "step" | "branch" | "loop" | "call" | "error" | "async";
  summary: string;
  fields: Record<string, string | string[]>;
  source: SourceRange;
  children: NarrativeNode[];
  edges: NarrativeEdge[];
  details: NarrativeDetail[];
}

interface NarrativeDetail {
  id: string;
  summary: string;
  fields: Record<string, string | string[]>;
  source: SourceRange;
  coveredStatements: number;
}

interface SourceRange {
  path: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}
```

### 10.1 拓扑生成

- 普通步骤的顺序由 AST 中的源代码顺序生成；
- 分支边由 `if/else`、`switch`、`match` 等真实结构生成；
- 循环由“进入、重复、退出”三类关系生成；
- 嵌套循环和分支成为可折叠子图；
- AI 只提供节点语义和可选边标签，不手工声明基础控制流；
- `detail` 作为最近主流程节点的附属数据保存，不生成顺序、分支或循环边；
- 无主流程叙事的语句可合并成“未叙事实现”占位节点，默认折叠。

### 10.2 调用关系

MVP 只做保守处理：

- 识别语法上明确的调用表达式；
- 对同文件、名称唯一的函数尝试建立弱链接；
- 无法可靠解析的调用不强行连边；
- C++ 重载、动态分派、JS 动态调用和完整类型解析留到后续。

## 11. AI Authoring Skill

### 11.1 Skill 的职责

Skill 必须指导 AI：

1. 在新增函数时创建 `function` 叙事；
2. 为有业务意义的步骤、分支和循环添加叙事；
3. 对影响正确性、安全性、性能、兼容性或包含非显然选择的一到多条语句使用 `detail`；
4. 修改 `detail` 覆盖范围内的语句时，同步检查其说明和 `@covers`；
5. 修改实现时同步检查相关叙事；
6. 保留稳定 ID，除非语义节点被删除；
7. 不为显而易见的单行代码制造噪声；
8. 不声称源码中不存在的行为；
9. 完成修改后运行 `shishan check`；
10. 在无法确定意图时向用户询问或明确标记未知，而不是编造。

### 11.2 Skill 的形态

- 协议规范独立存放在仓库中；
- 第一版提供一个可安装的 Authoring Skill；
- 不同 AI 平台可有不同打包方式，但引用同一协议和示例；
- Skill 产生的内容必须能被 CLI 独立验证；
- Web 浏览器不需要调用任何模型。

### 11.3 Skill 验收

用四种语言的固定任务集测试：

- 新增函数；
- 修改已有循环；
- 为两条连续语句补充实现理由；
- 把条件分支重构为早返回；
- 删除步骤；
- 重命名函数；
- 只做格式化、不改变语义。

目标是 AI 输出能够通过协议解析，并且叙事拓扑与 AST 一致。

## 12. 功能需求

### 12.1 协议与解析

| 编号 | 需求 | 优先级 |
| --- | --- | --- |
| FR-001 | 识别 `shishan/v1.1` 注释块 | P0 |
| FR-002 | 将注释绑定到真实 AST 节点 | P0 |
| FR-003 | 支持四种目标语言 | P0 |
| FR-004 | 输出统一 JSON IR | P0 |
| FR-005 | 支持函数、步骤、分支、循环、调用、错误和异步主流程节点 | P0 |
| FR-006 | 支持 `detail` 默认单语句绑定和 `@covers statements=N` 连续语句绑定 | P0 |
| FR-007 | 对孤立、错误类型、重复 ID 和越界 `@covers` 生成诊断 | P0 |
| FR-008 | 支持按文件增量重新解析 | P1 |
| FR-009 | 支持协议向后兼容和版本迁移提示 | P1 |

### 12.2 CLI

| 命令 | 行为 |
| --- | --- |
| `shishan init` | 创建最小配置和忽略规则 |
| `shishan scan` | 扫描仓库并输出覆盖率与诊断摘要 |
| `shishan check` | 严格校验协议，适合本地和 CI |
| `shishan serve` | 启动只绑定本机的 Web 服务并监听变化 |
| `shishan export` | 导出可移植 JSON IR 或静态站点 |

建议支持：

- `--root`：指定项目根目录；
- `--include` / `--exclude`：控制扫描范围；
- `--format text|json`：供人或 CI 消费；
- `--fail-on warning|error`：控制 CI 退出码；
- `--no-open`：启动服务但不自动打开浏览器。

### 12.3 Web 应用

P0 页面：

1. 项目总览；
2. 文件/符号树；
3. 函数叙事详情；
4. 叙事流程图；
5. 只读源码面板；
6. 诊断与覆盖率页面。

P0 交互：

- 搜索文件、函数和叙事文本；
- 展开/折叠函数、循环和分支；
- 在主流程节点上查看 `detail` 数量，并按需展开实现说明；
- 从节点定位到源码范围；
- 从 `detail` 精确高亮其覆盖的一个或多个 AST 语句；
- 从源码范围高亮对应叙事节点；
- 切换“叙事视图”和“源码视图”；
- 在文件变动后自动刷新；
- 对缺失或错误叙事显示明确状态。

### 12.4 可视化语义

| 节点 | 建议视觉 |
| --- | --- |
| Function | 带契约摘要的容器 |
| Step | 普通操作节点 |
| Branch | 菱形/分叉节点，边上显示路径含义 |
| Loop | 可展开的循环容器，显示迭代对象和退出条件 |
| Detail | 附着在主流程节点上的数量徽标和可展开源码旁注，不占用主流程边 |
| Unnarrated implementation | 默认折叠的低强调占位节点 |
| Diagnostic | 警告或错误徽标 |

大型图默认按函数切片，不在同一画布渲染整个仓库。

## 13. 非功能需求

### 13.1 性能目标

以下是待基准测试验证的建议目标：

- 1,000 个目标源码文件的首次索引在普通开发机上不超过 10 秒；
- 单文件保存后的叙事更新 P95 不超过 750 毫秒；
- 300 个可见节点以内保持平移、缩放和展开操作流畅；
- 超大文件或图不会阻塞整个服务，能够取消或降级；
- 缓存失效后始终可以从源码完整重建。

### 13.2 可靠性

- 语法不完整时尽可能输出部分结果；
- 单个文件解析失败不影响其他文件；
- 所有诊断包含文件、行列和修复建议；
- IR 必须通过版本化 JSON Schema 校验。

### 13.3 兼容性

- 运行时建议采用当前受支持的 Node.js LTS；截至本文日期推荐 Node.js 24；
- 当前正式验证目标为主流 Linux；macOS 与 Windows 暂不纳入里程碑；
- 支持当前主流现代浏览器；
- 项目配置使用相对路径，避免绑定单台机器。

### 13.4 可访问性

- 所有图节点可以键盘聚焦；
- 颜色不是唯一的状态表达方式；
- 节点、边和诊断提供可读文本；
- 提供不依赖画布的层级大纲视图。

### 13.5 隐私与安全

- `serve` 默认只绑定 `127.0.0.1`；
- 不执行被扫描仓库的脚本、构建命令或插件；
- API 只能读取显式指定的项目根目录；
- 默认不跟随指向项目外部的符号链接；
- 对注释文本进行 HTML 转义并启用严格 CSP，防止源码注释触发 XSS；
- 限制单文件大小、总节点数和请求路径；
- 验证 Host/Origin，降低 DNS rebinding 风险；
- 不默认收集遥测；
- 核心功能不需要 API Key。
- 静态导出默认不包含源码；只有显式指定 `--include-source` 才打包已索引源码，并设置 25 MiB 源码上限与 64 MiB 最终 payload 上限。

## 14. 实现路径比较

### 路径 A：继续扩展现有 VS Code 插件

优点：

- 能最快复用当前代码；
- 源码跳转和编辑器上下文天然存在；
- 初期打包对象单一。

缺点：

- 产品继续绑定 VS Code；
- Web 图形能力受 Webview 生命周期和扩展安全模型限制；
- CLI、CI 和其他编辑器难以共享核心；
- 容易让现有折叠逻辑继续主导架构。

结论：不推荐作为核心路线，可作为后续适配器。

### 路径 B：生成静态叙事站点

流程：

```text
源码 → CLI 扫描 → JSON IR → 静态 HTML/CSS/JS
```

优点：

- 架构简单；
- 易于导出、归档和分享；
- 不需要持续运行本地服务。

缺点：

- 源码变化后需要重新生成；
- 本地源码跳转和增量刷新较弱；
- 静态分享容易带来源码泄露风险。

结论：适合作为导出能力和第一条技术竖切，不应是唯一运行模式。

### 路径 C：本地 CLI + Web 应用

流程：

```mermaid
flowchart LR
    A["本地源码"] --> B["Tree-sitter 语言适配器"]
    B --> C["ShiShan IR 与校验器"]
    C --> D["本地 HTTP/SSE 服务"]
    D --> E["浏览器 Web UI"]
    F["AI Authoring Skill"] --> A
    G["可选编辑器适配器"] --> D
```

优点：

- 不绑定编辑器；
- 源码保持本地；
- 支持实时更新、CLI、CI 和静态导出；
- 核心协议、解析器和 UI 边界清晰；
- 后续可以接入多个编辑器。

缺点：

- 初期组件更多；
- 需要处理本地服务安全、端口和跨平台安装；
- 解析器原生依赖的打包需要验证。

结论：推荐路线。第一阶段先做静态 JSON 竖切，再加入实时本地服务。

## 15. 推荐技术架构

### 15.1 技术基线

- 主实现语言：TypeScript；
- 运行时：Node.js 24 LTS；
- 仓库形态：npm workspaces 或等价的轻量 monorepo；
- 解析位置：本地 Node 进程；
- UI：React + Vite；
- 通信：HTTP 获取初始 IR，SSE 推送只读更新；
- 数据格式：JSON + JSON Schema；
- 缓存：项目内 `.shishan/cache`，默认加入 `.gitignore`。

### 15.2 建议目录

```text
apps/
  cli/
  web/
packages/
  protocol/
  ir/
  parser-core/
  parser-python/
  parser-cpp/
  parser-typescript/
  validator/
  local-server/
skills/
  shishan-author/
fixtures/
  python/
  cpp/
  typescript/
  javascript/
docs/
  PRD.md
  protocol-v1.md
```

### 15.3 解析流水线

1. 文件发现器读取配置并尊重忽略规则；
2. 语言路由器根据扩展名选择适配器；
3. Tree-sitter 构建具体语法树；
4. 适配器使用查询提取函数、控制结构、注释和源码范围；
5. 注释解析器读取 `@shishan` 指令；
6. 锚定器将叙事块绑定到兼容 AST 节点；
7. 图构建器根据 AST 生成顺序、分支、循环和嵌套关系；
8. 校验器验证 IR 和诊断；
9. 本地服务把 IR 提供给 Web UI；
10. 文件监听器只重新处理受影响文件，并推送差量更新。

### 15.4 解析运行时选择

Tree-sitter 官方同时提供 Node.js 和 WebAssembly 路径：

- Node.js 原生绑定速度更好，适合本地索引；
- WebAssembly 更容易跨平台分发，但官方文档明确提示在 Node 中会明显更慢；
- 原生绑定和语言 grammar 的安装可能涉及平台二进制或编译工具链。

建议在 Phase 0 做同一套适配器接口下的双实现基准：

1. 首选 Node.js 原生绑定；
2. 保留 WebAssembly fallback 的架构可能性；
3. 用四种语言的真实中型仓库测试安装成功率、首次扫描和增量扫描；
4. 基准完成前，不把解析运行时暴露为协议的一部分。

## 16. 第三方开源依赖

### 16.1 是否需要第三方库

需要。项目的核心创新是“叙事协议、AI 维护规则、语言无关 IR 和理解体验”，不应该自行重写编程语言解析器、图形画布或图布局算法。

建议自己实现：

- ShiShan 协议；
- 注释块解析与 AST 锚定；
- 叙事 IR；
- 叙事质量和过期规则；
- 多语言适配器查询；
- Web 信息架构和交互；
- AI Authoring Skill。

建议依赖成熟开源项目：

- 语法树解析；
- Web UI 基础；
- 图形交互与自动布局；
- JSON Schema 校验；
- 文件监听；
- 测试和构建。

### 16.2 推荐依赖清单

| 领域 | 推荐项目 | 用途 | 许可证 | 采用建议 |
| --- | --- | --- | --- | --- |
| 多语言解析 | [Tree-sitter](https://tree-sitter.github.io/tree-sitter/) / [Node binding](https://github.com/tree-sitter/node-tree-sitter) | 生成健壮、可增量更新的语法树 | MIT | P0，核心依赖 |
| 语言 grammar | [Python](https://github.com/tree-sitter/tree-sitter-python)、[C++](https://github.com/tree-sitter/tree-sitter-cpp)、[JavaScript](https://github.com/tree-sitter/tree-sitter-javascript)、[TypeScript](https://github.com/tree-sitter/tree-sitter-typescript) | 支持四种目标语言 | MIT | P0，锁定兼容版本并维护语法夹具 |
| 协议校验 | [JSON Schema 2020-12](https://json-schema.org/draft/2020-12) + [Ajv](https://ajv.js.org/) | 定义并验证版本化 IR | 规范 + MIT | P0 |
| Web UI | [React](https://react.dev/) + [Vite](https://vite.dev/guide/) | 构建独立网页和开发工具链 | MIT | P0 |
| 图形画布 | [React Flow](https://reactflow.dev/) | 节点、边、缩放、平移、选择和自定义节点 | MIT 核心 | P0；只使用开源核心和 MIT 示例 |
| 自动布局 | [Dagre](https://github.com/dagrejs/dagre) | 第一版有向流程图布局 | MIT | P0，简单且许可友好 |
| 本地服务 | [Fastify](https://github.com/fastify/fastify) | 本地 HTTP、静态资源和 API | MIT | P0；也可在技术 spike 中与 Node 内置 HTTP 比较 |
| 文件监听 | [Chokidar](https://github.com/paulmillr/chokidar) | 统一不同系统的文件变化事件 | MIT | P1；实时模式使用 |
| 源码高亮 | [Shiki](https://github.com/shikijs/shiki) | 只读源码面板的多语言语法高亮 | MIT，内置 grammar 有各自 NOTICE | P1，可延后 |
| 单元测试 | [Vitest](https://vitest.dev/) | 协议、适配器、IR 和 UI 单元测试 | MIT | P0 |
| 端到端测试 | [Playwright](https://playwright.dev/) | 浏览器交互和跨浏览器测试 | Apache-2.0 | P1 |

### 16.3 React Flow 的边界

React Flow 核心是 MIT 开源项目，适合自定义叙事节点、循环容器和源码选择交互。其网站同时存在单独授权的 Pro 示例，因此：

- 可以使用 `@xyflow/react` 核心；
- 可以参考明确标注 MIT 的公开示例；
- 不应复制 Pro 模板或 Pro 示例源码；
- 展开/折叠和自动布局逻辑由项目自己实现。

### 16.4 Dagre 与 ELK.js

第一版推荐 Dagre：

- 面向有向图；
- 接入成本低；
- MIT 许可证；
- 足以支持按函数切片的叙事流程。

[ELK.js](https://github.com/kieler/elkjs) 对复杂分层、端口和边路由更强，但：

- 配置和集成复杂度更高；
- 包体和计算成本更高；
- 当前许可证为 EPL-2.0，需要在分发和 NOTICE 流程中额外审查。

因此 ELK.js 只作为后续大型嵌套图的候选，不进入 MVP 默认依赖。

### 16.5 不建议的路径

- 不用正则表达式替代语言解析器；
- 不为四种语言分别引入四套完全不同的编译器运行时；
- 不在浏览器中直接扫描用户整个文件系统；
- 不让 Web UI 依赖 AI API 才能打开已有叙事；
- 不自行开发画布缩放、节点拖拽和图布局；
- 不在 MVP 引入云数据库、用户系统或协作后端。

## 17. 测试策略

### 17.1 协议测试

- 每种节点的合法和非法案例；
- `detail` 默认绑定一个语句、`@covers statements=N` 绑定多个语句；
- `@covers` 为零、非整数、越界或跨作用域的诊断；
- 未知字段与版本处理；
- 重复 ID；
- 缺失摘要；
- 多语言和 Unicode 自然语言；
- 注释中包含标点、代码符号和多行内容。

### 17.2 语言适配器测试

每种语言维护固定 fixture：

- 顶层函数和类方法；
- 嵌套函数或 lambda 邻近结构；
- `if/else`、`switch` 或 `match`；
- `for`、`while`、嵌套循环；
- 单行、多行和连续多语句的 `detail` 精确源码范围；
- 异步函数；
- 装饰器、注解、模板、宏和 JSX/TSX 等边界；
- 不完整或暂时有语法错误的文件；
- 注释与 AST 节点之间存在空行或普通注释。

### 17.3 Golden IR 测试

每个 fixture 都包含期望 IR，避免 grammar 升级悄悄改变锚点和图结构。

### 17.4 Web 测试

- 节点展开/折叠；
- 循环进入、重复和退出关系；
- `detail` 默认隐藏、数量徽标、按需展开和精确源码高亮；
- 点击节点定位源码；
- 搜索和过滤；
- 文件变更后的增量刷新；
- 键盘操作与可访问性；
- 大图降级行为。

### 17.5 Skill 评估

固定提示词和代码任务，统计：

- 协议通过率；
- 锚定成功率；
- 叙事完整率；
- 语义重复率；
- `detail` 对非显然实现的解释质量和噪声比例；
- 人类评审正确率；
- 修改代码后叙事同步率。

## 18. MVP 验收标准

### 18.1 协议

- 四种语言都能表达相同的四类主流程节点和 `detail` 实现细节；
- 合法 fixture 100% 通过；
- 非法 fixture 给出文件和行列诊断；
- 协议有版本号和 JSON Schema；
- 普通注释不被误识别为叙事。

### 18.2 解析

- 能识别四种语言的函数、常见分支和循环；
- 每个叙事节点都有正确源码范围；
- `detail` 默认覆盖下一条 AST 语句，`@covers statements=N` 精确覆盖 N 条同层语句；
- `detail` 不生成主流程边，并稳定附着到最近的主流程节点；
- 循环明确显示迭代、继续和退出信息；
- 单文件失败不会阻止整个项目；
- 语法暂时不完整时可以给出部分结果或清晰诊断。

### 18.3 Web

- `shishan serve` 能从任意支持语言的样例仓库启动；
- 用户可以从项目总览进入任意函数；
- 函数内部以可展开图展示步骤、分支和循环；
- 主流程图默认不展开 `detail`，但节点显示细节数量并可按需查看；
- 展开 `detail` 后能看到自然语言说明和精确源码范围；
- 点击节点能在源码面板定位并高亮；
- 不依赖 VS Code；
- 不需要联网或配置模型 API。

### 18.4 Skill

- AI 能在四种语言的基准任务中生成可解析注释；
- AI 修改或删除控制结构时同步更新对应叙事；
- AI 只为非显然实现创建 `detail`，并在覆盖语句变化后同步更新说明和 `@covers`；
- 完成后会运行或提示运行 `shishan check`；
- 不把逐行翻译代码当作合格叙事。

### 18.5 安全

- 服务只监听本机；
- 无执行项目代码的路径；
- 无法通过 API 读取项目根目录外的文件；
- 注释内容不会以未转义 HTML 执行；
- 默认不上传源码和遥测。

## 19. 成功指标

### 19.1 核心产品指标

- 完成指定代码理解任务所需时间相较逐行阅读下降；
- 用户在不展开实现的情况下正确描述函数职责的比例提升；
- AI 变更中叙事同步率；
- 有效叙事覆盖率；
- 用户从叙事节点进入源码的点击路径；
- 用户展开 `detail` 后能否正确解释局部实现理由；
- 诊断被修复的比例。

### 19.2 定性指标

- 用户是否认为图展示的是“业务叙事”而不是“换一种方式显示语法”；
- 循环和分支说明是否帮助用户判断实现合理性；
- 叙事是否足够简洁，没有重新制造信息过载；
- 用户是否愿意把叙事与代码一起评审和提交。

默认不采集遥测。早期通过受控可用性测试和访谈收集指标。

## 20. 主要风险与缓解

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| AI 叙事与代码不一致 | 用户形成错误理解 | AST 决定拓扑；Skill 同步规则；`check`；后续 diff 过期检测 |
| 注释过多污染源码 | 开发者拒绝采用 | 三层渐进披露；`detail` 默认隐藏；只解释非显然实现；可在 v2 引入 hybrid sidecar |
| 多语言 AST 差异 | 适配器行为不一致 | 统一接口、语言 fixture、Golden IR、锁定 grammar 版本 |
| C++ 宏和模板复杂 | 锚定失败或误导 | MVP 明确不做预处理后语义；保守诊断，不强行推断 |
| 图过大 | 页面不可读或性能差 | 按函数切片、分层展开、节点数量阈值和大纲替代视图 |
| 原生 Tree-sitter 安装失败 | Linux 环境采用受阻 | 锁定兼容 grammar；Linux CI 验证 native binding；其他平台延期时保留 Wasm 备选调研 |
| React Flow Pro 授权误用 | 许可证风险 | 只使用 MIT 核心和明确开放示例，维护第三方 NOTICE |
| 本地 Web 服务被滥用 | 源码泄露 | loopback、Host/Origin 校验、根目录隔离、CSP、无任意命令执行 |
| 协议过早复杂化 | AI 难以稳定生成 | v1 只含四类主流程节点、一类非流程 `detail` 和行式指令 |
| 只支持某家 AI | 生态受限 | 协议与 Skill 解耦，提供平台适配器 |

## 21. 分阶段实施计划

### Phase 0：协议与技术风险验证（已实现）

交付物：

- `protocol-v1.md` 初稿；
- 四种语言包含主流程与 `detail` 的同构示例；
- Tree-sitter Node/Wasm 安装和性能 spike；
- 统一 IR 和 JSON Schema；
- React Flow + Dagre 的循环/分支原型，以及不进入主流程的 `detail` 展开原型；
- 确认源码内嵌协议是否可接受。

退出条件：

- 四种语言都能把相同叙事结构转成一致 IR；
- 循环和嵌套分支在图上可读；
- 单语句和连续多语句 `detail` 能稳定绑定，且不会让主流程图膨胀；
- 解析运行时和当前 Linux 安装路线已确定。

### Phase 1：端到端垂直切片（已实现）

交付物：

- CLI：`scan`、`check`、`serve`；
- Python 适配器；
- 一种 JS/TS 适配器；
- Web 项目树、函数页面、流程图、`detail` 旁注和源码面板；
- Authoring Skill v0.1；
- 静态 JSON IR 导出。

退出条件：

- AI 写代码与叙事后，用户能在浏览器查看并跳到源码；
- 用户能从简洁主流程按需展开局部实现理由并定位精确语句；
- 代码、协议、解析、Web 和 Skill 形成完整闭环。

### Phase 2：四语言 MVP（已实现，按产品决策仅验证 Linux）

交付物：

- C++ 适配器；
- 完整 JavaScript、TypeScript、JSX、TSX 支持；
- 文件监听和差量刷新；
- 覆盖率与诊断页面；
- Linux Node 24 CI；
- 包含 `detail` 边界案例的完整 fixture 和 Golden IR 测试。

退出条件：

- 满足第 18 节 MVP 验收标准；
- 四种语言的基准项目可稳定使用。

### Phase 3A：叙事可信度与静态分享（已实现）

交付物：

- Tree-sitter 函数实现指纹，忽略空白与普通注释但保留语法 token；
- Git revision 固定基线和 `SHISHAN501` 疑似过期诊断；
- `scan`、`check`、`export`、`serve` 的 `--base` 与 `--no-freshness` 支持；
- watcher 每批只刷新变更路径的 Git 状态，复用 Git baseline AST；
- Web 顶部 freshness 计数、函数 stale 徽标和诊断源码跳转；
- `export-site` 静态站点导出；源码默认省略，显式选择后受 25 MiB 源码和 64 MiB 最终 payload 上限保护；
- 对输出管道安全的 CLI 诊断写入，保证 CI 能收到非零退出时的诊断文本。

退出条件：

- 实现 token 变化且叙事指纹未变化时稳定报告 `SHISHAN501`；
- 同步修改叙事后诊断消失，空白和普通注释变化不误报；
- 文件监听只重算事件批次中的路径，不触发全项目 freshness scan；
- 静态站点在无 ShiShan API 的静态 HTTP 服务中可浏览；
- 默认静态包不泄露源码。

### Phase 3B：后续维护性与集成（已实现，按产品决策仅验证 Linux）

交付物：

- 协议升级到 `shishan/v1.1`，新增 `call`、`error`、`async` 节点以及 `@target`、`@failure`、`@resume` 字段；四种主语言都必须由真实 AST 结构验证，而不是只相信注释名称；
- Web 为新增节点提供独立视觉语义；80 个节点以上动态加载 ELK Web Worker，单次布局预算 5 秒，失败回退 Dagre，最多渲染 600 个节点；
- Linux VS Code 薄扩展，复用 CLI/Web 实现打开叙事、运行 strict freshness check，并通过受限 URI Handler 从 Web 返回 workspace 内源码；
- `annotate-plan` 与 `annotate-apply` 人工确认工作流：生成器不填业务 summary，只有 `approved` 项可应用，默认 dry-run，显式 `--write` 才修改源码；
- 批量写入前统一验证 plan 结构、内容哈希、函数位置、单行字段、语法和 AST 绑定；任一文件失效时不写任何文件。

退出条件：

- Python、C++、TypeScript、JavaScript fixture 都能正确绑定三种新增节点，错误 kind 仍产生结构诊断，IR 通过 JSON Schema；
- 小图和大图选择策略、600 节点资源上限、ELK 超时回退均有自动化验证；
- VS Code 扩展可构建，命令路径与 URI 路径隔离有自动化测试，Web 只在 live 模式显示编辑器跳转；
- 批量流程证明 draft 不写、dry-run 不写、approved 可写、源码过期不产生部分写入、注入和手改插入位置会被拒绝；
- Linux Node 24 下全量测试、类型检查、生产构建、strict check、增量 benchmark 与 live/static 浏览器回归通过。

多 AI 平台 Skill，以及 macOS/Windows 兼容性，按当前产品决策明确延期，不属于 Phase 3B 验收范围。

## 22. Phase 3B 已采用的产品决策

本阶段按以下决策实施：

1. 行式注释语法保持不变；新增节点以 `shishan/v1.1` 明确版本化，不在 `step` 中暗藏语义；
2. Web 保持“项目/函数大纲 + 当前函数流程图”，大图只升级布局引擎，不改变信息架构；
3. 既有仓库只生成待审核候选，不让模型或工具自动写入猜测的业务意图；
4. 静态分享继续默认隐藏源码；VS Code 跳转只存在于 live 模式，并限制在当前 workspace；
5. 当前仅维护 Codex `shishan-author` Skill；多 AI 平台 Skill 暂不评估；
6. 当前交付与 CI 仅面向 Linux；macOS 与 Windows 暂不纳入兼容承诺；
7. 项目继续采用 MIT；ELK.js 以 EPL-2.0 OR GPL-3.0-or-later 作为独立运行时依赖并保留许可证汇总。

## 23. 推荐的下一步行动

1. 推送 Phase 3B 实现分支并确认 Linux GitHub Actions；
2. 选择一个真实中型仓库，持续试用 live freshness、静态分享、VS Code 跳转和 annotation plan；
3. 用 5–10 个 Codex 编码任务评估 Skill 的同步率、`SHISHAN501` 命中率与噪声；
4. 根据真实使用结果决定是否冻结 `shishan/v1.1`；
5. 评估 600 节点截断是否需要演进为按层级折叠或服务端分页；
6. 多 AI 平台 Skill、macOS 与 Windows 兼容性保持延期，除非产品范围重新调整。

## 24. 技术调研来源

以下资料均为项目官方文档或官方代码仓库，调研日期为 2026-08-30：

- [Tree-sitter 官方介绍与解析器列表](https://tree-sitter.github.io/tree-sitter/)
- [Tree-sitter Node.js binding](https://github.com/tree-sitter/node-tree-sitter)
- [Tree-sitter WebAssembly binding](https://github.com/tree-sitter/tree-sitter/tree/master/lib/binding_web)
- [Tree-sitter Python grammar](https://github.com/tree-sitter/tree-sitter-python)
- [Tree-sitter C++ grammar](https://github.com/tree-sitter/tree-sitter-cpp)
- [Tree-sitter JavaScript grammar](https://github.com/tree-sitter/tree-sitter-javascript)
- [Tree-sitter TypeScript grammar](https://github.com/tree-sitter/tree-sitter-typescript)
- [JSON Schema Draft 2020-12](https://json-schema.org/draft/2020-12)
- [Ajv 官方文档](https://ajv.js.org/)
- [React Flow 官方文档](https://reactflow.dev/)
- [React Flow 布局方案比较](https://reactflow.dev/learn/layouting/layouting)
- [Dagre 官方仓库](https://github.com/dagrejs/dagre)
- [ELK.js 官方仓库与 EPL-2.0 许可证](https://github.com/kieler/elkjs)
- [Fastify 官方仓库](https://github.com/fastify/fastify)
- [Chokidar 官方仓库](https://github.com/paulmillr/chokidar)
- [Shiki 官方仓库](https://github.com/shikijs/shiki)
- [Vite 官方文档](https://vite.dev/guide/)
- [Vitest 官方文档](https://vitest.dev/)
- [Playwright 官方文档](https://playwright.dev/)
- [Node.js 官方版本状态](https://nodejs.org/en/about/previous-releases)
