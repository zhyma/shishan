# ShiShan v1.2 协议规范

## 1. 目标

`shishan/v1.2` 把“代码事实”和“自然语言解释”分开：

- Tree-sitter AST 决定函数、语句、分支、循环、嵌套和源码范围；
- `@shishan` 注释提供目的、条件、输入、输出和实现理由；
- 解析器将两者合成与语言无关的 IR。

函数内部拓扑始终来自 AST，不允许注释自行声明一套脱离源码的控制流。项目级清单可以显式编排少量跨模块叙事关系，但它必须通过独立 Schema、图拓扑和源码符号绑定校验，且不冒充编译器级调用图。

## 2. 注释语法

```text
<comment> @shishan <kind> <id>
<comment> @summary <text>
<comment> @field <value>
```

规则：

- `kind` 为 `function`、`step`、`branch`、`loop`、`call`、`error`、`async` 或 `detail`；
- `id` 必须匹配 `^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$`；
- `@summary` 必须出现且应只有一个；
- 一个 block 必须是同一缩进、同一注释前缀的连续单行注释；
- Python 使用 `#`，C++/TypeScript/JavaScript 使用 `//`；解析器也可读取 block comment；
- 普通注释不会进入协议。

字段：

| 字段 | 重复 | 说明 |
| --- | --- | --- |
| `@summary` | 否 | 节点或细节的自然语言目的 |
| `@input` | 是 | 输入数据边界 |
| `@output` | 是 | 输出数据边界 |
| `@condition` | 否 | 分支或循环的自然语言条件 |
| `@effect` | 是 | 外部可见副作用 |
| `@note` | 是 | 评审者需要知道的限制 |
| `@target` | 是 | `call` 或含调用的 `async` 节点目标；一条语句有多个关键调用时可重复 |
| `@failure` | 是 | `error` 的失败结果或传播路径 |
| `@resume` | 否 | `async` 恢复执行后的下一步 |
| `@label` | 否 | 可选短显示名 |
| `@covers statements=N` | 否 | `detail` 专用，`N` 为正整数 |

## 3. AST 绑定

### 3.1 通用规则

注释 block 绑定其后同缩进的下一条可叙述 AST 节点。block 和目标之间不能出现其他可执行语句。

- `function` 必须绑定命名函数或方法；
- JS/TS 的 export 或变量声明可以作为函数外壳，解析器继续绑定其中直接命名的 arrow/function；
- `branch` 必须绑定 `if`、`switch`、Python `match` 或 `try` 等决策结构；
- `loop` 必须绑定 `for`、`while` 或对应循环结构；
- `call` 必须绑定内部确实包含调用或构造表达式的语句；
- `error` 必须绑定 `try`、`throw`、`raise`、assert 或对应错误边界；
- `async` 必须绑定内部确实包含 await、yield、`co_await`、`co_yield` 或 coroutine return 的语句；
- `step` 与 `detail` 绑定普通语句或控制结构。

同一 AST 目标只能有一个主流程 annotation。一个 `await service.load()` 同时包含调用和等待时，通常选择更能解释控制流的 `async`，并用 `@target service.load` 保留调用信息；不要把 `call` 与 `async` 两个 block 叠在同一语句上。

行列在 IR 中使用零基坐标，Web UI 和诊断文本展示为一基坐标。

### 3.2 `detail`

默认：

```typescript
// @shishan detail normalize-email
// @summary Normalize the address before validation
const normalized = email.trim().toLowerCase();
```

连续语句：

```typescript
// @shishan detail derive-identity
// @summary Normalize the address and derive its stable key
// @covers statements=2
const normalized = email.trim().toLowerCase();
const key = hash(normalized);
```

`N` 条语句必须是同一父 AST block 中从目标开始的连续 sibling。越界时产生诊断并只绑定实际存在的语句。`detail` 附着到包含该范围的最小主流程节点；没有更小节点时附着到函数。它永远不生成主流程边。

## 4. 层级与边

- 函数是叙事根；
- 绑定范围被 branch/loop/error 等结构范围包含的 flow 节点成为其 child；
- sibling 默认以 `next` 相连；
- branch 的内部入口为 `true`，离开到下一 sibling 为 `false`；
- loop 的内部入口为 `body`，离开到下一 sibling 为 `exit`。

v1.2 表达的是可读叙事关系，不承诺完整编译器级 CFG。`call`、`error` 和 `async` 当前沿用 `next` 边；其语义由节点 kind 与字段表达，不虚构编译器无法证明的成功/失败控制流。

## 5. ID 作用域

- function ID 在单个文件内唯一；
- step/branch/loop/call/error/async/detail ID 在所属函数内唯一；
- IR 全局 ID 由标准化相对路径、function ID 和 local ID 组合，源码移动之外保持稳定。

## 6. 项目级叙事清单

`.shishan/project.json` 是与源码共同提交 Git 的项目整体叙事，Schema 版本为 `shishan/project-v1`。它用于回答“项目有哪些关键流程、请求或数据如何跨模块推进”，不要求把每个文件或函数都放进图中。

```json
{
  "schemaVersion": "shishan/project-v1",
  "title": "Request engine",
  "summary": "Turn one request into a response.",
  "entryFlow": "request-lifecycle",
  "flows": [
    {
      "id": "request-lifecycle",
      "title": "Request lifecycle",
      "summary": "Follow the primary request path.",
      "nodes": [
        {
          "id": "receive-request",
          "kind": "entry",
          "label": "Receive request",
          "summary": "Accept the platform request.",
          "source": { "path": "src/app.ts", "symbol": "fetch" }
        }
      ],
      "edges": []
    }
  ]
}
```

规则：

- flow、node 和 edge ID 都使用小写连字符格式；`entryFlow` 必须存在；
- node kind 为 `entry`、`module`、`process`、`decision`、`error`、`output` 或 `external`；
- edge kind 为 `next`、`true`、`false`、`calls`、`error` 或 `data`；
- edge 的 source/target 必须存在于同一 flow；每个 flow 的 node/edge ID 唯一；
- source path 必须是项目内相对路径，不能绝对化、目录穿越或通过符号链接逃逸；
- source symbol 可选；存在时解析器用当前 `FileAnalysis.symbols` 绑定精确范围和对应函数 narrative ID；
- 绑定到带 `@shishan function` 的命名符号后，同一个项目节点可以渐进展示项目概览、该函数的嵌套流程节点和附着的 `detail`；这只是复用既有 IR，不新增协议 kind；
- 文件最大 256 KiB；最多 32 条 flow、每条 100 个 node 和 300 条 edge；
- 清单缺失时函数级能力照常工作，Web Overview 显示明确空状态。

机器可读 Schema 位于 [packages/protocol/schema/shishan-project.schema.json](../packages/protocol/schema/shishan-project.schema.json)。

## 7. IR

顶层 payload 有两种：

- `ProjectSnapshot`：首次加载使用，包含项目叙事、项目诊断和所有已索引文件；
- `ProjectPatch`：在线更新使用，只包含变更的文件；项目叙事发生变化或源码重绑定时使用 `projectNarrativeChanged` 和对应 payload。

每个 `FileAnalysis` 包含：

- 语言、内容哈希和 parse mode；
- narrated functions、符号和层级节点；
- diagnostics；
- function coverage、flow node 数和 detail 数；
- 是否存在语法错误。

机器可读 Schema 位于 [packages/protocol/schema/shishan-ir.schema.json](../packages/protocol/schema/shishan-ir.schema.json)。

## 8. 诊断代码

| 范围 | 含义 |
| --- | --- |
| `SHISHAN001–003` | 源码语法、资源上限或单文件读取/解析失败 |
| `SHISHAN101–105` | header、kind、ID、covers 或 summary 错误 |
| `SHISHAN201–203` | 字段错误 |
| `SHISHAN301–306` | AST 绑定、范围、作用域或重复目标错误 |
| `SHISHAN401` | 命名函数尚无 function narrative，默认 info |
| `SHISHAN501` | 相对 Git 基线实现 token 已变化，但函数叙事指纹完全未变化 |
| `SHISHAN601–606` | 项目清单读取/Schema、图拓扑、路径与源码符号绑定错误 |

## 9. Git freshness

freshness 不改变 `shishan/v1.2` IR 拓扑，而是在 `FileAnalysis.diagnostics` 中增加维护性提示：

1. 启动时把 `--base`（默认 `HEAD`）解析并固定为 commit hash；
2. 仅对 Git 报告为 changed 的当前文件读取 baseline 版本；
3. 用 Tree-sitter token 生成函数实现指纹，忽略空白和 comment node；
4. 用 function/child/detail 的 id、kind、summary 与 fields 生成叙事指纹；
5. 实现指纹变化而叙事指纹相同时产生 `SHISHAN501` warning。

该诊断表示“必须复核”，不是自然语言正确性的证明。正确处理方式是检查 summary、condition、effect、children 和 details 是否仍与实现一致；如果确实需要更新，应写出有意义的变化，而不是机械修改标点来改变指纹。

新增文件没有 baseline，不产生过期诊断。普通注释或纯格式变化不改变实现指纹。当前版本不跨 Git rename 匹配旧路径。

## 10. 版本与兼容

- payload 必须携带 `protocolVersion: "shishan/v1.2"`；
- v1.2 保留 v1.1 的全部函数注释语法与字段语义，并在 snapshot/patch 中加入项目叙事；
- `.shishan/project.json` 独立使用 `shishan/project-v1`，以后可在不改变源码注释语法时单独演进；
- 只接受精确旧 payload 的消费者需要升级后再读取 v1.2 payload；
- 破坏性语法或 IR 变化必须使用新协议版本；
- grammar 升级必须通过跨语言 Golden IR 测试。

基础样例位于 [fixtures/polyglot](../fixtures/polyglot)，期望结果位于 [fixtures/golden/polyglot.json](../fixtures/golden/polyglot.json)。`call`、`error`、`async` 的四语言样例位于 [fixtures/advanced](../fixtures/advanced)。
