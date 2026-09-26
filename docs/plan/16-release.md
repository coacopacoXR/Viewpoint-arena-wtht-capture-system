# Plan 16: the public release

Written 2026-09-26 at the end of a long session, for a NEW Claude Code session to
pick up. The user said: "it works great, I think it might be time to release it"
and asked for a plan.

Read this file first, then `EXECUTION-LOG.md` (the history), then act. Talk to
the user in plain, everyday language (see memory `feedback_plain_language`).
Decide technical questions yourself; ask the user only about the decisions
listed in §2.

---

## 1. Where things stand

- **Code:** everything is on branch `planning/oss-enterprise-readiness`, pushed
  to `github.com/coacopacoXR/Viewpoint-arena-wtht-capture-system`. It is 158+
  commits ahead of `main`. `main` still sits at an old commit (`27165ba`).
  The user's standing rule: **push to the planning branch, never to main**,
  until they say otherwise.
- **The repository is already public on GitHub**, and the planning branch is
  visible there.
- **Checks:** typecheck clean, lint 0 errors / 29 warnings, ~4 400 unit tests
  pass, build OK, `check:env` OK, CI (10 jobs incl. gitleaks) green on the last
  runs.
- **Live install:** `~/viewpoint-arena` inside WSL Ubuntu-24.04 on the user's PC,
  accounts mode, test at `https://192.168.1.134`. The user's own account
  (`coacopaco@gmail.com`) is the admin. It runs the pushed branch.
- **Backups:** the install now backs itself up (`db-backup` service: database +
  model files every 24 h, keep 14; `docker compose logs db-backup`;
  `/api/health` → `backup`). A restore has **never** been run for real.
- **Qwen:** its monthly quota ran out on 2026-09-26 and resets 2026-10-08 16:00
  UTC. Until then, do the work yourself.
- **Data-loss incident, 2026-09-26:** a test clean-up rule that was too broad
  deleted the user's own review "Untitled Review", their recent meetings, and
  (probably) ~40 older reviews. There was no backup. Memory
  `feedback_test_data_cleanup` has the rule that followed: **delete only what
  `@example.com` test accounts own, by id, and back up first.** The user was
  told and accepted it; don't bring it up again unless asked, but never repeat it.

### Tools left for you (git-ignored, in `.qwen-tasks/`)
- `.qwen-tasks/ops/README.md`: deploy the install, back it up, safe test clean-up,
  run SQL. Read it before touching the install.
- `.qwen-tasks/e2e-lib.mjs`: Playwright helpers (sign up a test account, create a
  review, import a model, move a part, query the database).
- `.qwen-tasks/variants-e2e.mjs`: the 24-check live variant acceptance test
  (≈ 11 min; run it in the background). It passed 24/24 on 2026-09-26.
- Before any live test: `backup-now.sh`. After it: `cleanup-test-data.sh`.

---

## 2. Decisions only the user can make

Ask these together, early, with a recommendation for each (AskUserQuestion). Do
the work in §3 that does not depend on them while waiting.

| # | Decision | Recommendation to offer |
|---|---|---|
| D1 | **Version and label**: "0.1.0 preview" or "1.0". | 0.1.0, labelled a preview: identity, variants and backups are days old. |
| D2 | ~~Private material~~ **DECIDED 2026-09-26 by the user: "only publish the relevant files for people to install it, not the plans, the paper thing and all that."** See §3.0. Still to ask: also scrub them from git history (needs D3)? | Yes, in the same rewrite as D3. |
| D3 | **History rewrite.** Removing the branded models (§3.1) and D2's files from history means `git filter-repo` + force-push, which breaks every clone/fork. Do it, once, right before the announcement? | Yes, once, just before announcing, after everything else is merged. |
| D4 | **Security review before or after the announcement** (§3.4). | Before. It is a tool for unreleased product designs. |
| D5 | **Licence**: the repo is Apache-2.0. Keep it? | Keep, unless the user has a reason (e.g. university IP rules for the thesis). Ask about that. |
| D6 | **Replacement sample model(s)**: a plain cube (decided 2026-09-17), or something nicer they own (e.g. a simple bracket they model)? | Cube now; a nicer own model can follow. |
| D7 | **Where it lives**: keep the repo name `Viewpoint-arena-wtht-capture-system` or rename (e.g. `viewpoint-arena`) before announcing? | Rename before the announcement if they want it; GitHub redirects the old URL. |
| D8 | **Commit email.** All 267 commits carry `coacopaco@gmail.com`, visible to anyone. Replace it with the GitHub "noreply" address in the same history rewrite (a `.mailmap` / `--mailmap` in filter-repo), and set it for future commits? | Yes. The user finds their noreply address under GitHub → Settings → Emails. |

---

## 3. The work

Order: 3.0b checklist to the user early (they can revoke keys any time) → 3.2 → 3.3 → 3.4 → 3.5/3.6/3.7 → 3.0 + 3.1 → 3.8 (the user's part) last. Each step: do it, test it
live where it touches the product, run the full checks, commit to the planning
branch, push, and tell the user in plain words.

Full checks = `npm run typecheck && npm run lint && npm run test && npm run build && npm run check:env`,
plus `capture-service/.venv/Scripts/python.exe -m pytest -q` when the Python
service changes.

### 3.0 Only what people need to install and run it (D2)
The user wants the public repository to contain only what someone needs to
install, run, understand and contribute to the app. Not the plans, not the
paper, not the delegation specs.

**Leave out of the public repo** (move to a private repo the user owns; Claude
prepares the move, the user creates the private repo):
- `docs/plan/`: plans, execution logs, delegation specs, sketches. It contains
  the user's email, admin account, Ubuntu user, home IP, and test names.
- `docs/paper/`: thesis notes.
- `docs/ACTION_TRACKER_ROADMAP.md`, `docs/MULTIPLAYER_ROADMAP.md`,
  `docs/local-capture-plan.md`: internal roadmaps. Read each first: move
  anything a user needs (e.g. how local capture works) into user docs.
- `metadata.json` at the root: check what it is (it looks like an AI-studio
  leftover); remove it if nothing uses it.
- The stray `sennheiser_momentum_4_headphones.glb` at the root (see 3.1).
- Code comments that cite `docs/plan/...` stay harmless but point nowhere once
  the folder is gone. Rewrite the ones in user-facing docs; leave code
  comments unless they read as broken.

**Keep:** the app (`components/`, `pages/`, `lib/`, `api/`, `party/`,
`server/`, `utils/`, `types/`, root config files), `capture-service/`,
`deploy/`, `install.sh`, `docker-compose*.yml`, `.env.example`,
`viewpoint.config.example.ts`, `scripts/`, all tests (`__tests__`, `e2e/`,
`test/`), `.github/`, `docs/INSTALL.md`, `docs/README.md`,
`docs/supabase-schema.sql`, `docs/adapters/`, and README, LICENSE, CHANGELOG,
CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, THIRD_PARTY.

**Make sure local-only things can never be added:** `.gitignore` already
covers `.env.local`, `.qwen/`, `.qwen-tasks/`, `Videos Post linkedin/`,
`test-results/`. Add `.claude/` (Claude Code's local settings are in this
project folder and are NOT ignored today; never committed so far). Add a CI
step that fails if `docs/plan/` or `docs/paper/` reappear on `main`.

**Order matters:** this plan and the execution log live in `docs/plan/`.
Before the removal commit, the user creates the private repo and Claude copies
`docs/plan/` and `docs/paper/` into it (with their history if the user wants,
via `git subtree split` or a filter-repo'd copy) and confirms it's there. Also
keep a plain copy outside the repo folder. Update Claude's memory files to
point at the new location.

**How it reaches the public:** the removal is a normal commit on the planning
branch (the files stay in the private repo). Removing them from HISTORY is part
of the user's rewrite (D3, §3.8).

### 3.0b The user's accounts and keys: inventory and clean-up
The user: "remove all my tokens/accounts that I have used here in case
something slips." Checked 2026-09-26 (names only, no values ever printed):
**a secret scan of the full git history of every branch is clean**, `.env.local`
is git-ignored, and no AI provider keys are stored in the admin console.

Claude's part: prepare a checklist with one line per item, what it is, where it
lives and how to revoke it, and remove local copies from files when the user
says so. **The user revokes the external ones** (they need the user's logins).

| # | What | Where it lives | What to do |
|---|---|---|---|
| K1 | Old Supabase project keys (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) | `.env.local` (git-ignored) | The project seemed gone in September. User: confirm it's deleted in the Supabase dashboard. Then delete the lines from `.env.local`. |
| K2 | Onshape OAuth app (`ONSHAPE_CLIENT_ID`, `ONSHAPE_CLIENT_SECRET`) | `.env.local` | User: in the Onshape developer portal, rotate the secret, or delete the app if unused. Then clear the lines. |
| K3 | PartyKit cloud host (`VITE_PARTYKIT_HOST`) | `.env.local` | If a cloud PartyKit project exists on the user's account, delete it (the self-hosted install doesn't need it). |
| K4 | Cloudflare Realtime TURN keys (see commit `27165ba` on main) | Cloudflare dashboard, maybe a Vercel project's env vars | User: revoke the TURN key if nothing uses it, and remove the Vercel project/env vars if there is an old deployment. |
| K5 | GitHub push access | Windows Credential Manager (git), any personal access tokens | After release: revoke tokens not needed (GitHub → Settings → Developer settings), and check 2FA is on. |
| K6 | Qwen Code login / API key | `~/.qwen/` on the PC (not in the repo) | When no longer delegating: `qwen` logout, or revoke the key in the provider's console. |
| K7 | The install's own secrets (`JWT_SECRET`, `POSTGRES_PASSWORD`, `CAPTURE_SHARED_SECRET`, `COTURN_SHARED_SECRET`, `ANON_KEY`, the access password hash, …) | `~/viewpoint-arena/.env` in WSL | Generated by the installer, local only, never in git. Nothing to do unless the file was ever shared. If so, reinstall to regenerate. |
| K8 | Accounts on the install: `coacopaco@gmail.com` (admin), `pousita@guapa.esse`, `estelapere@ff.se` | the install's database | Ask the user which to keep. Delete the others through the admin console (People), never by SQL. |
| K9 | The commit email `coacopaco@gmail.com` on every commit | git history | D8. |
| K10 | Personal details inside `docs/plan/` | git history | D2/D3. |

Before the user's rewrite, Claude re-runs the full-history scan (`gitleaks git
--log-opts=--all`, see `.qwen-tasks/ops/`) and a search for the user's email,
names and `192.168.1.134`, and shows the user what's left.

### 3.1 Branded models out (needs D3, D6)
- `components/Scene/sennheiser_momentum_4_headphones.glb`,
  `components/Scene/santa_cruz_v10_dh_bicycle.glb`, and the stray copy
  `sennheiser_momentum_4_headphones.glb` at the repo root are real commercial
  products. Replace the "Headphones" / "Bicycle" samples with the D6 model(s);
  keep "Synth assembly". Search the code and tests for both names
  (`Headphones`, `Bicycle`, `sennheiser`, `santa_cruz`) and update samples, tests,
  docs, the lobby's "Try a sample" and `THIRD_PARTY.md`.
- The live acceptance test uses the bike as its model: switch it to an imported
  test file you create (any small GLB with several named parts; build one with
  three.js' GLTFExporter in a node script and keep it under `e2e/fixtures/`).
- History: removing the files from git history is the USER's step (§3.8, step
  3). Claude prepares the commands (`git filter-repo --path-glob '*.glb'
  --invert-paths`, plus D2's paths) and the checklist; the user runs them. It
  was done once before for commit attribution on 2026-09-17 (see
  EXECUTION-LOG). Afterwards Claude re-points the WSL install's clone.

### 3.2 A fresh install, followed like a stranger would
- The install guide (`docs/INSTALL.md`, `install.sh`) has not been followed end
  to end since accounts, variants and backups were added.
- Do it in a clean place: a second WSL distro (`wsl --install -d Ubuntu-22.04`
  or `wsl --import` a fresh one) or a throwaway folder + fresh Docker volumes
  (different compose project name). NEVER touch `~/viewpoint-arena` or its
  volumes for this.
- Follow the guide word for word, both "no accounts" and "accounts" modes.
  Record every place a newcomer would get stuck; fix the guide or the installer.
- Acceptance: a new person can go from nothing to a working review with a
  model, a meeting, a card and a variant, using only the guide.

### 3.3 A real restore (on the throwaway install from 3.2, not the user's)
- Create data, let `db-backup` write a backup, delete the data, run
  `deploy/backup/restore.sh <file> --yes`, confirm everything is back
  (reviews, lines, sessions, cards, accounts, and that sign-in still works).
- Also restore the model files from `models-*.tar.gz` and confirm a model
  opens. Fix `restore.sh` / the guide as needed.
- Only then tell the user backups are proven.

### 3.4 Security review (D4)
Focused, written up as `docs/plan/16-security-review.md` with each finding,
its severity and its fix. Known soft spots to start from:
- Row level security still lets the public anon key INSERT/UPDATE
  `tracker_sessions`, `tracker_items`, `review_curations` (UPDATE), and some
  others, for mode-none compatibility (`docs/supabase-schema.sql`). With
  accounts on, these should go through the api or be tied to `auth.uid()`.
  Attack it the way BC's review_members fix was attacked (curl with the anon key).
- Mode none: anyone who passes the front-door password can delete reviews
  (`api/reviews/delete.ts`), start/merge/drop variants (`api/reviews/lines.ts`
  trusts an `isMeetingHost` claim). Document clearly as the mode-none trust
  model, or require the access cookie on those endpoints
  (`api/_lib/accessControl.ts` has helpers nobody calls there).
- `RECORDING_STATE` is not host-enforced on the room server (noted by batch BU).
- The room server's SCENE_SEED / SCENE_UPDATE validation (sizes, counts) and
  TRANSCRIPT_KEEP permission: re-check against a hostile client.
- Uploads: model file size limits, content-type handling, the CAD converters
  (OCCT wasm) on hostile files.
- Headers: CSP, HSTS, cookie flags in `deploy/nginx`. Secrets: confirm nothing
  sensitive in the browser bundle (`check:env` covers VITE_ vars) and run
  gitleaks over the full history.
Fix what is cheap and serious; list the rest in SECURITY.md's "Known
limitations".

### 3.5 The public face
- **README.md**: what it is (one paragraph), a short GIF or 3–4 screenshots
  (lobby, room with a model and cards, the session map with variants, the
  tracker), quick start = the install guide, what works offline/self-hosted,
  honest limits (§3.7), licence, links. Screenshots from the live install with
  a demo review made for the purpose (by a test account; clean up after).
- **SECURITY.md**: replace the placeholder link
  `github.com/your-org/viewpoint-arena/security/advisories/new` with this repo's
  real URL (after D7), and enable private vulnerability reporting in the repo's
  GitHub settings (ask the user to click it; you cannot).
- **CHANGELOG.md**: it only describes the scaffolding. Write the 0.1.0 entry
  from `EXECUTION-LOG.md`: design reviews with lines/sessions/variants, the
  lobby, accounts/SSO, admin console, AI providers, recording choices and
  transcripts, part editing with undo, backups, audit trail.
- `package.json` version → D1's number. Tag `v0.1.0` after the merge to main.
- `CONTRIBUTING.md`: check it still matches (commands, branch model, tests).
- `THIRD_PARTY.md`: complete list of what is bundled or pulled at install:
  Qwen 2.5 (model licence), Whisper, OCCT/CAD libraries, three.js, drei,
  Supabase images, PartyKit, coturn, fonts; and the D6 sample model's origin.
- Hide or remove the tracker's "+ Demo Data" button in production builds.

### 3.6 Known limits, stated honestly (in README + INSTALL)
- Video calls work within one network; across the internet they need a TURN
  relay and a public address (not done).
- The installer's certificate is self-signed (one warning per device).
- No speaker separation in recordings (diarization); transcripts come in
  few-second chunks and can cut a sentence.
- The built-in 7B AI writes weak minutes and can invent details from little
  input (minutes from cards alone are built without it for that reason); a
  cloud provider in the admin console does better.
- Built-in samples cannot have their parts moved (only imported files).

### 3.7 Quality items (nice to have, not blockers)
- The 29 lint warnings (23 `any`, `exhaustive-deps`), the 1.2 MB main bundle
  (lazy-load more), dead code (`lib/curationsRepo.listRecentCurations`,
  `listArchivedIds`).
- Dependabot / renovate on the repo.

### 3.8 Merge and release: THE USER DOES THIS, Claude assists
The user, 2026-09-26: **"I wanna be the one making it public, I just want you
assist me, not doing it yourself."** So every step below that changes something
public, irreversible, or on GitHub is performed BY THE USER. Claude's job is to
prepare and guide: a written checklist, the exact commands to paste, what each
command does in plain words, what to check before and after, and how to undo
it. Then Claude waits for the user to say it is done, and verifies (e.g. CI
status, the install still working).

Claude may still do, on its own: work and commits on the planning branch, pushes
to that branch, tests on the user's machine, drafts (release notes, changelog,
security write-up) for the user to read.

Claude must NOT do, even if it seems helpful: merge to main, open or merge the
PR, run `git filter-repo`, force-push anything, create or push tags, create the
GitHub release, rename the repository, change repository settings, or post or
announce anything.

The sequence to prepare for the user:
1. Everything in 3.1–3.7 committed on the planning branch; CI green. Claude
   reports "ready for you" with a short summary of what changed.
2. **User:** open the PR planning → main in the browser (Claude gives the link
   and the PR text), wait for CI, merge.
3. **User:** the history rewrite (only if D3 = yes). Claude prepares a script
   and a step-by-step: take `backup-now.sh`; make a mirror backup of the repo
   (`git clone --mirror`); install `git-filter-repo`; the exact filter-repo
   command for the `.glb` files, `docs/plan/`, `docs/paper/` and the other §3.0
   paths, plus the `--mailmap` that replaces the commit email (D8); how to check the result
   (`git log --all -- '*.glb'` is empty); the force-push commands; what it means
   for existing clones. Claude then re-points the WSL install
   (`~/viewpoint-arena`) at the rewritten repo, after the user says the push is done.
4. **User:** rename the repo (D7) and enable private vulnerability reporting
   in Settings (Claude lists the clicks).
5. **User:** create the tag `v0.1.0` and the GitHub release. Claude drafts the
   release notes from the CHANGELOG for the user to paste and edit.
6. **User:** announce it, wherever and whenever they choose.

---

## 4. Rules that still apply
- **The user makes it public, not Claude** (§3.8). Claude never merges to main,
  rewrites history, force-pushes, tags, publishes a release, renames the repo,
  changes GitHub settings or announces anything. It prepares, explains and verifies.
- Push only to `planning/oss-enterprise-readiness`.
- Never publish secrets; JWT_SECRET / service-role keys never in the browser.
- Test live on the install for anything the user will touch; screenshots over
  assumptions. Back up before, clean up after, only `@example.com` data.
- Don't touch the user's account or anything they own on the install.
- Explain in plain words; keep them posted during long work.
