"""The transcript → InsightCard extraction prompt.

A port of lib/connectors/capture/extractionPrompt.ts. The TypeScript original is
the authority and this copy must stay byte-identical: OpenAI, Anthropic,
browser-side Ollama and this service all ask for the same payload precisely so
that one parser can validate all of them. tests/test_typescript_parity.py fails
the build if the two drift — if you change the prompt, change it in
extractionPrompt.ts first and re-copy it here.

Kept as a literal string rather than shared from a single source because the
two runtimes have no common module format; a parity test is the honest way to
keep a contract that crosses a language boundary.
"""

from __future__ import annotations

import math

from .schemas import SlideContext, TranscriptChunk

# Copied verbatim from EXTRACTION_SYSTEM_PROMPT in
# lib/connectors/capture/extractionPrompt.ts. Do not edit locally.
EXTRACTION_SYSTEM_PROMPT = """You are the insight-capture layer of a CAD design-review tool.

You are given a window of a real review meeting's transcript and the 3D context the speakers were looking at. Extract the durable engineering insights from it as structured data.

Capture exactly three kinds of insight:
- RISK: a concern about the design, with its consequence. Something that could go wrong.
- RATIONALE: why a design decision was made, what drove it, what was traded off.
- ACTION: a task someone committed to or asked for, with an owner or department when one was named.

Do NOT capture small talk, agenda logistics, or restatements of what a slide already says. If the window contains nothing worth capturing, return zero cards.

Never invent a fact that is not in the transcript. Quote the speaker's own reasoning in the description. Use the component names the speakers actually used.

OUTPUT FORMAT — this is a hard requirement:
Reply with a single raw JSON object and nothing else. No markdown, no code fences, no leading or trailing prose, no commentary. The JSON must parse with JSON.parse as-is.

{
  "cards": [
    {
      "type": "RISK" | "RATIONALE" | "ACTION",
      "title": "<= 8 words, a noun phrase naming the insight",
      "description": "1-3 sentences carrying the speaker's actual reasoning",
      "agentId": "the speakerId this insight came from",
      "relatedPoiId": "optional: the component name discussed",
      "sourceMessageIds": ["optional: the chunk labels, e.g. c3, c4"],
      "details": {
        "priority": "Critical" | "High" | "Medium" | "Low",
        "status": "Open",
        "componentReference": "optional: component name from the model tree",
        "impact": "RISK only: what breaks if this is not addressed",
        "mitigationStrategy": "RISK only: what was proposed to reduce it",
        "designDriver": "RATIONALE only: the requirement or goal behind the decision",
        "alternativesConsidered": "RATIONALE only: what else was on the table",
        "tradeoffAnalysis": "RATIONALE only: what was given up",
        "department": "ACTION only: owning department",
        "assignee": "ACTION only: owning person",
        "dueDate": "ACTION only: ISO 8601 date, only if one was stated"
      }
    }
  ]
}

Rules:
- Omit optional fields you have no evidence for. Do not fill them with guesses or empty strings.
- Do not emit "id" or "timestamp"; the application assigns those.
- Do not add any field that is not listed above.
- "priority" is required on every card. Judge it from the speaker's own emphasis: Critical only for safety, yield-blocking or schedule-blocking concerns."""


def format_ms(ms: float) -> str:
    """mm:ss, or '?' for a value that cannot be a timestamp.

    Same rendering as formatMs in extractionPrompt.ts, so the two services
    label the same chunk identically.
    """
    if isinstance(ms, bool) or not isinstance(ms, (int, float)):
        return "?"
    if not math.isfinite(ms) or ms < 0:
        return "?"
    total_seconds = int(ms // 1000)
    minutes = total_seconds // 60
    seconds = total_seconds % 60
    return f"{minutes:02d}:{seconds:02d}"


def format_transcript(transcript: list[TranscriptChunk]) -> str:
    """Render the transcript with stable per-chunk labels (c0, c1, …).

    The labels are what the model is asked to put in `sourceMessageIds`, so
    they are positional and must not change between the prompt and the parse.
    """
    return "\n".join(
        f"c{index} [{format_ms(chunk.start_ms)}-{format_ms(chunk.end_ms)}] "
        f"{chunk.speaker_id}: {chunk.text}"
        for index, chunk in enumerate(transcript)
    )


def build_extraction_user_prompt(
    transcript: list[TranscriptChunk], context: SlideContext
) -> str:
    """Build the user turn: spatial context first, then the labelled transcript.

    Context comes first so the model can attribute a comment to the part that
    was on screen, exactly as the TypeScript builder does.
    """
    lines = [f"Agenda item {context.agenda_idx}: {context.slide_title}"]
    if context.hovered_part_name:
        lines.append(f"A speaker was hovering over: {context.hovered_part_name}")
    if context.laser_target_part_name:
        lines.append(f"The laser pointer was on: {context.laser_target_part_name}")
    lines.extend(["", "Transcript window:", format_transcript(transcript)])
    return "\n".join(lines)
