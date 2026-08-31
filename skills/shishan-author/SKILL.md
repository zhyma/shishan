---
name: shishan-author
description: Author and maintain reader-first ShiShan natural-language code narratives in Python, C++, TypeScript, TSX, JavaScript, and JSX. Use when implementing or refactoring code in a ShiShan-enabled repository, when asked to add or repair @shishan annotations, or when code behavior changes could make an existing visual narrative stale. Write for readers who have no prior project or conversation context.
---

# ShiShan Author

Keep the implementation and its human-readable narrative aligned. Add annotations at semantic boundaries that help a first-time reader understand what the program is trying to accomplish, without restating every line.

Read [references/protocol.md](references/protocol.md) before authoring or changing annotations.

## Workflow

1. Establish the project's purpose and intended reader from its README, product documentation, surrounding module, and existing `.shishan/project.json`. Do not rely on the current chat as the missing explanation.
2. Inspect the target function and all nearby `@shishan` blocks. Identify its outcome, role in the larger workflow, meaningful actions, decisions, loops, important calls, error boundaries, asynchronous waits, and unusually important implementation details.
3. Update code and narrative together. Preserve accurate user-written prose when behavior has not changed. If an entry point, module responsibility, or named cross-function flow changes, update the affected project nodes and edges too.
4. Place each block immediately above its AST target and at the same indentation.
5. Run `shishan check <root> --strict`. Fix binding, syntax, and freshness diagnostics before finishing.
6. Review the rendered function and project flows when the local viewer is available. Confirm that details attach to the intended node, project source links still bind, and the project overview, function flow, and implementation-detail levels remain concise.
7. Perform a cold-reader pass using only the visible labels, summaries, and fields. Confirm that someone who has never seen the repository or conversation can explain what the project does, why each displayed step exists, and what outcome it produces.

## Write for a First-Time Reader

- Treat every narrative as durable product documentation that may be read outside the coding session. Never use the chat, task wording, filename, or source code as the only place where essential context exists.
- Introduce a project or named flow with the problem it solves, who or what uses it, and the observable outcome before describing internal architecture.
- Make each function or node summary name the relevant actor or data, the meaningful action, and the result. It should still make sense when shown alone on a card.
- Prefer ordinary natural-language sentences over compressed engineering shorthand. Explain an internal term or acronym the first time it is needed; omit it when the reader does not need it.
- Describe inputs and outputs by meaning, not only by variable or type name. An identifier may appear after the plain-language description when it helps source navigation.
- Explain a branch as the choice the program is making, a loop as the work being repeated and its stopping condition, and an error or async node as the user-visible or workflow consequence.
- Use `detail` to explain why a few concrete statements exist or what subtle guarantee they create. Do not merely translate the statements into prose.
- Avoid vague references such as “handle this,” “process the data,” “update it,” or “do the check” when the referent and outcome are not explicit.
- Match the language already chosen by the project or requested by the user. ShiShan's UI localization does not translate authored narratives.
- Stay concise by placing context at the highest useful level, then let child nodes add only what changes. Reader-first writing should reduce ambiguity, not repeat the whole project in every annotation.
- Never invent business intent to make prose sound complete. When the repository does not establish the purpose, write a factual implementation outcome or ask the user.

## Choose the Right Granularity

- Add one `function` block for each public, workflow-critical, or otherwise important named function.
- Add a `step` for a meaningful action or state transition, not for routine syntax.
- Add a `branch` directly above the `if`, `switch`, `match`, or equivalent decision it describes.
- Add a `loop` directly above the `for`, `while`, or equivalent repetition it describes.
- Add a `call` directly above a statement containing a reviewer-important function, constructor, or service call. Use `@target` when the callee is not obvious.
- Add an `error` directly above a `try`, `throw`, `raise`, or assertion boundary. Use `@failure` for important failure outcomes.
- Add an `async` directly above a statement containing `await`, `yield`, `co_await`, or an equivalent suspension point. Use `@resume` when the continuation matters.
- Keep one flow annotation per AST target. For an awaited call, prefer `async` and add `@target` when the callee matters; do not stack `call` and `async` on one statement.
- Add a `detail` when one or a few concrete statements deserve explanation but should not become flow nodes.
- Leave ordinary implementation lines unannotated when their meaning is already clear from the surrounding narrative.
- Keep project flows selective: name the few architecture, request, data, or failure stories a reviewer actually needs. Do not turn every file or dependency into a project node.
- When a project node should open deeper function-flow and implementation-detail levels, bind it to an exact named symbol that already has a `@shishan function` narrative. A path-only node can still explain architecture and open source, but it cannot promise a function drilldown.

## Authoring Rules

- Use a header shaped as `@shishan <kind> <id>`.
- Use lowercase hyphenated IDs. Keep function IDs unique within a file and child IDs unique within their function.
- Add exactly one concise `@summary`. Describe purpose or effect, not source syntax.
- Write `@summary` as a self-contained natural-language statement. Do not assume the reader already knows the feature, subsystem, request, or data being discussed.
- Keep the header and fields in consecutive single-line comments using the language's normal comment prefix.
- Repeat `@input`, `@output`, `@effect`, or `@note` when multiple values are needed.
- Repeat `@target` on `call` or call-bearing `async` nodes and `@failure` on error nodes when multiple values matter. Keep `@resume` singular.
- Use `@condition` on decisions when the condition is not obvious in natural language.
- A `detail` binds to the next statement by default. Use `@covers statements=N` only for consecutive sibling statements in the same syntax block.
- Never use `@covers` on flow nodes. Details do not create graph edges.
- Do not place executable code between an annotation block and its target.
- Keep project-level narratives in `.shishan/project.json` with `schemaVersion: "shishan/project-v1"`. Use project-relative source paths and exact named symbols; never guess a symbol that was not inspected.
- Use `entry`, `module`, `process`, `decision`, `error`, `output`, or `external` for project nodes, and `next`, `true`, `false`, `calls`, `error`, or `data` for project edges.
- Keep node and edge IDs lowercase-hyphenated and unique within their flow. Every edge endpoint and `entryFlow` must exist.

## Maintain Narratives During Code Changes

- Update summaries, conditions, effects, inputs, and outputs whenever behavior changes.
- Move the annotation with its target during code motion.
- Split a broad step when the implementation becomes separate user-meaningful actions.
- Merge or remove annotations when a refactor makes them redundant.
- Remove an annotation when its target is deleted; do not leave historical prose in active source.
- Rename or remove project source references when their bound symbol moves or disappears. Re-evaluate adjacent project summaries and edges when a module responsibility changes.
- Treat a changed `@covers` span as a correctness-sensitive edit. Recount sibling statements after inserting, removing, or reordering code.
- Treat `SHISHAN501` as a required narrative review. Update the explanation only when behavior, intent, or important implementation details changed; never make a cosmetic prose edit solely to change the fingerprint.
- Do not invent business intent. If the code and available context do not establish intent, use a factual implementation summary or ask the user.

## Finish Criteria

- The code parses in its native toolchain.
- `shishan check` reports no errors caused by the change.
- No changed implementation is left with an unresolved `SHISHAN501` warning.
- Each annotation binds to the intended AST node.
- Function inputs, outputs, major decisions, loops, important calls, error paths, and asynchronous waits are understandable from the narrative.
- Detailed callouts are useful when expanded and do not overwhelm the default flow.
- Existing project flows pass validation, retain accurate source bindings, and still tell an end-to-end story without becoming a file inventory.
- Project nodes intended for drilldown resolve to narrated functions, and all three display levels remain useful when reviewed in either supported UI language.
- Reading only the project overview and nested narrative text is sufficient to understand the system's purpose and the role and outcome of each displayed step; unexplained chat context, pronouns, acronyms, and identifier-only descriptions are absent.
