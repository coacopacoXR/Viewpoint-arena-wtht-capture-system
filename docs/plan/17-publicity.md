# Plan 17: getting Viewpoint Arena seen

Written 2026-09-26 at the user's request, next to the release plan
(`16-release.md`). **The user posts and announces everything themselves.**
Claude drafts, prepares assets, and checks facts. It never posts, emails or
publishes anywhere.

This plan lives in the private material. It isn't for the public repo.

---

## 1. What we are telling people (the message)

**One line:** *Self-hosted design reviews for hardware teams: look at the 3D
model together, and the decisions, risks and actions are captured for you.*

The three things that make it different, in the order people care about them:
1. **Decisions don't get lost.** Talk and point at the model; cards (risks,
   actions, rationale) and minutes come out of the meeting and land in a
   tracker that remembers them across sessions.
2. **Your designs stay in your building.** It installs on your own machine or
   server with one script. The AI (Whisper + a local model) can run fully
   offline. Nothing unreleased leaves the company.
3. **Explore alternatives without losing the thread.** A design review is a
   line of sessions; try a variant ("steel hinge pin"), then merge it back or
   drop it, with its reasons kept. Version control's idea, in engineers' words.

Supporting points: works with CAD and common 3D formats (STEP, glTF, OBJ, STL
…), moves and hides individual parts with undo, accounts or SSO, an admin
console, backups built in, open source (Apache-2.0).

**Honesty rule:** every claim must be true of the released version. State the
limits (same-network calls, self-signed certificate, weak minutes from the
small built-in AI, no speaker separation). Engineers trust a tool that says
what it can't do.

**Research angle:** it grows out of the user's PhD thesis *"Collaborative
Technologies in Engineering Design Reviews"* (University of Skövde, 2026).
That's the credibility: the design choices come from studied design reviews,
not guesses. Keep the research framing in every channel that fits it.

## 2. Who it is for, and where they are

| Audience | What they care about | Where to reach them |
|---|---|---|
| Hardware / mechanical engineers and design review leads | decisions not lost, less admin after meetings, CAD support | LinkedIn, r/MechanicalEngineering, r/engineering, r/cad, Onshape and SolidWorks communities, engineering Slack/Discord groups |
| Engineering managers, PLM / IT people in industry | self-hosted, data stays inside, SSO, backups, works next to their PLM | LinkedIn (long post + article), personal network from the PhD and industry partners |
| Self-hosting and open-source crowd | one-script install, Docker, local AI, no cloud | r/selfhosted, r/opensource, Hacker News (Show HN), Mastodon |
| 3D / web developers | three.js + React Three Fiber + real-time multiplayer | r/threejs, three.js forum ("Showcase"), PartyKit/Cloudflare community, dev.to |
| Researchers (design reviews, CSCW, XR in engineering) | a real, open system built on the thesis | the paper (see §6), ResearchGate, the university's channels, conference demos |

## 3. What to make (assets)

Claude drafts or prepares; the user records voice and face, approves every word.

1. **Demo video, 60–90 s** (the one asset everything links to). Script:
   - problem (5 s): "Design reviews end, and the decisions live in someone's notebook.";
   - open a review, the model, two people pointing (15 s);
   - talk → cards appear → minutes (20 s);
   - explore a variant, move a part, merge it back (20 s);
   - tracker across sessions (10 s);
   - "self-hosted, open source, one install" + link (10 s).

   Use the new neutral sample model, **never** the branded headphones or bike.
   Record it on a clean demo review made for this, with made-up names.
   Captions burned in (most people watch muted).
2. **Short clips (10–20 s each), cut from the demo:** pointing → card appears;
   variant → merge; part move with undo. For LinkedIn, X, Reddit, where video
   autoplays.
3. **Screenshots (4–6):** lobby with previews, room with model and cards,
   session map with variants, tracker, admin console. They double as README
   images. Same demo data.
4. **README** (from `16-release.md` §3.5): the landing page for every link.
5. **A launch article**, about 800–1 200 words, for LinkedIn Articles and dev.to /
   Medium: *"Why design review decisions get lost, and what I built after a PhD
   on it."* Story, then what it does, then the research behind it, then how to
   try it, then limits, then what's next.
6. **A "Show HN" post** (title + first comment): plain and technical, no hype.
   Title: *"Show HN: Viewpoint Arena – self-hosted 3D design reviews that
   capture decisions."*
7. **A one-page PDF** for companies and PLM people: problem, what it does,
   security/self-hosting, how to pilot it, contact.
8. **GitHub repo polish:** description, topics (`design-review`, `cad`,
   `threejs`, `self-hosted`, `collaboration`, `engineering`, `webrtc`,
   `local-ai`), social preview image, a pinned "Roadmap" issue, and "good first
   issue" labels on 3–5 real small tasks.

The existing `Videos Post linkedin/` folder (Deixis, Viewpoint Control) has the
user's earlier clips. Reuse what still matches the current app. Anything
showing the branded models or old UI is out.

## 4. Timeline

**Two weeks before (T–14 → T–1):**
- Release done (plan 16). Demo review and demo data ready. Video, clips,
  screenshots, article, HN text, one-pager drafted and approved.
- Teaser on LinkedIn (T–7): a 15-s clip, "something I've been building since
  my PhD, releasing next week." No link yet.
- Warm up: tell 10–20 people personally (thesis colleagues, industry contacts,
  supervisors) the date, and ask if they'd try it and share honest feedback.
- Make sure the repo answers the first questions without you: install guide,
  limits, how to report issues.

**Launch day (T), a Tuesday or Wednesday, morning European time, which is
also early US morning for HN:**
1. GitHub release published (user).
2. LinkedIn: main post with the demo video + link, then the article.
3. Show HN (user posts; stays around for 3–4 hours to answer comments).
4. Reddit: r/selfhosted and one engineering subreddit. Read each sub's
   self-promotion rules first. Post as a person sharing their work, not an ad.
5. Personal messages to the people from the warm-up.

**After (T+1 → T+30):**
- Answer every issue and comment within a day in the first two weeks.
- T+3: r/threejs + three.js forum showcase (the tech angle).
- T+7: a short post on what people asked and what's changing (shows it's alive).
- T+14: a second clip (variants or CAD import) + a small release (0.1.1) with the
  first fixes from feedback.
- T+30: look at the numbers (§5), decide what worked, plan the next push around
  the paper (§6).

## 5. How to tell if it's working

Track weekly in a simple list:
- GitHub: stars, forks, clones/visitors (Insights → Traffic), issues opened by
  strangers, first outside pull request.
- People who actually installed it (issues and messages mentioning their setup).
- LinkedIn: views, and **messages from companies** (the signal that matters most).
- HN/Reddit: comments that ask real questions (vs. upvotes).

Targets for the first month (modest, to have something to compare against):
100 stars, 10 people who install it, 3 companies that ask about a pilot, 1
outside contribution.

## 6. The paper, and why the order matters

The paper (`docs/paper/README.md`) is meant to give the release academic
credibility. Some venues consider a system "already published" once it is
publicly described in detail, and double-blind review needs the authors to be
unidentifiable. **Before launching publicity, the user should decide the
venue and check its rules on prior publication and preprints.** Options:
- launch the software now and cite the thesis only (safe; the thesis is already
  public), then submit the paper describing the evaluation;
- or submit the paper first, launch after acceptance / arXiv preprint.

Claude can check a named venue's policy on request. Once the paper is out,
it's a second launch moment: a LinkedIn post, a README "Research" section with
the citation, and outreach to design-review / CSCW researchers.

## 7. Guardrails
- No branded products, real company names, or real colleagues' names in any
  video, screenshot or post without their permission.
- No numbers that weren't measured. No "enterprise-ready" claims the security
  review (plan 16 §3.4) hasn't backed.
- Every link points to the new public repo (plan 16, route decided by D9).
- Credit the research and anyone who helped. Don't over-claim the AI; say it
  runs locally and what it can't do.
- The user posts everything. Claude drafts in `docs/plan/publicity/` (private)
  and never contacts anyone.
