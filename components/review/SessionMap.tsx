// The session map: every meeting of one design review, drawn as the review's own
// history rather than listed as rows.
//
// docs/plan/15-sessions-and-variants.md batch BK, from the "Review Sessions Map"
// sketch the user approved. The main line is a horizontal line of numbered stops;
// a variant leaves from the session it was started at, runs along below, and either
// rejoins the main line with a green stop (adopted) or stops where it was and goes
// grey and dashed (dropped). A stop is a meeting: its number, its date and the
// model revision(s) that were on screen. Clicking one opens the panel below with
// who attended, what was on screen, the minutes if any were stored, and its cards.
//
// Plain SVG and HTML, no charting library: the drawing is four straight lines and a
// circle per meeting, a dependency would be bigger than the thing it draws, and the
// app's light style is easier to keep in hand-written markup. The whole map scrolls
// sideways inside its container, because a review that has met twenty times is
// twenty stops wide and squashing them to fit would make the labels unreadable —
// and unreadable is worse than a scrollbar.
//
// THE WORDS ARE THE SPEC. This is a "Design review" with a "Main line" and
// "Variant A", and these are "Sessions". Branch, fork, merge and commit do not
// appear anywhere in this file, in a label, in a title attribute or in a comment a
// user could be shown: the people reading this map are hardware engineers and the
// plan is explicit that the programming metaphor must not show through.
//
// Nothing here reads the database. The map is given lines, sessions, revisions and
// cards and draws them, so it renders the same in the room, in the tracker and in a
// test with fixture data; lib/reviews/useSessionMap.ts is the half that fetches.

import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, Trash2, X } from 'lucide-react';
import {
  downloadTranscript,
  formatTranscriptDate,
  transcriptFilename,
  transcriptLineCount,
  transcriptToText,
  type TranscriptRow,
} from '../../lib/capture/transcriptText';
import {
  MAIN_LINE_NAME,
  lineLabel,
  mainLineOf,
  orderedLines,
  sessionLabel,
  shortLineLabel,
  type ReviewLine,
} from '../../lib/reviews/lines';
import type { LineSession, SessionCardRef } from '../../lib/reviews/linesRepo';
import { deleteSession } from '../../lib/reviews/deleteClient';
import type { ModelRevision } from '../../lib/reviews/revisionsRepo';
import { revisionLabel, shortDate } from '../../lib/trackerContinuity';
import { ExploreVariantButton, VariantActions } from './VariantActions';

/** Stop spacing along a line. Wide enough for a date and two revision letters. */
const STEP = 140;
/** Vertical distance between the main line and each variant below it. */
const ROW_GAP = 96;
const PAD_X = 48;
const PAD_TOP = 40;
const PAD_BOTTOM = 34;
const MAIN_Y = PAD_TOP;
const STOP_R = 14;

const INK = '#111827';
const MUTED = '#6b7280';
const FAINT = '#9ca3af';
const ADOPTED = '#059669';
const DROPPED = '#d1d5db';
const VARIANT_INK = '#7c3aed';

/** One meeting, placed. */
export interface MapStop {
  session: LineSession;
  /** The line it is on, or null for a meeting recorded before lines existed. */
  line: ReviewLine | null;
  x: number;
  y: number;
  /** "S3" / "A2", or the date when the session has no number. */
  label: string;
  date: string;
  /** "Rev B · Rev C" — what was on screen, or '' when nothing was stored. */
  revisions: string;
  cards: number;
  /** A dropped variant's stop: greyed, dashed, and still there for the record. */
  dropped: boolean;
  /** The green stop an adopted variant rejoins the main line at. Not a meeting. */
  rejoin: boolean;
}

/** A line drawn between two points. */
export interface MapEdge {
  id: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  /** 'along' one line, 'leave' the main line for a variant, 'rejoin' it back. */
  kind: 'along' | 'leave' | 'rejoin';
  dashed: boolean;
  colour: string;
}

export interface SessionMapLayout {
  stops: MapStop[];
  edges: MapEdge[];
  width: number;
  height: number;
  /** One row per line drawn, so the map can name them at the left edge. */
  rows: Array<{ id: string; label: string; title: string; y: number; colour: string; dropped: boolean }>;
}

/** The revisions a meeting had on screen, as the labels the app uses for them. */
function revisionsText(session: LineSession, revisions: readonly ModelRevision[]): string {
  if (session.revisionIds.length === 0) return '';
  const labels: string[] = [];
  for (const id of session.revisionIds) {
    const row = revisions.find((revision) => revision.id === id);
    const label = revisionLabel(row ? { revision: row.revision } : null);
    if (label && !labels.includes(label)) labels.push(label);
  }
  return labels.join(' · ');
}

/**
 * Where the map puts everything.
 *
 * Pure, and the interesting work: the main line's stops are numbered in the order
 * they happened, each variant leaves from the session it was started at and runs to
 * the right of it on its own row, and an adopted variant's line comes back up to a
 * green stop on the main row. A variant whose parent session has been deleted leaves
 * from the main line's last stop instead, because a side line floating in mid-air
 * with nothing attached to it would look like a bug rather than like a gap in the
 * record.
 *
 * Sessions with no line — recorded before this batch, on an install the backfill has
 * not reached — go on the main row, which is where the backfill in
 * docs/supabase-schema.sql puts them too.
 */
export function layoutSessionMap(
  lines: readonly ReviewLine[],
  sessions: readonly LineSession[],
  revisions: readonly ModelRevision[],
  cards: readonly SessionCardRef[],
): SessionMapLayout {
  const ordered = orderedLines(lines);
  const main = mainLineOf(ordered);
  const variants = ordered.filter((line) => line.kind === 'variant');

  const bySession = new Map<string, LineSession>();
  for (const session of sessions) bySession.set(session.id, session);

  const inOrder = (list: LineSession[]): LineSession[] =>
    [...list].sort((a, b) => {
      const sa = a.seq ?? Number.MAX_SAFE_INTEGER;
      const sb = b.seq ?? Number.MAX_SAFE_INTEGER;
      if (sa !== sb) return sa - sb;
      return a.endedAt.localeCompare(b.endedAt) || a.id.localeCompare(b.id);
    });

  const onMain = inOrder(
    sessions.filter((s) => !main || s.lineId === main.id || s.lineId === null),
  );

  const stops: MapStop[] = [];
  const edges: MapEdge[] = [];
  const rows: SessionMapLayout['rows'] = [];

  const stopFor = (session: LineSession, line: ReviewLine | null, x: number, y: number): MapStop => {
    const dropped = line?.status === 'dropped';
    return {
      session,
      line,
      x,
      y,
      label: sessionLabel(line, session.seq) ?? shortDate(session.endedAt) ?? 'Session',
      date: shortDate(session.endedAt) ?? '',
      revisions: revisionsText(session, revisions),
      cards: cards.filter((card) => card.sessionId === session.id).length,
      dropped,
      rejoin: false,
    };
  };

  // ─── The main line ──────────────────────────────────────────────────────────
  rows.push({ id: main?.id ?? '__main__', label: MAIN_LINE_NAME, title: MAIN_LINE_NAME, y: MAIN_Y, colour: INK, dropped: false });
  const mainStops: MapStop[] = onMain.map((session, index) =>
    stopFor(session, main, PAD_X + index * STEP, MAIN_Y),
  );
  stops.push(...mainStops);
  for (let i = 1; i < mainStops.length; i++) {
    edges.push({
      id: `main-${i}`,
      from: { x: mainStops[i - 1].x, y: MAIN_Y },
      to: { x: mainStops[i].x, y: MAIN_Y },
      kind: 'along',
      dashed: false,
      colour: INK,
    });
  }

  // ─── The variants ───────────────────────────────────────────────────────────
  // Rejoin stops are appended to the main row after the last real meeting, in the
  // order the variants were started, so two adopted variants do not land on top of
  // each other.
  let rejoinIndex = 0;
  const rejoinX = () => PAD_X + (mainStops.length + rejoinIndex++) * STEP;

  variants.forEach((variant, rowIndex) => {
    const y = MAIN_Y + ROW_GAP * (rowIndex + 1);
    const dropped = variant.status === 'dropped';
    const adopted = variant.status === 'adopted';
    const colour = dropped ? DROPPED : adopted ? ADOPTED : VARIANT_INK;
    // The row is named in the short form — "Variant A" — because the left edge has
    // room for a chip and not for a sentence. The name the people exploring it gave
    // it goes in the row's tooltip and in the panel one of its stops opens.
    rows.push({
      id: variant.id,
      label: shortLineLabel(variant) ?? 'Variant',
      title: lineLabel(variant) ?? 'Variant',
      y,
      colour,
      dropped,
    });

    const own = inOrder(sessions.filter((s) => s.lineId === variant.id));

    // Where it leaves from: the session it was started at, or the main line's last
    // meeting when that session is gone, or the START of the row for a variant that
    // was started with no meeting to leave from — batch BQ, a review that had not met
    // yet — or the start of the row when the review has never met on the main line at
    // all. A parentless variant leaves at the start rather than at the last meeting
    // because it did not leave from that meeting: drawing it from there would say the
    // variant continues a scene it was never given.
    const parent = variant.parentSessionId ? bySession.get(variant.parentSessionId) ?? null : null;
    const parentStop = parent ? mainStops.find((stop) => stop.session.id === parent.id) ?? null : null;
    const originX = parentStop?.x
      ?? (variant.parentSessionId === null || mainStops.length === 0
        ? PAD_X
        : mainStops[mainStops.length - 1].x);
    const originY = MAIN_Y;

    const variantStops = own.map((session, index) =>
      stopFor(session, variant, originX + STEP * (index + 1), y),
    );
    stops.push(...variantStops);

    const firstPoint = variantStops.length > 0
      ? { x: variantStops[0].x, y }
      : { x: originX + STEP, y };

    // The elbow off the main line: across, then down, then along.
    edges.push({
      id: `leave-${variant.id}`,
      from: { x: originX, y: originY },
      to: firstPoint,
      kind: 'leave',
      dashed: dropped,
      colour,
    });
    for (let i = 1; i < variantStops.length; i++) {
      edges.push({
        id: `${variant.id}-${i}`,
        from: { x: variantStops[i - 1].x, y },
        to: { x: variantStops[i].x, y },
        kind: 'along',
        dashed: dropped,
        colour,
      });
    }

    if (adopted) {
      const lastPoint = variantStops.length > 0
        ? { x: variantStops[variantStops.length - 1].x, y }
        : firstPoint;
      const x = rejoinX();
      const rejoinStop: MapStop = {
        // Not a meeting: the moment the variant's model and cards became the main
        // line's. It carries the variant's newest session so the panel has something
        // true to show, and `rejoin` is what tells the drawing to make it green.
        session: variantStops.length > 0
          ? variantStops[variantStops.length - 1].session
          : { ...(onMain[0] ?? emptySession()), id: `rejoin-${variant.id}` },
        line: main,
        x,
        y: MAIN_Y,
        label: '✓',
        date: shortDate(variant.closedAt ?? '') ?? '',
        revisions: '',
        cards: 0,
        dropped: false,
        rejoin: true,
      };
      stops.push(rejoinStop);
      edges.push({
        id: `rejoin-${variant.id}`,
        from: lastPoint,
        to: { x, y: MAIN_Y },
        kind: 'rejoin',
        dashed: false,
        colour: ADOPTED,
      });
      if (mainStops.length > 0) {
        edges.push({
          id: `rejoin-along-${variant.id}`,
          from: { x: mainStops[mainStops.length - 1].x, y: MAIN_Y },
          to: { x, y: MAIN_Y },
          kind: 'along',
          dashed: false,
          colour: ADOPTED,
        });
      }
    }
  });

  const width = Math.max(PAD_X * 2 + STEP, ...stops.map((stop) => stop.x + PAD_X));
  const height = MAIN_Y + ROW_GAP * variants.length + PAD_BOTTOM + STOP_R * 2;

  return { stops, edges, width, height, rows };
}

function emptySession(): LineSession {
  return {
    id: '',
    title: '',
    endedAt: '',
    participantCount: 0,
    modelName: null,
    lineId: null,
    seq: null,
    revisionIds: [],
    summary: null,
  };
}

/** The elbow an edge takes: across first, then down (or up), then across again. */
function edgePath(edge: MapEdge): string {
  const { from, to } = edge;
  if (edge.kind === 'along') return `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
  const midX = to.x - STEP / 2;
  return `M ${from.x} ${from.y} L ${midX} ${from.y} L ${midX} ${to.y} L ${to.x} ${to.y}`;
}

export interface SessionMapProps {
  /** The design review's name, for the heading. */
  reviewTitle?: string | null;
  lines: readonly ReviewLine[];
  sessions: readonly LineSession[];
  /** The review's stored revisions, so a stop can name what was on screen. */
  revisions?: readonly ModelRevision[];
  /** The review's cards, so a stop can count its own. */
  cards?: readonly SessionCardRef[];
  /** Close the panel this map is in. Omitted where the map is part of the page. */
  onClose?: () => void;
  /** Empty-state text, for a review that has not met yet. */
  emptyMessage?: string;
  /**
   * The review's id, and whether this person may change its lines. Both are needed
   * for the map to offer any of the three variant actions, and both are omitted
   * where it should not: a map with no review id cannot say which review a variant
   * would belong to, and a map whose reader is a participant or a guest offers
   * actions the endpoint would refuse.
   *
   * `mayEditLines` is the host's `can('editReview')` — starting, adopting and
   * dropping a variant are all the same permission as changing the review's agenda
   * or its models, not three new ones. See lib/reviews/roles.ts.
   */
  reviewId?: string | null;
  mayEditLines?: boolean;
  /**
   * Whether this person may DELETE one of the review's sessions.
   *
   * Narrower than `mayEditLines`, and deliberately so: `deleteReview` in
   * lib/reviews/roles.ts is the owner's and this install's administrators', not its
   * editors'. Removing a meeting removes the cards raised in it, which is not a change
   * to the review's agenda that an editor makes every week. Passed down like
   * `mayEditLines` rather than asked again here, because this map is mounted inside
   * panels that have already asked; hiding the button is not the enforcement —
   * api/reviews/delete.ts checks the caller's own token against the roster.
   */
  mayDelete?: boolean;
  /** Whether this browser is running the meeting. Read on an install with no accounts. */
  isMeetingHost?: boolean;
  /** Read the lines, sessions and cards again, after an action changed them. */
  onChanged?: () => void;
  /**
   * Read ONE meeting's transcript, so the panel can offer it as a .txt.
   *
   * A reader handed in rather than a read made here, which keeps this file's rule
   * intact: nothing here touches the database, so the same map renders in the room,
   * in the tracker, in the lobby's preview and in a test with fixture data.
   * lib/reviews/useSessionMap is the half that fetches, and every caller that uses
   * it passes this down. Omitted, and the panel simply has no transcript row — a map
   * that cannot read one is a map that does not offer one, which is the honest
   * answer for a test's fixtures and for a surface that has no database.
   */
  readTranscript?: (sessionId: string) => Promise<TranscriptRow[] | null>;
  /**
   * Draw the map as a DIAGRAM inside somebody else's panel: no heading, no card.
   *
   * Batch BP. The lobby's preview panel embeds this map, and embedded it repeated the
   * panel's own header — "DESIGN REVIEW", the same title, the same session count — three
   * lines under a header that had just said all of it, inside a bordered white card
   * inside the panel's own bordered white card. Compact drops both: the heading, because
   * the panel it sits in has one, and the rounded border and shadow, because the panel
   * is the card. The drawing, the row labels down its left edge, the stop panel one of
   * its stops opens and the variant actions are all unchanged, and so is every other
   * caller: the room and the tracker both mount this map as the whole of a surface, so
   * both keep the heading and the chrome and neither passes this.
   *
   * What survives of the heading is the key, moved above the drawing and right-aligned
   * out of its way: "Adopted" and "Dropped" are the two states a line can end in and the
   * only part of the drawing that does not label itself. It is shown at every width here
   * rather than from the `sm` breakpoint up, because that breakpoint measures the
   * VIEWPORT and this map is now inside a panel of a fixed narrow width — a phone in
   * landscape would have kept the key and a desktop with a narrow window would have
   * dropped it, which is an answer about the window and not about the room available.
   */
  compact?: boolean;
}

/** The button style VariantActions uses, so a session's actions all read alike. */
const BUTTON =
  'inline-flex items-center gap-1 px-2 py-1 rounded border text-[10px] font-semibold transition-colors disabled:opacity-40';

/**
 * "Delete session" — one meeting, and the cards raised in it.
 *
 * An inline confirm in the same panel that offered it, naming the stop the way the map
 * names it and saying how many cards go with it, because "Delete" on its own does not
 * say which of twenty meetings is about to disappear. Deliberately NOT window.confirm:
 * it cannot be styled to the panel it belongs to, it cannot be tested, and it freezes
 * the room behind it while it waits.
 *
 * What the endpoint may refuse, and the sentence it refuses with, are its own: a
 * variant that leaves FROM this meeting blocks it, because the map draws that variant
 * starting at this stop. Session numbers are not reused and not renumbered, so the
 * meetings after this one keep saying what they always said.
 */
const DeleteSessionButton: React.FC<{
  reviewId: string;
  session: LineSession;
  /** "S2" / "A1" — the label the map draws on this stop. */
  label: string;
  /** How many cards were raised in it, for the sentence that asks. */
  cards: number;
  isMeetingHost?: boolean;
  onDeleted?: () => void;
}> = ({ reviewId, session, label, cards, isMeetingHost, onDeleted }) => {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    const result = await deleteSession(reviewId, session.id, { isMeetingHost });
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? 'That session could not be deleted.');
      return;
    }
    setConfirming(false);
    onDeleted?.();
  };

  if (!confirming) {
    return (
      <button
        onClick={() => { setConfirming(true); setError(null); }}
        className={`${BUTTON} border-gray-200 text-gray-500 hover:border-red-300 hover:text-red-600 bg-white`}
        title="Delete this meeting and the cards raised in it"
      >
        <Trash2 size={11} />
        Delete session
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1.5" data-testid="delete-session">
      <p className="text-[11px] text-gray-700 leading-snug">
        Delete {label}
        {cards > 0 ? ` and its ${cards} ${cards === 1 ? 'card' : 'cards'}` : ''}? This cannot be undone.
      </p>
      <div className="flex items-center gap-1.5 flex-wrap">
        <button
          onClick={() => void run()}
          disabled={busy}
          className={`${BUTTON} border-red-600 bg-red-600 text-white hover:bg-red-700`}
        >
          {busy ? 'Deleting…' : 'Delete'}
        </button>
        <button
          onClick={() => setConfirming(false)}
          disabled={busy}
          className={`${BUTTON} border-gray-200 text-gray-400 hover:text-black bg-white`}
        >
          Cancel
        </button>
      </div>
      {busy && <p className="text-[10px] text-gray-400">Deleting the session and its cards…</p>}
      {error && <p className="text-[10px] text-red-600 leading-snug" role="status">{error}</p>}
    </div>
  );
};

/**
 * The map, and the panel one of its stops opens.
 *
 * Drawn in the app's own light style — white card, grey rules, black ink — because
 * it sits over the room's canvas in one place and inside the tracker's white page in
 * the other, and has to read the same in both.
 */
const SessionMap: React.FC<SessionMapProps> = ({
  reviewTitle,
  lines,
  sessions,
  revisions = [],
  cards = [],
  onClose,
  emptyMessage = 'No sessions recorded in this design review yet.',
  reviewId = null,
  mayEditLines = false,
  mayDelete = false,
  isMeetingHost = false,
  onChanged,
  readTranscript,
  compact = false,
}) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const layout = useMemo(
    () => layoutSessionMap(lines, sessions, revisions, cards),
    [lines, sessions, revisions, cards],
  );

  const selected = layout.stops.find((stop) => stop.session.id === selectedId && !stop.rejoin) ?? null;

  // The selected meeting's transcript, read when its stop is clicked and dropped
  // when another one is. The id travels with the rows so a slow answer about the
  // stop that was open a moment ago cannot land on the panel of the one open now —
  // the panel would otherwise offer a download of a different meeting's transcript
  // under this meeting's heading.
  const [transcript, setTranscript] = useState<{ id: string; rows: TranscriptRow[] } | null>(null);
  useEffect(() => {
    if (!selectedId || !readTranscript) {
      setTranscript(null);
      return;
    }
    let cancelled = false;
    void readTranscript(selectedId).then((rows) => {
      if (cancelled) return;
      setTranscript(rows && rows.length > 0 ? { id: selectedId, rows } : null);
    });
    return () => { cancelled = true; };
  }, [selectedId, readTranscript]);
  const selectedTranscript =
    selected !== null && transcript?.id === selected.session.id ? transcript.rows : null;
  const byLine = useMemo(() => {
    const table = new Map<string, ReviewLine>();
    for (const line of lines) table.set(line.id, line);
    return table;
  }, [lines]);

  // The variants still being explored, which are the only ones with anything to
  // adopt or drop. An adopted or dropped one is on the map for the record and offers
  // nothing — that is what stops "Adopt into main line" being offered twice for the
  // same decision, and what makes the greyed row on the map read as history.
  const activeVariants = useMemo(
    () => lines.filter((line) => line.kind === 'variant' && line.status === 'active'),
    [lines],
  );

  const selectedCards = selected ? cards.filter((card) => card.sessionId === selected.session.id) : [];
  // The names a meeting recorded, which are what "Attended" says from batch BM on.
  // [] for a meeting recorded before the column existed, and then the head count is
  // the answer — it is still a true statement about who was in the room.
  const selectedAttendees = selected?.session.attendeeNames ?? [];
  const transcriptLines = selectedTranscript ? transcriptLineCount(selectedTranscript) : 0;

  /**
   * The selected meeting's transcript as a .txt — the same file, byte for byte, that
   * the person who stopped the recording could have downloaded from the stop panel,
   * because both go through lib/capture/transcriptText.
   *
   * `includePointing` is true and is not a choice here: what people pointed at was
   * decided when the transcript was SAVED, and rows of that kind are in the stored
   * array or they are not. Rendering everything the meeting kept is the only honest
   * reading of a record — a second checkbox would offer to hide part of what was
   * stored, and the file would stop being that meeting's transcript.
   */
  const downloadSelectedTranscript = () => {
    if (!selected || !selectedTranscript) return;
    const ended = new Date(selected.session.endedAt);
    const date = formatTranscriptDate(Number.isNaN(ended.getTime()) ? new Date() : ended);
    // The review's name, and the meeting's own title for a session recorded with no
    // review behind it — a file called "transcript.txt" in a folder of them is a file
    // nobody opens twice.
    const heading = (reviewTitle ?? '').trim() || selected.session.title.trim() || null;
    downloadTranscript(
      transcriptToText(selectedTranscript, {
        includePointing: true,
        title: heading,
        date,
        attendees: selectedAttendees,
      }),
      transcriptFilename(heading, date),
    );
  };

  return (
    <div
      className={
        compact
          ? 'h-full flex flex-col bg-white overflow-hidden'
          : 'h-full flex flex-col bg-white rounded-lg border border-gray-200 shadow-xl overflow-hidden'
      }
    >
      {/* The key on its own, which is all of the heading a compact map keeps. */}
      {compact && (
        <div
          className="flex-shrink-0 flex items-center justify-end gap-3 px-1 pb-1 font-mono text-[9px] text-gray-400"
          data-testid="session-map-legend"
        >
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full border-2" style={{ borderColor: ADOPTED }} /> Adopted
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-px border-t border-dashed" style={{ borderColor: FAINT }} /> Dropped
          </span>
        </div>
      )}
      {/* Heading */}
      {!compact && <div
        className="flex-shrink-0 flex items-start justify-between gap-3 px-4 py-3 border-b border-gray-100 bg-gray-50/60"
        data-testid="session-map-heading"
      >
        <div className="min-w-0">
          <p className="font-mono text-[9px] font-bold text-gray-400 uppercase tracking-widest">Design review</p>
          <h2 className="text-sm font-semibold text-gray-900 leading-snug truncate">
            {reviewTitle?.trim() || 'This design review'}
          </h2>
          <p className="text-[11px] text-gray-500 mt-0.5">
            {sessions.length} {sessions.length === 1 ? 'session' : 'sessions'}
            {lines.filter((line) => line.kind === 'variant').length > 0 &&
              ` · ${lines.filter((line) => line.kind === 'variant').length} ${
                lines.filter((line) => line.kind === 'variant').length === 1 ? 'variant' : 'variants'
              }`}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {/* The two states a line can end in, which are the only part of the
              drawing that needs a key: the lines name themselves down the left edge,
              and repeating "Main line" here would put the same words on screen twice
              for no reason. */}
          <div className="hidden sm:flex items-center gap-3 font-mono text-[9px] text-gray-400">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full border-2" style={{ borderColor: ADOPTED }} /> Adopted</span>
            <span className="flex items-center gap-1"><span className="w-3 h-px border-t border-dashed" style={{ borderColor: FAINT }} /> Dropped</span>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              title="Close"
              aria-label="Close the session map"
              className="p-1 rounded text-gray-400 hover:text-black hover:bg-gray-100 transition-colors"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>}

      {/* The drawing */}
      <div className="flex-1 min-h-0 overflow-auto custom-scrollbar bg-white">
        {layout.stops.length === 0 ? (
          <p className="p-8 text-center text-[11px] font-mono italic text-gray-300">{emptyMessage}</p>
        ) : (
          <svg
            width={layout.width}
            height={layout.height}
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            role="img"
            aria-label="Map of this design review's sessions"
            className="block"
          >
            {layout.edges.map((edge) => (
              <path
                key={edge.id}
                d={edgePath(edge)}
                fill="none"
                stroke={edge.colour}
                strokeWidth={edge.kind === 'along' ? 2 : 1.5}
                strokeDasharray={edge.dashed ? '4 4' : undefined}
                strokeLinecap="round"
                opacity={edge.dashed ? 0.9 : 1}
              />
            ))}

            {layout.rows.map((row) => (
              <text
                key={row.id}
                x={8}
                y={row.y + 3}
                fontSize={9}
                fontFamily="ui-monospace, monospace"
                fontWeight={700}
                fill={row.dropped ? FAINT : MUTED}
              >
                {/* Only where the tooltip says more than the row does: "Main line"
                    over "Main line" is a tooltip for its own sake. */}
                {row.title !== row.label && <title>{row.title}</title>}
                {row.label}
              </text>
            ))}

            {layout.stops.map((stop) => {
              const isSelected = selectedId === stop.session.id && !stop.rejoin;
              const fill = stop.rejoin ? ADOPTED : stop.dropped ? '#f3f4f6' : '#ffffff';
              const stroke = stop.rejoin ? ADOPTED : stop.dropped ? DROPPED : stop.line && stop.line.kind === 'variant' ? VARIANT_INK : INK;
              return (
                <g
                  key={`${stop.session.id}-${stop.x}`}
                  onClick={() => { if (!stop.rejoin) setSelectedId(isSelected ? null : stop.session.id); }}
                  style={{ cursor: stop.rejoin ? 'default' : 'pointer' }}
                  data-testid={stop.rejoin ? undefined : 'session-stop'}
                >
                  <title>
                    {stop.rejoin
                      ? 'Adopted into the main line'
                      : `${stop.label} — ${stop.date}${stop.revisions ? ` — ${stop.revisions}` : ''}`}
                  </title>
                  <circle
                    cx={stop.x}
                    cy={stop.y}
                    r={STOP_R}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={isSelected ? 3 : 1.5}
                    strokeDasharray={stop.dropped ? '3 3' : undefined}
                  />
                  <text
                    x={stop.x}
                    y={stop.y + 3.5}
                    textAnchor="middle"
                    fontSize={10}
                    fontWeight={700}
                    fontFamily="ui-monospace, monospace"
                    fill={stop.rejoin ? '#ffffff' : stop.dropped ? FAINT : INK}
                  >
                    {stop.label}
                  </text>
                  {!stop.rejoin && (
                    <>
                      <text x={stop.x} y={stop.y + STOP_R + 13} textAnchor="middle" fontSize={9} fill={stop.dropped ? FAINT : MUTED}>
                        {stop.date}
                      </text>
                      {stop.revisions && (
                        <text
                          x={stop.x}
                          y={stop.y + STOP_R + 25}
                          textAnchor="middle"
                          fontSize={8.5}
                          fontFamily="ui-monospace, monospace"
                          fill={stop.dropped ? FAINT : '#4b5563'}
                        >
                          {stop.revisions}
                        </text>
                      )}
                      {stop.cards > 0 && (
                        <text x={stop.x} y={stop.y - STOP_R - 6} textAnchor="middle" fontSize={8.5} fontFamily="ui-monospace, monospace" fill={FAINT}>
                          {stop.cards} {stop.cards === 1 ? 'card' : 'cards'}
                        </text>
                      )}
                    </>
                  )}
                </g>
              );
            })}
          </svg>
        )}
      </div>

      {/* The variants still being explored, and the two things that can be done with
          each. Below the drawing rather than on it: the map is a picture of the
          review's history, and a button floating in the middle of it is a button
          nobody finds twice. Rendered only for somebody who may change the review's
          lines — a participant or a guest sees the map and nothing to press. */}
      {reviewId && mayEditLines && activeVariants.length > 0 && (
        <div
          className="flex-shrink-0 border-t border-gray-100 bg-white px-4 py-2.5 flex flex-col gap-2"
          data-testid="map-variants"
        >
          {activeVariants.map((variant) => (
            <div key={variant.id} className="flex items-start gap-3">
              <p
                className="text-[11px] text-gray-700 font-medium pt-1 w-40 shrink-0 truncate"
                title={lineLabel(variant) ?? undefined}
              >
                {lineLabel(variant) ?? 'Variant'}
              </p>
              <div className="flex-1 min-w-0">
                <VariantActions
                  reviewId={reviewId}
                  variant={variant}
                  mayEdit={mayEditLines}
                  isMeetingHost={isMeetingHost}
                  onChanged={onChanged}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* One session, opened */}
      {selected && (
        <div className="flex-shrink-0 border-t border-gray-100 bg-gray-50/40 px-4 py-3 max-h-[45%] overflow-y-auto custom-scrollbar">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-[9px] font-bold text-gray-400 uppercase tracking-widest">Session</p>
              <h3 className="text-sm font-semibold text-gray-900 leading-snug">
                {selected.label}
                <span className="font-normal text-gray-500"> · {selected.date}</span>
              </h3>
              <p className="text-[11px] text-gray-500 mt-0.5">
                {lineLabel(selected.line ?? byLine.get(selected.session.lineId ?? '') ?? null) ?? 'Main line'}
                {selected.session.title ? ` · ${selected.session.title}` : ''}
              </p>
            </div>
            <button
              onClick={() => setSelectedId(null)}
              className="p-1 rounded text-gray-400 hover:text-black hover:bg-gray-100 transition-colors flex-shrink-0"
              title="Close this session"
              aria-label="Close this session"
            >
              <X size={14} />
            </button>
          </div>

          <dl className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <dt className="font-mono text-[9px] font-bold text-gray-400 uppercase tracking-widest">Attended</dt>
              <dd className="text-xs text-gray-800 mt-0.5">
                {selectedAttendees.length > 0
                  ? selectedAttendees.join(', ')
                  : `${selected.session.participantCount} ${
                      selected.session.participantCount === 1 ? 'person' : 'people'
                    }`}
              </dd>
            </div>
            <div>
              <dt className="font-mono text-[9px] font-bold text-gray-400 uppercase tracking-widest">On screen</dt>
              <dd className="text-xs text-gray-800 mt-0.5">
                {selected.revisions || <span className="text-gray-300 italic">Not stored</span>}
              </dd>
            </div>
            <div>
              <dt className="font-mono text-[9px] font-bold text-gray-400 uppercase tracking-widest">Cards</dt>
              <dd className="text-xs text-gray-800 mt-0.5">{selected.cards}</dd>
            </div>
            <div>
              <dt className="font-mono text-[9px] font-bold text-gray-400 uppercase tracking-widest">Model</dt>
              <dd className="text-xs text-gray-800 mt-0.5 truncate">
                {selected.session.modelName || <span className="text-gray-300 italic">—</span>}
              </dd>
            </div>
          </dl>

          {/* Any session on any line is somewhere a variant can leave from — that is
              what the map is for. Starting one takes its model and its still-open
              cards and opens the new line's own room. */}
          {reviewId && mayEditLines && (
            <div className="mt-3">
              <ExploreVariantButton
                reviewId={reviewId}
                session={selected.session}
                line={selected.line ?? byLine.get(selected.session.lineId ?? '') ?? null}
                mayEdit={mayEditLines}
                isMeetingHost={isMeetingHost}
                onChanged={onChanged}
              />
            </div>
          )}

          {/* Deleting the meeting is offered to fewer people than starting a variant
              from it — `mayDelete` is the owner and this install's admins, where
              `mayEditLines` is its editors too — and sits apart from it for that
              reason, so the two are not read as one row of things you can do. */}
          {reviewId && mayDelete && (
            <div className="mt-2">
              <DeleteSessionButton
                reviewId={reviewId}
                session={selected.session}
                label={selected.label}
                cards={selected.cards}
                isMeetingHost={isMeetingHost}
                onDeleted={() => {
                  // The stop is gone, so the panel that was open on it has nothing to
                  // show; closing it is what stops the map redrawing a selected stop
                  // that is no longer there.
                  setSelectedId(null);
                  onChanged?.();
                }}
              />
            </div>
          )}

          {/* The meeting's transcript, when the meeting kept one. Above the minutes
              rather than below them: what was said is the record and the minutes are
              a summary of it, and a reader who wants one of them wants that order.
              Absent — not empty, not greyed out — when nothing was stored, because
              every meeting held before batch BU and every meeting nobody asked to
              keep has no transcript and is not missing one. */}
          {selectedTranscript && (
            <div className="mt-3" data-testid="session-transcript">
              <p className="font-mono text-[9px] font-bold text-gray-400 uppercase tracking-widest">
                Transcript · {transcriptLines} {transcriptLines === 1 ? 'line' : 'lines'}
              </p>
              <button
                onClick={downloadSelectedTranscript}
                className={`${BUTTON} mt-1.5 border-gray-200 text-gray-500 hover:border-black hover:text-black bg-white`}
                title="Download this meeting’s transcript as a text file"
              >
                <Download size={11} /> Download .txt
              </button>
            </div>
          )}

          {selected.session.summary ? (
            <div className="mt-3">
              <p className="font-mono text-[9px] font-bold text-gray-400 uppercase tracking-widest">Summary</p>
              {/* Model output, so no dangerouslySetInnerHTML and no markdown
                  library: every line is React text. Only the two shapes the minutes
                  use are recognised — "## " headings and "- " bullets — so the
                  markers do not show; anything else stays as written. Capped, so a
                  long meeting's minutes scroll inside the panel instead of pushing
                  the cards out of reach. */}
              <div className="text-[11px] text-gray-600 leading-relaxed mt-1 max-h-40 overflow-y-auto custom-scrollbar">
                {summaryLines(selected.session.summary).map((line, i) => (
                  line.kind === 'heading' ? (
                    <p key={i} className="font-semibold text-gray-800 mt-2 first:mt-0">{line.text}</p>
                  ) : line.kind === 'bullet' ? (
                    <p key={i} className="pl-3 -indent-2">• {line.text}</p>
                  ) : line.text === '' ? null : (
                    <p key={i}>{line.text}</p>
                  )
                ))}
              </div>
            </div>
          ) : (
            <p className="mt-3 text-[11px] font-mono italic text-gray-300">
              No summary was stored for this session.
            </p>
          )}

          {selectedCards.length > 0 && (
            <div className="mt-3">
              <p className="font-mono text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
                Cards from this session
              </p>
              <ul className="space-y-1">
                {selectedCards.slice(0, 12).map((card) => {
                  const origin = byLine.get(card.originLineId ?? '');
                  return (
                    <li key={card.id}>
                      <Link
                        to={`/tracker?session=${selected.session.id}`}
                        className="flex items-baseline gap-2 text-[11px] text-gray-600 hover:text-black transition-colors min-w-0"
                      >
                        <span className="font-mono text-[9px] font-bold text-gray-400 flex-shrink-0">{card.type}</span>
                        <span className="truncate flex-1">{card.title}</span>
                        <span className="font-mono text-[9px] text-gray-400 flex-shrink-0">{card.status}</span>
                        {origin && origin.kind === 'variant' && (
                          <span className="font-mono text-[9px] text-gray-400 flex-shrink-0">
                            from {shortLineLabel(origin)}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
              {selectedCards.length > 12 && (
                <Link
                  to={`/tracker?session=${selected.session.id}`}
                  className="inline-block mt-1.5 font-mono text-[10px] text-gray-400 hover:text-black transition-colors"
                >
                  + {selectedCards.length - 12} more in the tracker
                </Link>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SessionMap;

/** Stops in the order the map draws them, for a test that does not parse SVG. */
export function stopLabels(layout: SessionMapLayout): string[] {
  return layout.stops.map((stop) => stop.label);
}

/** The line labels down the left edge, top to bottom. */
export function rowLabels(layout: SessionMapLayout): string[] {
  return layout.rows.map((row) => row.label);
}

/** The minutes, line by line, as the three shapes the session panel draws. */
export function summaryLines(summary: string): { kind: 'heading' | 'bullet' | 'text'; text: string }[] {
  return summary.split(/\r?\n/).map((raw) => {
    const line = raw.trim();
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    if (heading) return { kind: 'heading', text: heading[1] };
    const bullet = /^[-*]\s+(.*)$/.exec(line);
    if (bullet) return { kind: 'bullet', text: bullet[1] };
    return { kind: 'text', text: line };
  });
}
