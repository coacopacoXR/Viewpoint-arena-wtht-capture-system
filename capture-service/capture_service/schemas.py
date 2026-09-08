"""Wire shapes shared with the TypeScript app.

These models are the Python half of a contract that already exists in
TypeScript, and they are deliberately not free to drift:

  * `TranscriptChunk`  ↔ lib/connectors/capture/types.ts `TranscriptChunk`
  * `SlideContext`     ↔ lib/connectors/capture/types.ts `SlideContext`
  * `InsightCard`      ↔ types.ts `InsightCard`
  * `InsightDetails`   ↔ types.ts `InsightDetails`

Field names go over the wire in camelCase, exactly as the TypeScript types
spell them, because the browser client re-validates this service's responses
with the same strict parser it uses for the cloud path
(`validateExtractionPayload` in lib/connectors/capture/parseInsightCards.ts).
That parser rejects UNKNOWN KEYS, so a snake_case field or an extra
transport-metadata key on the response envelope is not a cosmetic difference —
it is a rejected response. tests/test_typescript_parity.py pins the key sets
against the TypeScript source.

Enums mirror the TypeScript string-literal unions value-for-value; parse_cards
derives its allowlists from them so a value cannot be legal in one place and
illegal in another.
"""

from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel, ConfigDict


def _to_camel(snake: str) -> str:
    head, *rest = snake.split("_")
    return head + "".join(word[:1].upper() + word[1:] for word in rest)


class WireModel(BaseModel):
    """Base for everything that crosses the HTTP boundary.

    `extra="forbid"` is a guard against this service silently growing a field
    the TypeScript parser would then reject on the client.
    """

    model_config = ConfigDict(
        alias_generator=_to_camel,
        populate_by_name=True,
        extra="forbid",
        frozen=True,
    )


class InsightType(StrEnum):
    RISK = "RISK"
    RATIONALE = "RATIONALE"
    ACTION = "ACTION"


class Priority(StrEnum):
    CRITICAL = "Critical"
    HIGH = "High"
    MEDIUM = "Medium"
    LOW = "Low"


class Status(StrEnum):
    OPEN = "Open"
    IN_REVIEW = "In Review"
    APPROVED = "Approved"
    REJECTED = "Rejected"


class DecisionRole(StrEnum):
    TRIGGER = "TRIGGER"
    RATIONALE = "RATIONALE"
    INTERMEDIATE_DECISION = "INTERMEDIATE_DECISION"
    FINAL_DECISION = "FINAL_DECISION"


class DesignStage(StrEnum):
    DETAILED_DESIGN = "DETAILED_DESIGN"


class TranscriptChunk(WireModel):
    """One speaker-labelled slice of a real transcript."""

    speaker_id: str
    text: str
    start_ms: int
    end_ms: int


# Batch mode has one SlideContext for the whole recording — the agenda item the
# host was presenting, or the meeting title. A blank value from the client is
# replaced with this rather than being passed to the model as an empty label.
DEFAULT_SLIDE_TITLE = "Full meeting recording"


class SlideContext(WireModel):
    """Where the review was, spatially, when the transcript was captured."""

    agenda_idx: int = 0
    slide_title: str = DEFAULT_SLIDE_TITLE
    hovered_part_name: str | None = None
    laser_target_part_name: str | None = None


class InsightDetails(WireModel):
    """Per-type detail fields of an InsightCard.

    `priority` is required and `status` defaults to Open, exactly as the
    TypeScript parser does: the Manager workspace triages on priority, and
    guessing one would invent an engineering judgement the model never made.
    """

    priority: Priority
    status: Status = Status.OPEN
    assignee: str | None = None
    due_date: str | None = None
    component_reference: str | None = None
    design_stage: DesignStage | None = None
    decision_role: DecisionRole | None = None
    impact: str | None = None
    mitigation_strategy: str | None = None
    design_driver: str | None = None
    alternatives_considered: str | None = None
    tradeoff_analysis: str | None = None
    department: str | None = None


class InsightCard(WireModel):
    """The unit the whole capture pipeline exists to produce."""

    id: str
    type: InsightType
    agent_id: str
    title: str
    description: str
    timestamp: int
    details: InsightDetails
    related_poi_id: str | None = None
    source_message_ids: list[str] | None = None
    affected_requirement_ids: list[str] | None = None
    kb_recommendations: list[str] | None = None


# ─── Response envelopes ─────────────────────────────────────────────────────
#
# Each response is EXACTLY its envelope and nothing else. api/capture/extract.ts
# returns bare `{ cards }` for the same reason: the browser re-validates the
# body verbatim with the strict parser, which rejects unknown keys, so adding
# transport metadata ("took 4.2s", "model": …) would break the client.


class CaptureResponse(WireModel):
    cards: list[InsightCard]


class TranscribeResponse(WireModel):
    transcript: list[TranscriptChunk]


class WhisperHealth(WireModel):
    model: str
    device: str
    compute_type: str
    loaded: bool


class LlmHealth(WireModel):
    base_url: str
    model: str


class LimitsHealth(WireModel):
    max_upload_bytes: int
    max_transcript_chars: int
    max_transcript_chunks: int


class ErrorBody(WireModel):
    """Every non-2xx body this service returns.

    Documentation of what the exception handlers in main.py emit — the handlers
    build these dicts directly, so a field added here must be added there too.
    The contract with the browser (lib/connectors/capture/extractClient.ts) is
    that `error` is a stable machine-readable code and everything else is
    optional metadata: never a transcript, never model output, never a
    credential, never a filesystem path.
    """

    error: str
    # Present on capture_parse_error: the parser's failure classification.
    reason: str | None = None
    # Present on capture_parse_error when one card caused it.
    card_index: int | None = None
    # Present on upload_too_large.
    max_upload_bytes: int | None = None
    # Present on invalid_request: the FIELD NAMES that failed, never values.
    fields: list[str] | None = None


class HealthResponse(WireModel):
    """Configuration summary for an install probe.

    Everything here is safe to expose unauthenticated: a LAN address, model
    names and numeric limits. No credential, no transcript, no filesystem path.
    The install script in docs/local-capture-plan.md §"Installation" is
    expected to GET this and print the result next to the other service URLs.
    """

    status: str
    service: str
    version: str
    whisper: WhisperHealth
    llm: LlmHealth
    limits: LimitsHealth
