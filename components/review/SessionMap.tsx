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

import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
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
import type { ModelRevision } from '../../lib/reviews/revisionsRepo';
import { revisionLabel, shortDate } from '../../lib/trackerContinuity';

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
    // meeting when that session is gone, or the start of the row when the review has
    // never met on the main line at all.
    const parent = variant.parentSessionId ? bySession.get(variant.parentSessionId) ?? null : null;
    const parentStop = parent ? mainStops.find((stop) => stop.session.id === parent.id) ?? null : null;
    const originX = parentStop?.x ?? (mainStops.length > 0 ? mainStops[mainStops.length - 1].x : PAD_X);
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
}

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
}) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const layout = useMemo(
    () => layoutSessionMap(lines, sessions, revisions, cards),
    [lines, sessions, revisions, cards],
  );

  const selected = layout.stops.find((stop) => stop.session.id === selectedId && !stop.rejoin) ?? null;
  const byLine = useMemo(() => {
    const table = new Map<string, ReviewLine>();
    for (const line of lines) table.set(line.id, line);
    return table;
  }, [lines]);

  const selectedCards = selected ? cards.filter((card) => card.sessionId === selected.session.id) : [];

  return (
    <div className="h-full flex flex-col bg-white rounded-lg border border-gray-200 shadow-xl overflow-hidden">
      {/* Heading */}
      <div className="flex-shrink-0 flex items-start justify-between gap-3 px-4 py-3 border-b border-gray-100 bg-gray-50/60">
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
      </div>

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
                {selected.session.participantCount} {selected.session.participantCount === 1 ? 'person' : 'people'}
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

          {selected.session.summary ? (
            <div className="mt-3">
              <p className="font-mono text-[9px] font-bold text-gray-400 uppercase tracking-widest">Summary</p>
              <p className="text-[11px] text-gray-600 leading-relaxed mt-1 whitespace-pre-wrap">
                {selected.session.summary}
              </p>
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
