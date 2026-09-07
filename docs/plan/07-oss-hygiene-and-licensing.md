# OSS Hygiene & Licensing

## 1. Asset provenance — default to safe, don't block on it

Three tracked binary files are named after specific commercial products:

- `sennheiser_momentum_4_headphones.glb` (repo root)
- `components/Scene/sennheiser_momentum_4_headphones.glb` (duplicate)
- `components/Scene/santa_cruz_v10_dh_bicycle.glb`

A `.glb` file named after a real, currently-sold Sennheiser headphone and a
real Santa Cruz bicycle model is almost certainly a 3D scan/model sourced from
a marketplace or community site for prototyping — not something with
redistribution rights by default. Shipping these in a public open-source repo
risks a takedown at best and a real IP/trademark problem at worst.

Whether you hold redistribution rights is a fact only you know, not a
technical judgment call — but it doesn't need to halt execution waiting on an
answer. **Default: replace them** with an openly-licensed sample (e.g. from
the Khronos glTF-Sample-Assets repo, CC0 or similarly permissive) as the OSS
default, keeping the branded originals locally in a private, git-ignored
`assets/samples/` for your own use. This is the objectively safer default
when rights are unconfirmed, so execution proceeds on this basis unless you
say otherwise.

If you *do* confirm redistribution rights before this ticket runs, the
alternative is: keep them, add a `THIRD_PARTY_ASSETS.md` documenting the
source/license for each, and add the standard nominative-fair-use trademark
disclaimer to the README (Sennheiser, Santa Cruz are named product/brand
references either way).

Whichever path: do it **before** the repo goes public, not as a follow-up —
git history would still contain the original files after a later deletion
commit (a `git filter-repo`/BFG pass would be required to remove them from
history if the replace decision comes after an initial public push).

## 2. Untracked directory — confirm exclusion

`Videos Post linkedin/` (containing `Deixis/` and `Viewpoint Control/`
subdirectories) is currently untracked but present in the working tree. It
reads as personal video content, not project source. Recommendation: add an
explicit `.gitignore` entry for it (don't rely on it staying untracked by
accident) so a future `git add -A` can't sweep it in.

## 3. License recommendation

No `LICENSE` file and no `license` field in `package.json` today (`"private":
true"` is an npm/Vercel publish-prevention flag, not a license statement).

**Decided: Apache-2.0**, over MIT, specifically because this project's value
proposition is a set of *adapters* touching other companies' systems
(Onshape, Teamcenter, Cloudflare, Microsoft) — Apache-2.0's explicit patent
grant and patent-retaliation clause give enterprise legal teams more comfort
than MIT's silence on patents, and most large-corp OSS-consumption policies
already have Apache-2.0 pre-approved. There's a clearly better technical
answer here for this project's shape, so this proceeds without waiting on
confirmation — flag it if you'd rather use something else.

## 4. New root files needed (Phase 0 of task breakdown)

- `LICENSE` (Apache-2.0, decided per §3)
- `CONTRIBUTING.md` — how to run locally (zero-account mock mode from
  `00-overview.md` principle 3), how to add a new adapter implementation, PR
  expectations, link to the contract-test requirement from `04-testing-and-ci.md`.
- `CODE_OF_CONDUCT.md` — standard Contributor Covenant is fine.
- `SECURITY.md` — see `03-security-and-secrets.md` §6.
- `CHANGELOG.md` — Keep a Changelog format, starting at the first tagged release.
- `.github/ISSUE_TEMPLATE/bug_report.md`, `feature_request.md`
- `.github/PULL_REQUEST_TEMPLATE.md`
- `THIRD_PARTY_ASSETS.md` — see §1, only if assets are kept.

## 5. README rewrite scope

The current `README.md` is a good *feature* description (viewpoint modes,
insight deck, controls) — keep that content, it's genuinely well-written. Add
the sections an OSS reader needs and doesn't currently have:

- **Quickstart** — clone, `npm install`, `npm run dev`, works with zero
  external accounts (mock mode).
- **Architecture** — one diagram (can reuse `01-architecture-and-master-config.md`'s).
- **Supported connectors table** — one row per adapter category, which
  implementations exist, link to `02-connector-adapters.md`.
- **Self-hosting** — link to `06-deployment-and-installation.md` / the
  eventual dedicated self-hosting guide.
- **Contributing / License / Security** — link the new files from §4.
- **Trademark disclaimer** — "Onshape," "Teamcenter," "Cloudflare," "Microsoft
  Teams/SharePoint," and any product names in kept 3D assets are referenced as
  integration targets; this project is not affiliated with or endorsed by
  those companies.

## 6. Pre-publish checklist (Phase 0, gates everything else)

- [ ] Asset provenance decision made and executed (§1)
- [ ] `Videos Post linkedin/` excluded via `.gitignore` (§2)
- [ ] `LICENSE` added, `package.json.license` set
- [ ] `gitleaks detect --source . --log-opts="--all"` run clean over full history
- [ ] `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `CHANGELOG.md` present
- [ ] README rewritten per §5
- [ ] Teamcenter/Teams credential-handling fixes from `03-security-and-secrets.md` merged (a public repo with a documented-but-unfixed plaintext-password pattern is worse than not documenting it at all)
