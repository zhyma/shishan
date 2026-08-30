---
name: shishan-author
description: Author and maintain ShiShan natural-language code narratives in Python, C++, TypeScript, TSX, JavaScript, and JSX. Use when implementing or refactoring code in a ShiShan-enabled repository, when asked to add or repair @shishan annotations, or when code behavior changes could make an existing visual narrative stale.
---

# ShiShan Author

Keep the implementation and its human-readable narrative aligned. Add annotations at semantic boundaries that help a reviewer understand the program without restating every line.

Read [references/protocol.md](references/protocol.md) before authoring or changing annotations.

## Workflow

1. Inspect the target function and all nearby `@shishan` blocks before editing.
2. Identify the function's intent, meaningful actions, decisions, loops, and unusually important implementation details.
3. Update code and narrative together. Preserve accurate user-written prose when behavior has not changed.
4. Place each block immediately above its AST target and at the same indentation.
5. Run `shishan check <root>`. Fix binding and syntax diagnostics before finishing.
6. Review the rendered flow when the local viewer is available. Confirm that details attach to the intended node and that the graph remains concise.

## Choose the Right Granularity

- Add one `function` block for each public, workflow-critical, or otherwise important named function.
- Add a `step` for a meaningful action or state transition, not for routine syntax.
- Add a `branch` directly above the `if`, `switch`, `match`, or equivalent decision it describes.
- Add a `loop` directly above the `for`, `while`, or equivalent repetition it describes.
- Add a `detail` when one or a few concrete statements deserve explanation but should not become flow nodes.
- Leave ordinary implementation lines unannotated when their meaning is already clear from the surrounding narrative.

## Authoring Rules

- Use a header shaped as `@shishan <kind> <id>`.
- Use lowercase hyphenated IDs. Keep function IDs unique within a file and child IDs unique within their function.
- Add exactly one concise `@summary`. Describe purpose or effect, not source syntax.
- Keep the header and fields in consecutive single-line comments using the language's normal comment prefix.
- Repeat `@input`, `@output`, `@effect`, or `@note` when multiple values are needed.
- Use `@condition` on decisions when the condition is not obvious in natural language.
- A `detail` binds to the next statement by default. Use `@covers statements=N` only for consecutive sibling statements in the same syntax block.
- Never use `@covers` on flow nodes. Details do not create graph edges.
- Do not place executable code between an annotation block and its target.

## Maintain Narratives During Code Changes

- Update summaries, conditions, effects, inputs, and outputs whenever behavior changes.
- Move the annotation with its target during code motion.
- Split a broad step when the implementation becomes separate user-meaningful actions.
- Merge or remove annotations when a refactor makes them redundant.
- Remove an annotation when its target is deleted; do not leave historical prose in active source.
- Treat a changed `@covers` span as a correctness-sensitive edit. Recount sibling statements after inserting, removing, or reordering code.
- Do not invent business intent. If the code and available context do not establish intent, use a factual implementation summary or ask the user.

## Finish Criteria

- The code parses in its native toolchain.
- `shishan check` reports no errors caused by the change.
- Each annotation binds to the intended AST node.
- Function inputs, outputs, major decisions, and loops are understandable from the narrative.
- Detailed callouts are useful when expanded and do not overwhelm the default flow.
