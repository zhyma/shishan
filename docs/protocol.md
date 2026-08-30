# ShiShan v1 协议规范

## 1. 目标

`shishan/v1` 把“代码事实”和“自然语言解释”分开：

- Tree-sitter AST 决定函数、语句、分支、循环、嵌套和源码范围；
- `@shishan` 注释提供目的、条件、输入、输出和实现理由；
- 解析器将两者合成与语言无关的 IR。

协议不允许注释自行声明一套脱离源码的任意拓扑。

## 2. 注释语法

```text
<comment> @shishan <kind> <id>
<comment> @summary <text>
<comment> @field <value>
```

规则：

- `kind` 为 `function`、`step`、`branch`、`loop` 或 `detail`；
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
| `@label` | 否 | 可选短显示名 |
| `@covers statements=N` | 否 | `detail` 专用，`N` 为正整数 |

## 3. AST 绑定

### 3.1 通用规则

注释 block 绑定其后同缩进的下一条可叙述 AST 节点。block 和目标之间不能出现其他可执行语句。

- `function` 必须绑定命名函数或方法；
- JS/TS 的 export 或变量声明可以作为函数外壳，解析器继续绑定其中直接命名的 arrow/function；
- `branch` 必须绑定 `if`、`switch`、Python `match` 或 `try` 等决策结构；
- `loop` 必须绑定 `for`、`while` 或对应循环结构；
- `step` 与 `detail` 绑定普通语句或控制结构。

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
- 绑定范围被 branch/loop 范围包含的 flow 节点成为其 child；
- sibling 默认以 `next` 相连；
- branch 的内部入口为 `true`，离开到下一 sibling 为 `false`；
- loop 的内部入口为 `body`，离开到下一 sibling 为 `exit`。

v1 表达的是可读叙事关系，不承诺完整编译器级 CFG。

## 5. ID 作用域

- function ID 在单个文件内唯一；
- step/branch/loop/detail ID 在所属函数内唯一；
- IR 全局 ID 由标准化相对路径、function ID 和 local ID 组合，源码移动之外保持稳定。

## 6. IR

顶层 payload 有两种：

- `ProjectSnapshot`：首次加载使用，包含所有已索引文件；
- `ProjectPatch`：在线更新使用，只包含 `upsertFiles`、`removedFiles`、新的聚合覆盖率和指标。

每个 `FileAnalysis` 包含：

- 语言、内容哈希和 parse mode；
- narrated functions、符号和层级节点；
- diagnostics；
- function coverage、flow node 数和 detail 数；
- 是否存在语法错误。

机器可读 Schema 位于 [packages/protocol/schema/shishan-ir.schema.json](../packages/protocol/schema/shishan-ir.schema.json)。

## 7. 诊断代码

| 范围 | 含义 |
| --- | --- |
| `SHISHAN001–003` | 源码语法、资源上限或单文件读取/解析失败 |
| `SHISHAN101–105` | header、kind、ID、covers 或 summary 错误 |
| `SHISHAN201–203` | 字段错误 |
| `SHISHAN301–306` | AST 绑定、范围、作用域或重复目标错误 |
| `SHISHAN401` | 命名函数尚无 function narrative，默认 info |

## 8. 版本与兼容

- payload 必须携带 `protocolVersion: "shishan/v1"`；
- v1 内可添加可选字段，但不得改变现有字段语义；
- 破坏性语法或 IR 变化必须使用新协议版本；
- grammar 升级必须通过跨语言 Golden IR 测试。

完整样例位于 [fixtures/polyglot](../fixtures/polyglot)，期望结果位于 [fixtures/golden/polyglot.json](../fixtures/golden/polyglot.json)。
