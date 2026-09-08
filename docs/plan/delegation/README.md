# Delegated execution — how these tickets were built

Tickets T0.2 through T5.2 were implemented by the **Qwen Code CLI** driven by
Claude. Claude wrote the spec, Qwen wrote the code, Claude reviewed the diff and
committed. The files in this directory are the specs, verbatim, in the order
they ran (`batch-a.md` first).

They are kept because they are the reusable part. The guardrails in them are
what caught most of the problems, and re-deriving them from scratch wastes a
session. The agent run logs are not kept — they are large and the findings that
mattered are recorded in [`../EXECUTION-LOG.md`](../EXECUTION-LOG.md).

## How to run one

```bash
qwen -y -o text < docs/plan/delegation/batch-x.md > .qwen-tasks/batch-x.log 2>&1
```

Add `-m qwen3.8-max` for genuinely hard tickets. Default (`qwen3.7-plus`) is
enough for mechanical work and much cheaper — batches A–K ran on it, and
batches L–O on `qwen3.8-max` exhausted a weekly quota in four runs.

## The rules every spec repeats, and why

- **No git write commands.** Qwen may not `commit`, `add`, `push`, `checkout`
  or `reset`. Everything lands in the working tree so a human reviews it before
  it becomes history. This is the single most important rule.
- **Name the anti-shortcut explicitly.** "Fix the violations, do not add
  `eslint-disable`." "Do not use `any` or loosen tsconfig." "If a snapshot
  changes, fix the refactor, do not update the snapshot." An agent optimises for
  the check you named, so name the cheat you do not want.
- **Do not touch `docs/`.** Keeps the plan and this log authored by a human.
- **State what must not regress.** The empty `KNOWN` map in
  `scripts/check-public-env.mjs`; `types/three-augment.ts` keeping its `.ts`
  extension; the 61 characterization snapshots.
- **Demand a report with specific fields**, including "anything you
  deliberately did NOT do, and why". That last field surfaced several real
  findings that the code alone would not have shown.
- **Require the full check suite at the end** and ask for exact output.

## How review actually worked

A green test run was never accepted as evidence on its own. What repeatedly
found real problems:

- **Mutation testing.** Break the thing the test claims to protect and confirm
  the test fails. This caught a security guard that scanned nothing, and
  confirmed the fail-safe, the redactor, and the cross-language parity suite
  were genuine.
- **Inspecting the built artefact, not the source.** `npm run build` then
  grepping `dist/` proved the Teamcenter password stopped shipping to the
  browser — and separately exposed a hole in the guard itself, since a Teams
  webhook URL was being inlined unflagged.
- **Checking the work against the PLAN, not against the spec.** The spec is
  Claude's paraphrase and can be wrong. One spec contradicted the architecture
  doc and would have made the plan's own example config fail its own schema.
- **Asking what was not done.** Qwen's own "deliberately not done" sections
  disclosed an unbuilt Teamcenter read path and a latent cache bug.

Findings, overrides and the reasoning behind each are in
[`../EXECUTION-LOG.md`](../EXECUTION-LOG.md).
