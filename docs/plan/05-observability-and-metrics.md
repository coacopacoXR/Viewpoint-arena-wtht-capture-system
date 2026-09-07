# Observability & Metrics

## 1. Operational health

New `GET /api/health` (Vercel function; also exposed by the self-hosted `app`
container) — aggregates a check per *enabled* connector, returns per-connector
status so an IT dashboard or the install script's final "ready" check has one
URL to poll:

```json
{
  "ok": true,
  "connectors": {
    "plm": { "provider": "onshape", "status": "ok" },
    "capture": { "provider": "local", "status": "ok", "detail": "capture-service reachable" },
    "turn": { "provider": "cloudflare", "status": "ok" },
    "db": { "provider": "supabase", "status": "ok" }
  }
}
```

Each adapter interface (`02-connector-adapters.md`) gets an optional
`healthCheck(): Promise<{ ok: boolean; detail?: string }>` method; `/api/health`
calls it for whichever provider is configured. Disabled connectors are simply
omitted, not reported as failing.

## 2. Structured logging standard

- JSON logs, one object per line, from every server-side surface (`api/*`,
  `party/room.server.ts`, `capture-service`).
- Required fields: `timestamp`, `level`, `roomId` (when applicable), `event`.
- **Never** log a resolved secret value or full transcript/audio content by
  default — logging raw meeting content defeats the privacy claim in
  `03-security-and-secrets.md` §5. A `debug.logTranscripts` config flag,
  default `false`, can opt an org into verbose logging for their own
  troubleshooting — never on by default.

## 3. Capture pipeline metrics (once `local-capture-plan.md`'s pipeline is built)

- Transcription latency (audio-received → partial-transcript-emitted).
- Extraction latency (transcript-window-closed → insight-cards-returned).
- Extraction success/failure rate (LLM call failed, returned unparseable
  structured output, or returned zero insights for a non-trivial transcript
  window).
- Insight cards produced per meeting-minute — a rough usefulness proxy; a
  session producing zero cards over 10+ minutes of discussion is worth
  surfacing to the host as a signal something's misconfigured, not just a
  silent gap.
- **Speech-to-text accuracy (WER)**: cannot be automated in CI — there's no
  labeled ground-truth transcript dataset for this app's domain. Document as a
  **manual periodic QA task** instead: quarterly, run a fixed 10-minute
  reference recording through the pipeline and spot-check the transcript
  against a human review. Don't pretend this is a CI metric; it isn't one.

## 4. Realtime/WebRTC metrics

- ICE connection success rate (connected vs. failed/timeout) — the single
  most useful early-warning signal for TURN misconfiguration in a new
  deployment.
- TURN relay usage rate (relay vs. direct P2P) — cost and performance signal,
  especially relevant since the Cloudflare integration is metered.
- Reconnect count per session.

## 5. Product usage metrics — opt-in only, no default telemetry

Session count, average participants, tracker items created/resolved are
useful to the org running the deployment, but **must never phone home to us
(the OSS maintainers) by default.** Many enterprise adopters will not accept
any outbound telemetry from self-hosted infra, and assuming otherwise is the
kind of thing that fails a procurement security review outright. If we want
aggregate adoption metrics later, it must be an explicit, documented opt-in
toggle in `viewpoint.config.ts`, off by default, sending only counts (never
transcript/model content) to an endpoint we control.

## 6. Suggested lightweight stack

- Cloud-hosted deployment: rely on Vercel's built-in observability plus
  `/api/health` — no new infra needed.
- Self-hosted deployment: structured JSON logs (§2) are sufficient for v1;
  optionally expose a Prometheus-compatible `/metrics` endpoint on
  `capture-service` and the self-hosted PartyKit/coturn containers for orgs
  that already run Prometheus/Grafana. Don't build a bespoke dashboard —
  emit metrics in a standard format and let each org plug it into whatever
  they already have.
