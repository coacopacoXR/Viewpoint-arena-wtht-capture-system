# Next Steps — Before Resuming

> Personal checklist, not an execution ticket. Everything here is for you,
> outside the coding session. Once these are done, tell me and I'll pick up
> immediately from "Ready when you are" below.

## 1. Set up the Qwen execution backend

- [ ] Subscribe to **QwenCloud's Token Plan — Standard tier**
  ($18–25/mo, 10,000 credits/week, 3–4 concurrent agents). Recommended over
  Lite (too little concurrency to parallelize independent tickets) and Pro
  (no reason to pay 4x before the pipeline is proven).
  → https://www.qwencloud.com/pricing/token-plan
- [ ] Before or right after subscribing, check their docs/support for the
  **credit-to-token conversion rate** — not published on the pricing page,
  and it's what actually determines whether 10k credits/week covers the
  ~30-ticket plan or runs out fast. Worth knowing before we're deep into
  Phase 1.
- [ ] Generate an API key from QwenCloud's **API Keys** page (gives you a
  base URL + key for OpenAI/Anthropic-protocol access).

## 2. Nothing else is blocking

License is decided (Apache-2.0 — `07-oss-hygiene-and-licensing.md` §3) and
the two branded `.glb` assets default to being replaced with an open sample
(`08-task-breakdown.md` T0.1) — both proceed automatically next session,
no action needed from you. **Only tell me before we resume if you actually
hold redistribution rights to the Sennheiser/Santa Cruz models** — that's a
fact only you know, so it's the one exception to "don't wait on me."

Same logic going forward: I'll only come back to you mid-execution for
personal-preference or UI/UX calls, not technical decisions with a clear
best answer.

## 3. Optional — commit the plan docs

`docs/plan/*.md` (this file included) is currently uncommitted on
`planning/oss-enterprise-readiness`. No action needed from you — just flag
when we resume whether you want it committed now or held until Phase 0 lands.

---

## Ready when you are — what I'll do next session

Once §1 above is settled:

1. Install the **Qwen Code CLI**, configure it against your QwenCloud base
   URL/API key.
2. Set up a permission allowlist scoped to exactly what the loop needs (git
   branch/commit on the planning branch, running `qwen`, `npm run
   typecheck/lint/test`) so a multi-hour unattended run doesn't stall on a
   permission prompt the first time it touches Bash/git. Still never pushes
   to `origin`/`main` without you reviewing first — that stays manual.
3. Execute T0.1 (asset swap, defaulting to replace) and T0.3 (LICENSE +
   baseline OSS files) — both decided, no confirmation needed.
4. Run **one validation ticket** (T1.1 — lint/format setup, no dependencies,
   low risk) through the full loop end-to-end: branch off
   `planning/oss-enterprise-readiness` → `qwen -p "<ticket>" --yolo` →
   I check the diff against T1.1's acceptance criteria and run
   typecheck/lint/test myself → merge if it passes.
5. If that validation run is clean, start the autonomous loop across the rest
   of Phase 0/1 (`08-task-breakdown.md`), respecting dependency order, and
   only come back to you for genuine personal-preference/UI decisions —
   plus anything stuck after a couple of retries.
