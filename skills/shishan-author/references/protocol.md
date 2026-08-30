# ShiShan Annotation Protocol

## Grammar

An annotation is a contiguous block of single-line comments:

```text
<comment> @shishan <kind> <lowercase-hyphen-id>
<comment> @summary <concise natural-language purpose>
<comment> @field <value>
```

Supported kinds are `function`, `step`, `branch`, `loop`, and `detail`.

Supported fields are:

- `@summary`: required once.
- `@input` and `@output`: repeatable data boundaries.
- `@condition`: natural-language decision or loop condition.
- `@effect`: repeatable observable effects.
- `@note`: caveats that matter to a reviewer.
- `@label`: optional short display label.
- `@covers statements=N`: detail-only span of positive `N` consecutive sibling statements.

Positions are structural. The annotation binds to the next AST statement at the same indentation. A function annotation may bind through an export or variable declaration to the named function or arrow function it contains.

## Visual Semantics

- `function` is the root of one function narrative.
- `step` is a normal flow node.
- `branch` is a decision node. Annotated statements inside its AST range become children.
- `loop` is a repetition node. Annotated statements inside its AST range become body children.
- `detail` is an attached callout. It never becomes a flow node or creates an edge.

Details attach to the smallest annotated flow node containing their statement span. When no step, branch, or loop contains that span, they attach to the function.

## Python Example

```python
# @shishan function price-order
# @summary Calculate the final order price
# @input item prices
# @output final price
def price_order(prices):
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
export const selectLabel = (ready: boolean): string => {
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
