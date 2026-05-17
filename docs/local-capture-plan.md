# Local-First Capture System — Implementation Plan

> Status: **PLAN ONLY — not implemented**. The current capture (`DialogueEngine.tsx`,
> the procedurally-generated `insightCards`) is a simulation. This document is the
> roadmap for replacing it with a real, locally-hosted speech-to-insight pipeline
> that each organization runs entirely on its own infrastructure.
>
> Goal: an IT admin gets a one-command install, and from then on the design-review
> app captures meetings into structured Risks / Actions / Rationales without any
> audio, transcript, or model data ever leaving their network.

## Why server-side, locally-hosted

- **Privacy / IP**: orgs doing real design reviews won't send proprietary CAD or
  conversation to OpenAI/Anthropic. A self-hosted stack is the only way this gets
  past procurement at any serious engineering shop.
- **Cost**: zero per-meeting cost once the box is provisioned.
- **Determinism**: pinned model versions, reproducible extractions for research.
- **PhD framing**: positions the project as a *vendor-neutral, locally-hosted AI
  capture layer for collaborative design review* — much stronger thesis claim
  than a cloud-API wrapper.

## Architecture

```
┌───────────────────────────────────────────────────────────────────┐
│                       org-internal network                         │
│                                                                    │
│  ┌──────────┐ ws+audio ┌──────────┐  http   ┌─────────────────┐  │
│  │ browser  │─────────▶│ PartyKit │────────▶│ capture-service │  │
│  │ (Vite    │◀─────────│  room    │◀────────│  (Python/Node)  │  │
│  │  app)    │ insights │  server  │ insights│                  │  │
│  └──────────┘          └──────────┘         └────────┬────────┘  │
│       │                                              │            │
│       │                                              ▼            │
│       │                                    ┌──────────────────┐   │
│       │                                    │  faster-whisper  │   │
│       │                                    │   (STT, HTTP)    │   │
│       │                                    └──────────────────┘   │
│       │                                              │            │
│       │                                              ▼            │
│       │                                    ┌──────────────────┐   │
│       │                                    │  Ollama          │   │
│       │                                    │  (LLM, HTTP)     │   │
│       │                                    │  + n8n (opt.)    │   │
│       │                                    └──────────────────┘   │
│       │                                                           │
│       │                                                           │
│       ▼                                                           │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │ Postgres  (self-hosted Supabase OR plain Postgres)        │    │
│  │ - review_curations / tracker_* tables (already defined)   │    │
│  └──────────────────────────────────────────────────────────┘    │
└───────────────────────────────────────────────────────────────────┘
```

Everything in the box is on the org's LAN. The browser never reaches the public
internet for capture functionality (it still needs to load the static frontend,
which can also be served from the same box).

## Components

### 1. `capture-service` (new)

A small HTTP/WebSocket service. Recommended: **Python + FastAPI** (best whisper /
ML ecosystem) or **Node + Fastify** if you want one language across the stack.

Responsibilities:
- Accept audio chunks (WebSocket) tagged with `{roomId, speakerId, slideId,
  cameraPose, hoveredPartName, laserTargetPartName, timestamp}`.
- Buffer audio per speaker, forward to whisper for streaming transcription.
- Maintain a rolling transcript window with speaker labels.
- On trigger (slide change, silence ≥ N seconds, manual button, or every N
  seconds), call the LLM with the windowed transcript + current spatial
  context to extract structured insights.
- POST extracted insights back to PartyKit, which broadcasts them to the room.
- Optionally write transcripts + insights to Postgres for the Tracker.

Why a separate service (not inside PartyKit): PartyKit on Cloudflare Workers
can't run native ML deps. Even self-hosted PartyKit shouldn't carry GPU
workloads. Clean separation: PartyKit handles state + relay; capture-service
handles inference.

### 2. `faster-whisper` server

Run as its own HTTP server. Real-time on CPU with `base.en` or `small.en`,
much better with a modest GPU. Use the
[`whisper-asr-webservice`](https://github.com/ahmetoner/whisper-asr-webservice)
container or roll a tiny FastAPI wrapper.

Alternatives to consider: `whisper.cpp` (lighter, C++ binary), `WhisperX`
(better diarization).

### 3. Ollama

Standard install. Pre-pull recommended models during the install script:
- `deepseek-r1:7b` (default — solid extraction, runs CPU-only in a pinch)
- `qwen2.5:7b-instruct` (alternate for tool-calling)
- `llama3.1:8b-instruct` (alternate)

Hardware guide (document this in the install README):
- 7B models: 8GB+ RAM, CPU-only viable but slow (~5–10s per extraction)
- 13B–14B: 16GB+ RAM, GPU recommended (~1–3s)
- 32B (DeepSeek-R1-distill): 24GB+ VRAM strongly recommended

### 4. n8n (optional)

For orgs that want to edit the prompt or chain (e.g., "extract risks → cross-
check against ISO standards DB → tag with department"), n8n provides a visual
flow editor. capture-service has a `--use-n8n <webhook-url>` mode that sends
the transcript + context to n8n and reads the structured insights back from
the response. Without `--use-n8n`, it calls Ollama directly.

### 5. Provider abstraction in the frontend (`lib/`)

Two new TypeScript interfaces, swap by user config:

```ts
// lib/capture/types.ts
interface CaptureProvider {
  extractInsights(
    transcript: TranscriptChunk[],
    context: SlideContext,
  ): Promise<InsightCard[]>;
}

interface TranscriptionProvider {
  startStream(onPartial: (text, speakerId) => void): Promise<StreamHandle>;
}
```

Implementations to ship:
- `MockProvider` — current behavior, default for sandbox/demo mode.
- `LocalCaptureProvider` — talks to capture-service over WebSocket. The
  production path.
- `OllamaDirectProvider` — for orgs that want to skip capture-service and
  just hit Ollama directly from the browser (LAN only, weaker, no
  transcription — bring-your-own).
- `OpenAIProvider`, `AnthropicProvider` — for orgs that *do* allow cloud,
  shipped for completeness.

User config: a Settings panel ("Capture backend") with the provider picker,
endpoint URL(s), model name, optional API key. Stored in localStorage.

## Installation: one-command install for IT

Target: a single command that takes a fresh Ubuntu/Debian box (or macOS dev
machine) from zero to running stack in under 15 minutes.

### Approach: docker-compose + bootstrap script

```bash
curl -fsSL https://<your-host>/install.sh | bash
```

`install.sh` does:
1. Detect OS (Linux/Mac), abort cleanly on Windows with WSL guidance.
2. Install Docker + Compose if missing (`get.docker.com`).
3. Clone or download the release tarball (`viewpoint-arena-v1.x.tar.gz`).
4. Generate `.env` with random secrets and prompt for:
   - Public hostname (e.g., `arena.internal.acme.com`)
   - Whether to enable the GPU profile (`--profile gpu`)
   - Which LLM model to pre-pull (default: `deepseek-r1:7b`)
5. `docker compose --profile <cpu|gpu> up -d`.
6. Run `ollama pull <model>` inside the Ollama container.
7. Apply the SQL migration to the Postgres container.
8. Print final URLs:
   - App: `http://<hostname>/`
   - PartyKit: `ws://<hostname>:1999`
   - Capture service: `http://<hostname>:8080`
   - n8n (if enabled): `http://<hostname>:5678`

### `docker-compose.yml` services

- `app` — nginx serving the Vite-built `dist/`
- `partykit` — PartyKit dev server in node mode (or, alternative: deploy
  PartyKit to their own Cloudflare account — keep both options documented)
- `capture-service` — the new Python/Node service
- `whisper` — `faster-whisper-server` image
- `ollama` — `ollama/ollama` image, volume-mounted model cache
- `postgres` — `supabase/postgres` (or plain `postgres:16` for the lighter
  variant — Supabase Realtime is optional in fully-local mode)
- `n8n` — `n8nio/n8n`, behind `--profile n8n` so it's opt-in
- `nginx-proxy` — terminates TLS with self-signed certs by default, or
  Let's Encrypt if a real domain is provided

Profiles to support: `cpu`, `gpu` (NVIDIA Container Toolkit required), `no-n8n`,
`no-whisper` (browser fallback only).

### Alternative for advanced users: bare-metal systemd

For orgs that don't run Docker, provide a `bare-metal-install.sh` that:
- Installs Ollama via its official script
- Sets up Python venv for capture-service, installs requirements
- Drops systemd unit files for each service
- Starts everything

Same final result, more moving parts. Document but recommend docker-compose
for everyone except greybeard admins.

## Data flow during a meeting

1. Host clicks "Start capture" in the Manager workspace.
2. Browser requests mic permission → opens a WebSocket to PartyKit with a
   `CAPTURE_AUDIO` message containing PCM/Opus chunks + spatial context every
   ~200ms.
3. PartyKit forwards the chunks to capture-service over an internal WS.
4. capture-service feeds audio to whisper, gets back partial transcripts. It
   broadcasts partials back to PartyKit → browser ("speaker X is saying...").
5. Every N seconds (or on slide-change event from `agendaIdx`), capture-
   service calls the LLM with `{transcript window, current slide title +
   notes, attached viewpoints/pins, who said what}` and asks for structured
   `Risk[] | Action[] | Rationale[]` via tool calling.
6. Extracted insights are POSTed to PartyKit, which broadcasts
   `INSIGHT_CARD` (the existing message type) to all participants.
7. Existing UI surfaces handle the rest (Manager workspace triage,
   transcript pane, comment sync).

## Data persistence

Two modes:
- **Cloud Postgres** (current): hosted Supabase. capture-service writes
  transcripts and insights via the same anon-key path.
- **Self-hosted Postgres** (new): swap `VITE_SUPABASE_URL` to point at the
  local Supabase container. Same SQL schema works unchanged — that's why
  the existing tables (`tracker_*`, `review_curations`) are designed
  vendor-neutral.

## Open questions to decide before building

- **Audio format on the wire**: raw PCM (simple, larger) vs Opus (compressed,
  needs encoder in browser + decoder in service)?
- **Speaker diarization**: rely on WhisperX (slower, better) or trust who-
  has-the-mic-active from the WebRTC layer (faster, less accurate)?
- **Extraction trigger policy**: every N seconds (predictable, may waste
  compute), or event-driven (on silence ≥ Xs / slide change / explicit
  button)? Probably hybrid — slide change + ≥30s of new content.
- **Per-org model defaults**: do we ship 1 model and let them swap, or
  default to 2-3 and let admin pick at install? Probably default `deepseek-
  r1:7b` and document the swap.
- **Auth for capture-service**: shared secret in the docker-compose `.env`,
  validated on every PartyKit→service request. Skip JWT for v1.
- **Resource ceilings**: docker-compose `cpus:` and `mem_limit:` defaults
  so a runaway model doesn't take down the host.

## Estimated work

Rough scope, in days of focused work (one person):
- `CaptureProvider` / `TranscriptionProvider` interfaces + `MockProvider`
  refactor (no behavior change): **1 day**
- `LocalCaptureProvider` browser-side (WebSocket audio streaming, settings
  panel): **2 days**
- `capture-service` skeleton (FastAPI, whisper integration, audio
  buffering, transcript window): **3 days**
- LLM extraction pipeline (Ollama client, prompt engineering, structured
  output, spatial context fusion): **3 days**
- PartyKit message types + relay logic for audio + insight broadcast:
  **1 day**
- `docker-compose.yml` + `install.sh` + bare-metal alternative: **2 days**
- n8n integration (optional flow templates): **1 day**
- End-to-end testing on a fresh box, docs, hardware sizing guide:
  **2 days**

**Total ~ 15 days of focused work** for v1.

## Strong suggestion for the first iteration

Don't try to ship everything at once. The minimum-viable-real-capture is:

1. Skip live transcripts. Browser records the whole meeting locally,
   uploads the audio file at meeting-end.
2. capture-service runs whisper on it (batch, not streaming) and produces a
   transcript with rough speaker labels.
3. LLM does one pass extraction on the full transcript + the full agenda
   context.
4. Insights drop into the Manager workspace as a "post-meeting summary"
   that the host triages.

That's ~1 week of work, requires no audio streaming, no live extraction
choreography, and gives 80% of the perceived value. Then iterate toward
live capture once the offline path is rock solid.
