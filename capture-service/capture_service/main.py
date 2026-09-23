"""capture-service HTTP surface (T4.1).

    GET  /health      configuration + readiness summary, safe to poll
    POST /capture     a complete meeting recording → { "cards": [...] }
    POST /transcribe  a complete meeting recording → { "transcript": [...] }

No WebSocket and no streaming. The live transcript (T4.7, first slice) is
built from this same batch surface: while recording, the browser cuts a
standalone ~8 s clip and POSTs it to /transcribe (via the app's
/api/capture/transcribe proxy); cards still come from one /capture of the
whole recording at stop.

Two design rules this file exists to keep:

  * THE SUCCESS BODY IS EXACTLY THE ENVELOPE, with no transport metadata mixed
    in. The browser client re-validates a capture response with
    `validateExtractionPayload`, which rejects unknown keys — so a helpful
    `{"cards": [...], "tookMs": 4200}` would be a broken response, not a nicer
    one. Debugging detail goes to /health and to the log.

  * NOTHING IN AN ERROR RESPONSE OR A LOG LINE CARRIES CONTENT. Errors return
    the `code` (and at most a reason enum, a card index or a byte limit); the
    detail an operator needs is in the message, which errors.py guarantees is
    transcript-free. The uploaded filename is never echoed either — it is
    client-controlled text.

Routes are plain `def`, not `async def`: Whisper transcription blocks a worker
for the length of the recording, and FastAPI runs sync routes in a threadpool so
one meeting cannot stall the event loop for everyone else.

When CAPTURE_SHARED_SECRET is set, every route below — /health and /docs
included — requires it. auth.py explains why there is no exemption list.
"""

from __future__ import annotations

import json
import logging
import os
import re
import tempfile
from contextlib import asynccontextmanager
from pathlib import Path, PurePosixPath
from typing import Annotated, AsyncIterator

from fastapi import APIRouter, FastAPI, File, Form, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.responses import JSONResponse

from . import __version__
from .auth import require_shared_secret
from .config import Settings, load_settings
from .errors import CaptureServiceError, EmptyTranscript, EmptyUpload, UploadTooLarge
from .ollama import LlmClient, OllamaClient
from .parse_cards import parse_insight_cards
from .prompt import EXTRACTION_SYSTEM_PROMPT, build_extraction_user_prompt
from .schemas import (
    DEFAULT_SLIDE_TITLE,
    CaptureResponse,
    ErrorBody,
    HealthResponse,
    LimitsHealth,
    LlmHealth,
    SlideContext,
    TranscribeResponse,
    WhisperHealth,
)
from .transcribe import (
    MAX_TRANSCRIPT_CHARS,
    MAX_TRANSCRIPT_CHUNKS,
    FasterWhisperTranscriber,
    Transcriber,
    enforce_transcript_budget,
)

logger = logging.getLogger("capture_service")

SERVICE_NAME = "capture-service"

# Uploads are streamed to a temp file in 1 MiB reads. Streaming (rather than
# `await upload.read()`) is what makes CAPTURE_MAX_UPLOAD_BYTES enforceable: an
# oversized recording is abandoned the moment the counter passes the limit,
# instead of being buffered whole and rejected afterwards.
READ_CHUNK_BYTES = 1024 * 1024

# A client-supplied filename is untrusted. Only a short alphanumeric extension
# is ever appended to the temp file name, so no separator or ".." can survive
# into a filesystem path.
_SAFE_SUFFIX = re.compile(r"^\.[a-z0-9]{1,8}$")

_ERROR_MODEL = {"model": ErrorBody, "description": "See capture_service/errors.py."}
ERROR_RESPONSES: dict[int | str, dict[str, object]] = {
    400: _ERROR_MODEL,
    413: _ERROR_MODEL,
    422: _ERROR_MODEL,
    500: _ERROR_MODEL,
    502: _ERROR_MODEL,
    503: _ERROR_MODEL,
    504: _ERROR_MODEL,
}

router = APIRouter()


@router.get("/health", response_model=HealthResponse, tags=["capture"])
def health(request: Request) -> HealthResponse:
    """Configuration and readiness summary.

    Performs no I/O and never triggers a model load, so it is safe to poll from
    an install script or a container healthcheck: `loaded: false` means "no
    transcription has happened yet", not "broken".
    """
    settings: Settings = request.app.state.settings
    transcriber: Transcriber = request.app.state.transcriber

    return HealthResponse(
        status="ok",
        service=SERVICE_NAME,
        version=__version__,
        whisper=WhisperHealth(
            model=settings.whisper_model,
            device=settings.whisper_device,
            compute_type=settings.whisper_compute_type,
            loaded=transcriber.is_loaded(),
        ),
        llm=LlmHealth(base_url=settings.ollama_base_url, model=settings.ollama_model),
        limits=LimitsHealth(
            max_upload_bytes=settings.max_upload_bytes,
            max_transcript_chars=MAX_TRANSCRIPT_CHARS,
            max_transcript_chunks=MAX_TRANSCRIPT_CHUNKS,
        ),
    )


@router.post(
    "/capture",
    response_model=CaptureResponse,
    response_model_exclude_none=True,
    responses=ERROR_RESPONSES,
    tags=["capture"],
)
def capture(
    request: Request,
    audio: Annotated[
        UploadFile,
        File(description="The complete meeting recording. Any format ffmpeg can decode."),
    ],
    agenda_idx: Annotated[int, Form(alias="agendaIdx", ge=0)] = 0,
    slide_title: Annotated[str, Form(alias="slideTitle")] = DEFAULT_SLIDE_TITLE,
    hovered_part_name: Annotated[str | None, Form(alias="hoveredPartName")] = None,
    laser_target_part_name: Annotated[
        str | None, Form(alias="laserTargetPartName")
    ] = None,
    component_tree: Annotated[
        str | None, Form(alias="componentTree")
    ] = None,
    pointing_segments_raw: Annotated[
        str | None, Form(alias="pointingSegments")
    ] = None,
    transcript_hint_raw: Annotated[
        str | None, Form(alias="transcriptHint")
    ] = None,
) -> CaptureResponse:
    """Transcribe a full meeting recording, then extract InsightCards from it.

    The four optional form fields are the SlideContext the speakers were in.
    Batch mode has ONE context for the whole recording — the agenda item the
    host was presenting, or the meeting title — because that is all the
    post-meeting MVP in docs/local-capture-plan.md has. Blank values fall back
    to the default title rather than labelling the prompt with an empty string.

    The three grounded-capture fields (componentTree, pointingSegments,
    transcriptHint) are JSON strings. Each is parsed defensively: bad JSON,
    wrong shape or oversized input is logged and ignored, never a 500.
    """
    settings: Settings = request.app.state.settings
    transcriber: Transcriber = request.app.state.transcriber
    llm: LlmClient = request.app.state.llm

    audio_path = _spool_upload(audio, settings.max_upload_bytes)
    try:
        transcript = transcriber.transcribe(audio_path)
    finally:
        # Deleted whether transcription succeeded or not: the recording is the
        # most sensitive artefact this service ever touches, and batch mode has
        # no use for it once the transcript exists.
        _remove_quietly(audio_path)

    if not transcript:
        raise EmptyTranscript()
    enforce_transcript_budget(transcript)

    context = SlideContext(
        agenda_idx=agenda_idx,
        slide_title=(slide_title or "").strip() or DEFAULT_SLIDE_TITLE,
        hovered_part_name=_blank_to_none(hovered_part_name),
        laser_target_part_name=_blank_to_none(laser_target_part_name),
    )

    # Grounded-capture inputs: parsed defensively so a bad payload degrades to
    # the pre-section-D behaviour (no component list, no pointing, no hint)
    # rather than failing the request.
    components = _parse_component_tree(component_tree)
    pointing_segments = _parse_pointing_segments(pointing_segments_raw)
    transcript_hint = _parse_transcript_hint(transcript_hint_raw)
    component_ids = {c["id"] for c in components} if components else None

    # Counts only — never content. Without this there is no way to tell a
    # grounded capture from an ungrounded one after the fact, and the
    # difference decides whether componentReference can be trusted.
    logger.info(
        "capture: grounded with %d component(s), %d pointing segment(s), %d hint line(s)",
        len(components or []),
        len(pointing_segments or []),
        len(transcript_hint or []),
    )

    raw_reply = llm.complete(
        EXTRACTION_SYSTEM_PROMPT,
        build_extraction_user_prompt(
            transcript,
            context,
            components=components,
            pointing_segments=pointing_segments,
            transcript_hint=transcript_hint,
        ),
    )

    # Same default-agent rule as the TypeScript providers: a card that does not
    # name a speaker is attributed to the first one in the window.
    cards = parse_insight_cards(
        raw_reply,
        default_agent_id=transcript[0].speaker_id or None,
        component_ids=component_ids,
    )
    logger.info(
        "capture: %d chunk(s) transcribed, %d card(s) extracted",
        len(transcript),
        len(cards),
    )
    return CaptureResponse(cards=cards)


@router.post(
    "/transcribe",
    response_model=TranscribeResponse,
    response_model_exclude_none=True,
    responses=ERROR_RESPONSES,
    tags=["capture"],
)
def transcribe(
    request: Request,
    audio: Annotated[
        UploadFile,
        File(description="The complete meeting recording. Any format ffmpeg can decode."),
    ],
) -> TranscribeResponse:
    """Transcribe only — no LLM call.

    Exists so a contributor can prove the Whisper half of the stack works
    without Ollama installed and running, and so an operator can inspect what
    the model was actually asked about. The transcript is returned to the same
    client that uploaded the audio, so this reveals nothing new; it is NOT
    logged.
    """
    settings: Settings = request.app.state.settings
    transcriber: Transcriber = request.app.state.transcriber

    audio_path = _spool_upload(audio, settings.max_upload_bytes)
    try:
        transcript = transcriber.transcribe(audio_path)
    finally:
        _remove_quietly(audio_path)

    logger.info("transcribe: %d chunk(s)", len(transcript))
    return TranscribeResponse(transcript=transcript)


# ─── Grounded-capture input parsing ─────────────────────────────────────────
#
# The three new form fields arrive as JSON strings. Each parser is defensive:
# bad JSON, wrong shape or oversized input returns None (logged), and the
# capture proceeds as if the field was not sent. A malformed hint must never
# turn a good recording into a 500.

_MAX_COMPONENTS = 200
_MAX_POINTING_SEGMENTS = 500
_MAX_TRANSCRIPT_HINT_LINES = 400


def _parse_component_tree(raw: str | None) -> list[dict[str, str]] | None:
    """Parse the componentTree form field.

    Expected shape: [{ "id": str, "name": str, "path": str }, ...].
    Returns None on any problem; the capture proceeds without a component list.
    """
    if not raw:
        return None
    try:
        parsed = json.loads(raw)
    except (json.JSONDecodeError, ValueError):
        logger.warning("capture-service: componentTree was not valid JSON; ignoring")
        return None
    if not isinstance(parsed, list):
        logger.warning("capture-service: componentTree was not an array; ignoring")
        return None
    result: list[dict[str, str]] = []
    for entry in parsed[:_MAX_COMPONENTS]:
        if not isinstance(entry, dict):
            continue
        cid = entry.get("id")
        cname = entry.get("name")
        cpath = entry.get("path")
        if isinstance(cid, str) and isinstance(cname, str) and isinstance(cpath, str):
            result.append({"id": cid, "name": cname, "path": cpath})
    return result or None


def _parse_pointing_segments(raw: str | None) -> list[dict[str, object]] | None:
    """Parse the pointingSegments form field.

    Expected shape: [{ "userId", "userName", "partId", "partName", "fromMs", "toMs" }, ...].
    """
    if not raw:
        return None
    try:
        parsed = json.loads(raw)
    except (json.JSONDecodeError, ValueError):
        logger.warning("capture-service: pointingSegments was not valid JSON; ignoring")
        return None
    if not isinstance(parsed, list):
        logger.warning("capture-service: pointingSegments was not an array; ignoring")
        return None
    result: list[dict[str, object]] = []
    for entry in parsed[:_MAX_POINTING_SEGMENTS]:
        if not isinstance(entry, dict):
            continue
        if (
            isinstance(entry.get("userId"), str)
            and isinstance(entry.get("userName"), str)
            and isinstance(entry.get("partId"), str)
            and isinstance(entry.get("partName"), str)
            and isinstance(entry.get("fromMs"), (int, float))
            and isinstance(entry.get("toMs"), (int, float))
        ):
            result.append(entry)
    return result or None


def _parse_transcript_hint(raw: str | None) -> list[dict[str, object]] | None:
    """Parse the transcriptHint form field.

    Expected shape: [{ "speaker": str, "text": str, "offsetMs": number }, ...].
    The transcript hint is extra context for attribution, NOT a replacement for
    Whisper's transcript. A client could lie about it, so nothing security-
    relevant may depend on it.
    """
    if not raw:
        return None
    try:
        parsed = json.loads(raw)
    except (json.JSONDecodeError, ValueError):
        logger.warning("capture-service: transcriptHint was not valid JSON; ignoring")
        return None
    if not isinstance(parsed, list):
        logger.warning("capture-service: transcriptHint was not an array; ignoring")
        return None
    result: list[dict[str, object]] = []
    for entry in parsed[:_MAX_TRANSCRIPT_HINT_LINES]:
        if not isinstance(entry, dict):
            continue
        if (
            isinstance(entry.get("speaker"), str)
            and isinstance(entry.get("text"), str)
            and isinstance(entry.get("offsetMs"), (int, float))
        ):
            result.append(entry)
    return result or None


# ─── Upload handling ────────────────────────────────────────────────────────


def _spool_upload(upload: UploadFile, max_bytes: int) -> Path:
    """Stream an upload to a temp file, refusing to exceed `max_bytes`.

    Returns the path; the CALLER owns deletion.

    The declared size (Content-Length, which Starlette tracks while parsing the
    multipart body) is checked first so an obviously oversized upload is
    rejected before it is copied anywhere. The streaming counter is the real
    guarantee, because a chunked request has no declared size.
    """
    declared = getattr(upload, "size", None)
    if isinstance(declared, int) and declared > max_bytes:
        raise UploadTooLarge(max_bytes)

    file_descriptor, raw_path = tempfile.mkstemp(
        prefix="capture-upload-", suffix=_safe_suffix(upload.filename)
    )
    path = Path(raw_path)
    total = 0
    try:
        with os.fdopen(file_descriptor, "wb") as destination:
            # Ownership of the descriptor has passed to the file object; -1
            # tells the finally block not to close it a second time (a reused
            # descriptor number would close somebody else's file).
            file_descriptor = -1
            while True:
                chunk = upload.file.read(READ_CHUNK_BYTES)
                if not chunk:
                    break
                total += len(chunk)
                if total > max_bytes:
                    raise UploadTooLarge(max_bytes)
                destination.write(chunk)
    except BaseException:
        _remove_quietly(path)
        raise
    finally:
        # Only reached with a live descriptor if os.fdopen itself failed.
        if file_descriptor != -1:
            _close_quietly(file_descriptor)

    if total == 0:
        _remove_quietly(path)
        raise EmptyUpload()

    return path


def _safe_suffix(filename: str | None) -> str:
    if not filename:
        return ""
    suffix = PurePosixPath(str(filename).replace("\\", "/")).suffix.lower()
    return suffix if _SAFE_SUFFIX.match(suffix) else ""


def _blank_to_none(value: str | None) -> str | None:
    if value is None:
        return None
    trimmed = value.strip()
    return trimmed or None


def _remove_quietly(path: Path) -> None:
    try:
        path.unlink(missing_ok=True)
    except OSError:
        # A temp file this service cannot delete is worth a log line and
        # nothing more: failing the request over it would hide the real result.
        logger.warning("capture-service: could not remove a temp upload file")


def _close_quietly(file_descriptor: int) -> None:
    try:
        os.close(file_descriptor)
    except OSError:
        pass


# ─── App factory ────────────────────────────────────────────────────────────


def create_app(
    settings: Settings | None = None,
    transcriber: Transcriber | None = None,
    llm: LlmClient | None = None,
) -> FastAPI:
    """Build the FastAPI app.

    Every collaborator is injectable, which is the whole reason the test suite
    needs no GPU, no downloaded Whisper model, no Ollama and no network:
    tests/conftest.py passes a fake transcriber and a fake LLM client. In
    production the defaults are constructed here — and note that neither
    default touches its backend at construction time. The Whisper model loads
    on the first /capture request; the Ollama client opens no socket until it
    is called.
    """
    resolved_settings = settings if settings is not None else load_settings()
    resolved_transcriber = (
        transcriber
        if transcriber is not None
        else FasterWhisperTranscriber(resolved_settings)
    )
    resolved_llm = (
        llm
        if llm is not None
        else OllamaClient(
            resolved_settings.ollama_base_url,
            resolved_settings.ollama_model,
            resolved_settings.timeout_seconds,
        )
    )

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        yield
        close = getattr(app.state.llm, "close", None)
        if callable(close):
            close()

    app = FastAPI(
        title="Viewpoint Arena capture-service",
        version=__version__,
        summary=(
            "Local, batch-mode meeting capture: a full recording goes in, "
            "InsightCards come out. Nothing leaves the network it runs on."
        ),
        lifespan=lifespan,
    )
    app.state.settings = resolved_settings
    app.state.transcriber = resolved_transcriber
    app.state.llm = resolved_llm

    _register_error_handlers(app)

    # Registered ONLY when a secret is configured, so an unauthenticated laptop
    # run has the exact request path it always had: no middleware, no per-request
    # header lookup, nothing to disable. See auth.py for why this is opt-in by
    # absence and why it covers every route including /health and /docs.
    if resolved_settings.shared_secret is not None:
        app.middleware("http")(
            require_shared_secret(resolved_settings.shared_secret)
        )

    app.include_router(router)
    return app


def _register_error_handlers(app: FastAPI) -> None:
    """Turn every failure into a code-only JSON body.

    These handlers are the enforcement point for "no content in an error": the
    message never crosses the wire, whatever raised it.
    """

    @app.exception_handler(CaptureServiceError)
    def _capture_service_error(
        request: Request, exc: CaptureServiceError
    ) -> JSONResponse:
        # The message is transcript-free by construction (see errors.py), so it
        # is the safe place for operator detail — and the log is the only place
        # it goes.
        logger.warning("capture-service %s: %s", exc.code, exc.message)
        return JSONResponse(status_code=exc.status, content=exc.response_body())

    @app.exception_handler(RequestValidationError)
    def _invalid_request(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        # exc.errors() carries `input` — the client's own value, which for this
        # endpoint can be transcript-adjacent. Only field LOCATIONS are read.
        fields = sorted(
            {
                ".".join(str(part) for part in error.get("loc", ())[1:]) or "request"
                for error in exc.errors()
            }
        )
        logger.warning("capture-service invalid_request: %s", ", ".join(fields))
        return JSONResponse(
            status_code=400, content={"error": "invalid_request", "fields": fields}
        )

    @app.exception_handler(StarletteHTTPException)
    def _http_exception(
        request: Request, exc: StarletteHTTPException
    ) -> JSONResponse:
        code = {404: "not_found", 405: "method_not_allowed"}.get(
            exc.status_code, f"http_{exc.status_code}"
        )
        # exc.detail is dropped: for a framework-raised error it is boilerplate,
        # and this service would rather have one predictable error shape.
        return JSONResponse(
            status_code=exc.status_code, content={"error": code}, headers=exc.headers
        )

    @app.exception_handler(Exception)
    def _unexpected(request: Request, exc: Exception) -> JSONResponse:
        # The traceback goes to the log; the client gets a code. Without this
        # handler an unhandled exception becomes Starlette's bare 500, and the
        # next person to add a raise has to remember what may be quoted in it.
        logger.exception("capture-service unhandled %s", type(exc).__name__)
        return JSONResponse(status_code=500, content={"error": "internal_error"})


def load_module_app() -> FastAPI:
    """Build the module-level app, turning a config error into a clean exit.

    Split out from the assignment below so tests can exercise the failure path
    without re-importing this module (a reload that raises would leave it half
    initialised for everything else in the suite).
    """
    try:
        return create_app()
    except CaptureServiceError as exc:
        # One line naming the variable, instead of a traceback: this runs while
        # uvicorn is importing the module, and the operator needs to know which
        # line of the generated .env to fix.
        raise SystemExit(
            f"{SERVICE_NAME}: configuration error — {exc.message}"
        ) from None


# Importable as `uvicorn capture_service.main:app`.
app = load_module_app()
