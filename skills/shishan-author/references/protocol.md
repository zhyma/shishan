# ShiShan Annotation Protocol

## Grammar

An annotation is a contiguous block of single-line comments:

```text
<comment> @shishan <kind> <lowercase-hyphen-id>
<comment> @summary <concise natural-language purpose>
<comment> @field <value>
```

Supported kinds are `function`, `step`, `branch`, `loop`, `call`, `error`, `async`, and `detail`.

Supported fields are:

- `@summary`: required once.
- `@input` and `@output`: repeatable data boundaries.
- `@condition`: natural-language decision or loop condition.
- `@effect`: repeatable observable effects.
- `@note`: caveats that matter to a reviewer.
- `@target`: repeatable call targets for `call` or call-bearing `async` nodes.
- `@failure`: repeatable failure outcomes for `error` nodes.
- `@resume`: the continuation after an `async` suspension.
- `@label`: optional short display label.
- `@covers statements=N`: detail-only span of positive `N` consecutive sibling statements.

Positions are structural. The annotation binds to the next AST statement at the same indentation. A function annotation may bind through an export or variable declaration to the named function or arrow function it contains.

## Visual Semantics

- `function` is the root of one function narrative.
- `step` is a normal flow node.
- `branch` is a decision node. Annotated statements inside its AST range become children.
- `loop` is a repetition node. Annotated statements inside its AST range become body children.
- `call` is a statement that structurally contains a call or construction expression.
- `error` is a `try`, `throw`, `raise`, assertion, or equivalent error boundary.
- `async` is a statement that structurally contains an await, yield, coroutine wait, or coroutine return.
- `detail` is an attached callout. It never becomes a flow node or creates an edge.

Details attach to the smallest annotated flow node containing their statement span. When no step, branch, loop, call, error, or async node contains that span, they attach to the function.

Only one flow annotation may bind to one AST target. For an awaited call, prefer `async` and add `@target` when the callee matters; do not stack `call` and `async` blocks on the same statement.

## Project Narrative Manifest

An optional `.shishan/project.json` supplies the default project-level overview. It is version-controlled natural-language architecture, not an automatically inferred call graph.

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

Project node kinds are `entry`, `module`, `process`, `decision`, `error`, `output`, and `external`. Edge kinds are `next`, `true`, `false`, `calls`, `error`, and `data`.

Use lowercase-hyphenated IDs. `entryFlow` and every edge endpoint must exist. Source paths are repository-relative; a source symbol is optional but must be copied from an inspected named function or method. Keep flows small and reader-oriented. Update an existing manifest when architecture, an entry point, a module responsibility, or an explicitly shown cross-function path changes. Do not create a manifest for an unrelated local refactor unless the project asks for one.

## Python Example

```python
# @shishan function price-order
# @summary Calculate the final order price
# @input item prices
# @output final price
async def price_order(prices):
    # @shishan detail prepare-values
    # @summary Copy prices and compute the subtotal
    # @covers statements=2
    normalized = list(prices)
    total = sum(normalized)

    # @shishan branch apply-discount
    # @summary Discount large orders
    # @condition total is at least 100
    if total >= 100:
        total *= 0.9

    # @shishan async persist-total
    # @summary Wait for the total to be persisted
    # @resume return the persisted value
    total = await store.save(total)

    # @shishan step return-total
    # @summary Return the final price
    return total
```

## C++ Example

```cpp
// @shishan function sum-values
// @summary Sum all input values
// @input values
// @output numeric sum
double sumValues(const std::vector<double>& values) {
  double total = 0.0;

  // @shishan loop accumulate-values
  // @summary Add every value to the accumulator
  for (double value : values) {
    total += value;
  }

  // @shishan step return-total
  // @summary Return the accumulated sum
  return total;
}
```

## TypeScript and JavaScript Example

Use `//` comments in `.ts`, `.tsx`, `.js`, and `.jsx` files.

```typescript
// @shishan function select-label
// @summary Select a display label for the current state
export const selectLabel = (): string => {
  // @shishan call read-state
  // @summary Read the latest initialization state
  // @target stateStore.read
  const ready = stateStore.read();

  // @shishan branch choose-ready-label
  // @summary Return the ready label when initialization is complete
  // @condition ready is true
  if (ready) {
    return 'Ready';
  }

  // @shishan step return-pending
  // @summary Return the pending label
  return 'Pending';
};
```

JSX and TSX return statements may contain JSX; they use the same annotation rules.

## Common Diagnostics

- `SHISHAN101–105`: malformed header, unknown kind, invalid ID, invalid coverage, or missing summary.
- `SHISHAN201–203`: unknown or duplicated field, or `@covers` on a non-detail.
- `SHISHAN301`: no following syntax node at the annotation indentation.
- `SHISHAN302`: annotation kind does not match the next AST target.
- `SHISHAN303`: requested detail span exceeds the remaining sibling statements.
- `SHISHAN304`: flow annotation is outside a narrated function.
- `SHISHAN305–306`: duplicate ID or more than one flow annotation on one syntax target.
- `SHISHAN401`: named function has no function narrative; informational by default.
- `SHISHAN501`: implementation tokens changed from the selected Git baseline while the function narrative stayed byte-for-byte equivalent after normalization; review and meaningfully synchronize the narrative.
- `SHISHAN601–606`: project manifest read/schema, topology, path, or source-symbol binding diagnostics.
