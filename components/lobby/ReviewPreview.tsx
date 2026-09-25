// The preview panel: what one design review looks like from outside it.
//
// docs/plan/15-sessions-and-variants.md batch BO, from the sketch the user approved.
// A card in the grid is four facts; this is the rest of them, and it exists because the
// user's complaint was that the lobby gave no way to see inside a review before walking
// into it. Everything here is READ: the model, the whole session map, every meeting with
// who was in it and what it decided, and the minutes of the last one. The only writes it
// offers are the two deletes, and both are the owner's and this install's administrators'
// (lib/reviews/roles.ts `deleteReview`), both go through api/reviews/delete.ts, and both
// ask INLINE rather than with window.confirm — a browser dialog cannot be styled to the
// panel that offered it, cannot be tested, and freezes the page behind it while it waits.
//
// "TURN IN 3D" is the one heavy thing on the page and it is lazy. The viewer pulls
// three.js, which is hundreds of kilobyles nobody wants for a list of reviews, so it is
// behind React.lazy and the chunk is fetched when — and only when — the button is
// pressed. The snapshot stays the default answer, which is why capturing it in the room
// (lib/reviews/thumbnail.ts) is worth a column of its own.
//
// ONE REVIEW'S DETAIL IS READ HERE, NOT IN THE GRID. lib/lobby/useLobbyData batches the
// summaries every card needs; the panel needs this review's revisions and its card
// titles too, which no other card wants. lib/reviews/useSessionMap already reads exactly
// those four things for one review in parallel, so the panel uses it rather than making
// the grid carry detail for sixty reviews to show one.

import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Box, Check, Pencil, X } from 'lucide-react';
import { clsx } from 'clsx';
import SessionMap, { summaryLines } from '../review/SessionMap';
import StartVariant from '../review/StartVariant';
import { Avatar } from './IdentityChip';
import { useSessionMap } from '../../lib/reviews/useSessionMap';
import { sessionLabel } from '../../lib/reviews/lines';
import { deleteReview, deleteSession } from '../../lib/reviews/deleteClient';
import { renameCuration } from '../../lib/curationsRepo';
import { MAX_REVIEW_TITLE } from '../../lib/reviewSetupStore';
import { shortDate } from '../../lib/trackerContinuity';
import { AVATAR_COLORS } from '../../lib/identity';
import { peopleOf, variantCountOf, type LobbyReview } from '../../lib/lobby/useLobbyData';

/** Behind React.lazy so three.js stays out of the lobby's own chunk. See the header. */
const ReviewModelViewer = React.lazy(() => import('./ReviewModelViewer'));

const LABEL = 'font-mono text-[9px] font-bold text-gray-400 uppercase tracking-widest';
const BUTTON =
  'inline-flex items-center gap-1.5 px-3 py-2 rounded-md border text-[13px] font-semibold transition-colors disabled:opacity-50';

export interface ReviewPreviewProps {
  review: LobbyReview;
  /**
   * True when this review is the one an invitation link named. Join becomes the primary
   * button and "Open room" is not offered as well: the person arrived to enter a meeting,
   * and two buttons that both enter it is a choice with one answer.
   */
  invited?: boolean;
  /** Whether this person may delete this review and its sessions. Decided by the caller. */
  mayDelete: boolean;
  /**
   * Whether this person may CHANGE this review — `can(role, 'editReview')` in
   * lib/reviews/roles.ts, decided by the caller the way `mayDelete` is.
   *
   * Narrower than `mayDelete` on one side and wider on the other, and both differences
   * are the table's: an editor may name the review and start a variant of it but may
   * not delete it, and on a deployment with no accounts the person who got past the
   * front door may do all three. Batch BQ, which is what put a name field and a
   * "+ Variant" on this panel.
   */
  mayEdit?: boolean;
  /** Read on a deployment with no accounts, where there is no token to verify. */
  isMeetingHost?: boolean;
  onOpen: () => void;
  /** The review is gone; the caller drops it from the grid and clears the panel. */
  onDeleted: () => void;
  /** A session was deleted; the caller re-reads the grid's summaries. */
  onChanged: () => void;
}

/** An inline "are you sure", which is the only confirmation this panel ever shows. */
const InlineConfirm: React.FC<{
  question: string;
  busy: boolean;
  busyWord: string;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ question, busy, busyWord, error, onConfirm, onCancel }) => (
  <div className="flex flex-col gap-2" data-testid="inline-confirm">
    <p className="text-[11px] text-gray-700 leading-snug">{question}</p>
    <div className="flex items-center gap-1.5 flex-wrap">
      <button
        onClick={onConfirm}
        disabled={busy}
        className={clsx(BUTTON, 'px-2.5 py-1 text-[11px] border-red-600 bg-red-600 text-white hover:bg-red-700')}
      >
        {busy ? busyWord : 'Delete'}
      </button>
      <button
        onClick={onCancel}
        disabled={busy}
        className={clsx(BUTTON, 'px-2.5 py-1 text-[11px] border-gray-200 text-gray-400 bg-white hover:text-black')}
      >
        Cancel
      </button>
    </div>
    {error && <p className="text-[10px] text-red-600 leading-snug" role="status">{error}</p>}
  </div>
);

/** One meeting, as a row: its label, when it was held, who was in it, its cards, and a ✕. */
const SessionRow: React.FC<{
  reviewId: string;
  sessionId: string;
  label: string;
  when: string;
  people: string;
  cards: number;
  mayDelete: boolean;
  isMeetingHost: boolean;
  onDeleted: () => void;
}> = ({ reviewId, sessionId, label, when, people, cards, mayDelete, isMeetingHost, onDeleted }) => {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    const result = await deleteSession(reviewId, sessionId, { isMeetingHost });
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? 'That session could not be deleted.');
      return;
    }
    setConfirming(false);
    onDeleted();
  };

  return (
    <li className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 text-xs">
        <span className="font-mono text-[11px] font-bold text-gray-900 shrink-0">{label}</span>
        <span className="flex-1 min-w-0 truncate text-gray-500">
          {when}
          {people ? ` · ${people}` : ''}
          {` · ${cards} ${cards === 1 ? 'card' : 'cards'}`}
        </span>
        {mayDelete && !confirming && (
          <button
            onClick={() => { setConfirming(true); setError(null); }}
            data-testid={`delete-session-${label}`}
            title="Delete this session and the cards raised in it"
            aria-label={`Delete session ${label}`}
            className="w-[22px] h-[22px] shrink-0 grid place-items-center rounded border border-gray-200 bg-white text-gray-400 hover:border-red-300 hover:text-red-600 transition-colors"
          >
            <X size={12} />
          </button>
        )}
      </div>
      {confirming && (
        <InlineConfirm
          question={`Delete ${label}${cards > 0 ? ` and its ${cards} ${cards === 1 ? 'card' : 'cards'}` : ''}? This cannot be undone.`}
          busy={busy}
          busyWord="Deleting…"
          error={error}
          onConfirm={() => void run()}
          onCancel={() => setConfirming(false)}
        />
      )}
    </li>
  );
};

const ReviewPreview: React.FC<ReviewPreviewProps> = ({
  review,
  invited = false,
  mayDelete,
  mayEdit = false,
  isMeetingHost = false,
  onOpen,
  onDeleted,
  onChanged,
}) => {
  const map = useSessionMap(review.id);
  const [turned, setTurned] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Naming the review, inline in its own heading (batch BQ).
  const [renaming, setRenaming] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const [nameBusy, setNameBusy] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  // Another review selected: the 3D viewer of the last one must go, along with any
  // confirmation that was open on it. Unmounting is what disposes its geometry.
  useEffect(() => {
    setTurned(false);
    setConfirming(false);
    setError(null);
    setRenaming(false);
    setNameError(null);
  }, [review.id]);

  // The grid's summaries are already in hand, so they stand in until this review's own
  // detail arrives. Without that the panel would flash "No sessions recorded" for every
  // review that has met, which reads as a lost history rather than as a read in flight.
  const lines = map.lines.length > 0 ? map.lines : review.lines;
  const sessions = map.sessions.length > 0 ? map.sessions : review.sessions;

  const people = useMemo(() => peopleOf({ sessions }), [sessions]);
  const variants = useMemo(() => variantCountOf({ lines }), [lines]);

  const cardsIn = (sessionId: string): number => map.cards.filter((card) => card.sessionId === sessionId).length;

  // Newest first: the last meeting is the one worth reading, and the minutes below are
  // its. The map above draws them oldest first, which is the order a history reads in.
  const rows = useMemo(() => [...sessions].reverse(), [sessions]);
  const latest = rows[0] ?? null;

  const lineOf = (lineId: string | null) => lines.find((line) => line.id === lineId) ?? null;

  const runDelete = async () => {
    setBusy(true);
    setError(null);
    const result = await deleteReview(review.id, { isMeetingHost });
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? 'That design review could not be deleted.');
      return;
    }
    onDeleted();
  };

  const title = review.title.trim() === '' ? `Design review ${review.id.slice(0, 8)}` : review.title;

  /**
   * Name this design review.
   *
   * ONE COLUMN, through lib/curationsRepo.renameCuration, and not a whole-draft save:
   * this panel holds a SUMMARY of the review and not its viewpoints, pins and agenda,
   * and upserting the row from a summary would empty every field it never read. A
   * meeting in progress in this review keeps its own write path — RoomPage's
   * save-on-local-edit — and the two cannot disagree about anything but the name.
   */
  const saveName = async () => {
    const wanted = nameValue.trim().slice(0, MAX_REVIEW_TITLE);
    setRenaming(false);
    setNameError(null);
    // An empty field keeps the name the review has: pressing Enter in a field nobody
    // filled in is not a decision to call it nothing.
    if (wanted === '' || wanted === review.title.trim()) return;
    setNameBusy(true);
    const result = await renameCuration(review.id, wanted);
    setNameBusy(false);
    if (!result.ok) {
      setNameError(result.error ?? 'That name could not be saved.');
      return;
    }
    // The card in the grid and this heading both read the name out of the grid's rows,
    // so the re-read is what makes the two agree.
    onChanged();
  };

  return (
    <aside
      aria-label="Preview"
      data-testid="review-preview"
      className="rounded-lg border border-gray-200 bg-white overflow-hidden"
    >
      {/* Heading */}
      <div className="flex flex-col gap-1.5 px-4 py-3.5 border-b border-gray-100">
        <p className={LABEL}>Design review</p>
        <h2 className="text-[17px] font-semibold text-gray-900 leading-snug [text-wrap:balance]" data-testid="preview-title">
          {renaming ? (
            <span className="flex items-center gap-1.5">
              <input
                value={nameValue}
                autoFocus
                disabled={nameBusy}
                maxLength={MAX_REVIEW_TITLE}
                aria-label="Name this design review"
                data-testid="preview-title-field"
                placeholder="e.g. Door hinge, rev C"
                onChange={(event) => setNameValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void saveName();
                  if (event.key === 'Escape' && !nameBusy) setRenaming(false);
                }}
                className="flex-1 min-w-0 rounded border border-gray-300 px-2 py-1 text-[14px] font-semibold text-gray-900 outline-none focus:ring-1 focus:ring-black"
              />
              <button
                onClick={() => void saveName()}
                disabled={nameBusy}
                data-testid="preview-title-save"
                title="Save this name"
                aria-label="Save this name"
                className="w-7 h-7 shrink-0 grid place-items-center rounded border border-black bg-black text-white hover:bg-gray-800 transition-colors disabled:opacity-40"
              >
                <Check size={13} />
              </button>
              <button
                onClick={() => setRenaming(false)}
                disabled={nameBusy}
                title="Cancel"
                aria-label="Cancel"
                className="w-7 h-7 shrink-0 grid place-items-center rounded border border-gray-200 text-gray-400 hover:text-black transition-colors disabled:opacity-40"
              >
                <X size={13} />
              </button>
            </span>
          ) : mayEdit ? (
            /* The name is a button rather than a pencil beside it: the whole point of
               batch BQ is that naming a review is something a person looks for, and a
               control you have to notice a 12px icon to find is not one. */
            <button
              onClick={() => { setNameValue(review.title); setNameError(null); setRenaming(true); }}
              disabled={nameBusy}
              data-testid="preview-title-edit"
              title="Rename this design review"
              className="group flex items-center gap-1.5 text-left"
            >
              <span className="min-w-0">{title}</span>
              <Pencil size={13} className="shrink-0 text-gray-300 group-hover:text-gray-600 transition-colors" />
            </button>
          ) : (
            title
          )}
        </h2>
        {nameError && <p className="text-[10px] text-red-600 leading-snug" role="status">{nameError}</p>}
        <div className="flex items-center gap-2 mt-0.5">
          {/* The names this review's meetings recorded. The colours are picked by
              position because a name in a meeting's attendee list has no colour stored
              with it — this is decoration, and stable decoration, not an identity. */}
          <div className="flex items-center">
            {people.names.slice(0, 5).map((name, index) => (
              <span key={name} className={index === 0 ? '' : '-ml-1.5'}>
                <Avatar name={name} color={AVATAR_COLORS[index % AVATAR_COLORS.length]} size={22} />
              </span>
            ))}
          </div>
          <p className="text-xs text-gray-500">
            {people.count} {people.count === 1 ? 'person' : 'people'} · {sessions.length}{' '}
            {sessions.length === 1 ? 'session' : 'sessions'}
            {variants > 0 && ` · ${variants} ${variants === 1 ? 'variant' : 'variants'}`}
          </p>
        </div>
      </div>

      {/* The model: the snapshot, or the live viewer once "Turn in 3D" is pressed. */}
      <div className="relative border-b border-gray-100 bg-gradient-to-b from-[#f7f8fa] to-[#e9ecf1]" style={{ aspectRatio: '16 / 9' }}>
        {turned ? (
          <Suspense
            fallback={
              <div className="absolute inset-0 grid place-items-center">
                <p className="font-mono text-[10px] uppercase tracking-widest text-gray-400 animate-pulse">
                  Loading the model…
                </p>
              </div>
            }
          >
            <ReviewModelViewer reviewId={review.id} className="absolute inset-0" />
          </Suspense>
        ) : review.thumbnail ? (
          <img
            src={review.thumbnail}
            alt="The model this design review is looking at"
            className="absolute inset-0 w-full h-full object-cover"
            data-testid="preview-thumbnail"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center px-4" data-testid="preview-placeholder">
            <p className="font-mono text-[10px] uppercase tracking-widest text-gray-400 text-center truncate w-full">
              {review.modelName ?? 'No model yet'}
            </p>
          </div>
        )}
        <button
          onClick={() => setTurned((value) => !value)}
          data-testid="turn-in-3d"
          aria-pressed={turned}
          className={clsx(
            'absolute bottom-2 right-2 inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-[10px] font-bold uppercase tracking-wide transition-colors',
            turned
              ? 'bg-black border-black text-white'
              : 'bg-white/95 border-gray-200 text-gray-600 hover:border-gray-400 hover:text-black',
          )}
        >
          <Box size={12} />
          {turned ? 'Snapshot' : 'Turn in 3D'}
        </button>
      </div>

      {/* The whole session map, which is the same component the room and the tracker show.
          `mayDelete` is FALSE on purpose. SessionMap carries its own "Delete review" and
          per-stop session deletes, and both ask with window.confirm — the room and the
          tracker want them because the map is the only control surface there. Here it is
          a DIAGRAM in a panel that already has both deletes, inline, under its own list
          of sessions: two ways to remove the same review, one of them a browser dialog
          that cannot be styled to this panel and cannot be tested, is one too many.
          `compact` for the same reason it is a diagram: this panel has already named the
          review, counted its sessions and drawn its own card, so the map drops its
          heading and its chrome and keeps its key. */}
      <div className="border-b border-gray-100 px-3 py-2" data-testid="preview-session-map">
        <SessionMap
          reviewTitle={title}
          lines={lines}
          sessions={sessions}
          revisions={map.revisions}
          cards={map.cards}
          reviewId={review.id}
          mayDelete={false}
          compact
          onChanged={() => { map.refresh(); onChanged(); }}
          emptyMessage="No sessions recorded in this design review yet."
        />
      </div>

      {/* Every meeting, newest first, with a delete for whoever may delete the review. */}
      <div className="flex flex-col gap-2 px-4 py-3 border-b border-gray-100">
        <p className={LABEL}>Sessions</p>
        {rows.length === 0 ? (
          <p className="text-[11px] font-mono italic text-gray-300">No sessions yet.</p>
        ) : (
          <ul className="flex flex-col gap-1.5" data-testid="preview-session-rows">
            {rows.map((session) => {
              const label = sessionLabel(lineOf(session.lineId), session.seq) ?? shortDate(session.endedAt) ?? 'Session';
              const names = session.attendeeNames ?? [];
              return (
                <SessionRow
                  key={session.id}
                  reviewId={review.id}
                  sessionId={session.id}
                  label={label}
                  when={shortDate(session.endedAt) ?? session.title}
                  people={names.length > 0 ? names.join(', ') : `${session.participantCount} in the room`}
                  cards={cardsIn(session.id)}
                  mayDelete={mayDelete}
                  isMeetingHost={isMeetingHost}
                  onDeleted={() => { map.refresh(); onChanged(); }}
                />
              );
            })}
          </ul>
        )}
      </div>

      {/* The last meeting's minutes, drawn the way the room's own session panel draws
          them: model output, so every line is React text and only the two shapes the
          minutes use are recognised. */}
      {latest?.summary && (
        <div className="flex flex-col gap-1.5 px-4 py-3 border-b border-gray-100">
          <p className={LABEL}>
            Last minutes · {sessionLabel(lineOf(latest.lineId), latest.seq) ?? shortDate(latest.endedAt) ?? 'session'}
          </p>
          <div className="text-[11px] text-gray-600 leading-relaxed bg-gray-50 border border-gray-200 rounded-md px-2.5 py-2 max-h-44 overflow-y-auto custom-scrollbar" data-testid="preview-minutes">
            {summaryLines(latest.summary).map((line, index) => (
              line.kind === 'heading' ? (
                <p key={index} className="font-semibold text-gray-800 mt-2 first:mt-0">{line.text}</p>
              ) : line.kind === 'bullet' ? (
                <p key={index} className="pl-3 -indent-2">• {line.text}</p>
              ) : line.text === '' ? null : (
                <p key={index}>{line.text}</p>
              )
            ))}
          </div>
        </div>
      )}

      {/* The way in, and the way out. */}
      <div className="flex items-center gap-2 flex-wrap px-4 py-3">
        <button
          onClick={onOpen}
          data-testid={invited ? 'preview-join' : 'preview-open-room'}
          className={clsx(BUTTON, 'bg-black border-black text-white hover:bg-gray-800')}
        >
          {invited ? 'Join' : 'Open room'}
        </button>
        {/* Start a variant from the lobby, for the same people the room's top bar
            offers it to and through the same write. Somebody reading a review from
            outside it is exactly the person who decides it needs a second line, and
            making them enter the room, open Sessions and click a meeting to find the
            action is why nobody found it (batch BQ). */}
        {mayEdit && (
          <StartVariant
            reviewId={review.id}
            mayEdit={mayEdit}
            isMeetingHost={isMeetingHost}
            label="+ Variant"
            look="row"
            inFlow
            data-testid="preview-variant"
            onStarted={onChanged}
          />
        )}
        {/* Filtered to this review: the tracker reads ?review= the way it reads
            ?session=, and a card on the map already links in with both. */}
        <Link
          to={`/tracker?review=${review.id}`}
          data-testid="preview-tracker"
          className={clsx(BUTTON, 'bg-white border-gray-200 text-gray-600 hover:border-gray-400 hover:text-black')}
        >
          Tracker
        </Link>

        {mayDelete && (
          <div className="ml-auto">
            {confirming ? (
              <InlineConfirm
                question={`Delete this design review? Its ${sessions.length} ${sessions.length === 1 ? 'session' : 'sessions'}, the cards raised in them and its lines all go. This cannot be undone.`}
                busy={busy}
                busyWord="Deleting…"
                error={error}
                onConfirm={() => void runDelete()}
                onCancel={() => setConfirming(false)}
              />
            ) : (
              <button
                onClick={() => { setConfirming(true); setError(null); }}
                data-testid="delete-review"
                className={clsx(BUTTON, 'bg-white border-red-200 text-red-700 hover:border-red-400')}
              >
                Delete review
              </button>
            )}
          </div>
        )}
      </div>
    </aside>
  );
};

export default ReviewPreview;
