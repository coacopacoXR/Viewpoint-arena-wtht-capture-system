// The three things you can do with a variant, and the two things they ask first.
//
// docs/plan/15-sessions-and-variants.md batch BL. "Explore a variant from here"
// asks for a short name; "Drop variant" asks for a one-line reason; "Adopt into
// main line" asks nothing at all unless BOTH lines moved the same model, and then it
// asks the one plain question api/reviews/lines.ts sends back:
//
//   "Keep Rev C from the main line or Rev B2 from Variant A?"
//
// Each question is an inline row of the same panel that offered the action, with a
// text field or two buttons and a way out. There is deliberately NO conflict screen,
// no side-by-side diff and no third state to get lost in: the people using this are
// hardware engineers in a meeting, the plan is explicit that the programming
// metaphor must not show through, and a merge conflict dialogue is the single most
// recognisable piece of that metaphor there is.
//
// One component, two hosts — the session map (in the room and in the tracker) and
// the chip in a variant's own top bar — because the actions, their prompts and the
// sentences they answer with are the same in both and a second copy is a second
// place for the words to drift.
//
// WHO MAY DO IT is decided by lib/reviews/roles.ts through `mayEdit`, which the host
// passes down from lib/reviews/useReviewRole. All three are `editReview`: the
// review's owners and editors, and the meeting host on an install with no accounts.
// Hiding the buttons is not the enforcement — the endpoint checks the caller's own
// token against the roster — it is the panel not offering a tool that would be
// refused.
//
// THE WORDS ARE THE SPEC. Nothing in this file may print branch, fork, merge or
// commit, in a label, a title attribute, a placeholder or a sentence.

import React, { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Plus, X } from 'lucide-react';
import { clsx } from 'clsx';
import {
  adoptVariant,
  dropVariant,
  exploreVariant,
  type LineActionContext,
  type LineActionResult,
} from '../../lib/reviews/linesClient';
import { resetLineCache, type LineSession } from '../../lib/reviews/linesRepo';
import { lineLabel, roomPath, shortLineLabel, type ReviewLine } from '../../lib/reviews/lines';

const BUTTON =
  'inline-flex items-center gap-1 px-2 py-1 rounded border text-[10px] font-semibold transition-colors disabled:opacity-40';
const FIELD =
  'flex-1 min-w-0 border border-gray-300 rounded px-2 py-1 text-[11px] text-gray-800 focus:outline-none focus:ring-1 focus:ring-black';

/** The sentence shown while a write is in flight, per action. */
const BUSY: Record<string, string> = {
  explore: 'Starting the variant…',
  adopt: 'Adopting into the main line…',
  drop: 'Dropping the variant…',
};

export interface VariantActionContext extends LineActionContext {
  /**
   * Whether the buttons belong on screen at all. The host's answer from
   * lib/reviews/useReviewRole → can('editReview'), passed down rather than asked
   * again here because this component is mounted inside panels that have already
   * asked it.
   */
  mayEdit: boolean;
  /**
   * Called after a write landed, so the host can read the lines again and redraw.
   * Omitted where there is nothing to refresh — a variant's own room navigates away
   * instead.
   */
  onChanged?: () => void;
}

/** The error line, and the way out of it. Shared by all three prompts. */
const Notice: React.FC<{ text: string }> = ({ text }) => (
  <p className="text-[10px] text-red-600 leading-snug" role="status">{text}</p>
);

/**
 * "Explore a variant from here" — on any session stop, on any line.
 *
 * Asks for a short name, starts the variant, and opens its room. The room it opens
 * is a DIFFERENT PartyKit room (`<reviewId>~<letter>`), so the people exploring the
 * variant have their own presence, their own audio and their own scene, and cannot
 * move a model on the main line's screen by moving one on theirs.
 */
export const ExploreVariantButton: React.FC<
  VariantActionContext & {
    reviewId: string;
    session: LineSession;
    /** The line the session is on, so the prompt can say where the variant leaves from. */
    line?: ReviewLine | null;
  }
> = ({ reviewId, session, line, mayEdit, isMeetingHost, onChanged }) => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async () => {
    const wanted = name.trim();
    if (wanted === '' || busy) return;
    setBusy(true);
    setError(null);
    const result: LineActionResult = await exploreVariant(reviewId, session.id, wanted, { isMeetingHost });
    setBusy(false);
    if (!result.ok || !result.line) {
      setError(result.error ?? 'The variant could not be started.');
      return;
    }
    // The cache holds the lines as they were before this write, and the room the
    // navigation opens resolves its line from it.
    resetLineCache();
    onChanged?.();
    navigate(roomPath(reviewId, result.line.id));
  }, [name, busy, reviewId, session.id, isMeetingHost, onChanged, navigate]);

  if (!mayEdit) return null;

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); setError(null); }}
        className={clsx(BUTTON, 'border-gray-200 text-gray-600 hover:border-gray-400 hover:text-black bg-white')}
        title="Start a named side line from this session, with its model and its open cards"
      >
        <Plus size={11} />
        Explore a variant from here
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1.5" data-testid="explore-variant">
      <label className="font-mono text-[9px] font-bold text-gray-400 uppercase tracking-widest" htmlFor="variant-name">
        New variant from {shortLineLabel(line ?? null) ?? 'this line'} · {session.title || 'this session'}
      </label>
      <div className="flex items-center gap-1.5">
        <input
          id="variant-name"
          value={name}
          autoFocus
          maxLength={80}
          placeholder="Steel hinge pin"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void submit(); if (e.key === 'Escape') setOpen(false); }}
          className={FIELD}
        />
        <button
          onClick={() => void submit()}
          disabled={busy || name.trim() === ''}
          className={clsx(BUTTON, 'border-black bg-black text-white hover:bg-gray-800')}
        >
          {busy ? 'Starting…' : 'Start'}
        </button>
        <button
          onClick={() => setOpen(false)}
          disabled={busy}
          title="Cancel"
          aria-label="Cancel"
          className={clsx(BUTTON, 'border-gray-200 text-gray-400 hover:text-black')}
        >
          <X size={11} />
        </button>
      </div>
      {busy && <p className="text-[10px] text-gray-400">{BUSY.explore}</p>}
      {error && <Notice text={error} />}
      <p className="text-[10px] text-gray-400 leading-snug">
        It starts on this session’s model, with the cards that were still open in it.
      </p>
    </div>
  );
};

/**
 * "Adopt into main line" and "Drop variant" — on a variant that is still being
 * explored. An adopted or dropped one has no actions: it is on the map for the
 * record, and offering to adopt a variant that has already been adopted is how a
 * review ends up with two sets of cards claiming the same decision.
 */
export const VariantActions: React.FC<
  VariantActionContext & {
    reviewId: string;
    variant: ReviewLine;
    /**
     * True when these actions are in the variant's OWN room rather than on a map
     * looking at it. A variant that has just been adopted or dropped has no room to
     * be in — the meeting continues on the main line, which is where its model and
     * its cards now are — so the room navigates there. A map does not: the person
     * pressed a button about a line they are not standing on.
     */
    inRoom?: boolean;
  }
> = ({ reviewId, variant, mayEdit, isMeetingHost, onChanged, inRoom = false }) => {
  const navigate = useNavigate();
  const [busy, setBusy] = useState<null | 'adopt' | 'drop'>(null);
  const [error, setError] = useState<string | null>(null);
  /** The question an adoption asked. */
  const [question, setQuestion] = useState<string | null>(null);
  const [dropping, setDropping] = useState(false);
  const [reason, setReason] = useState('');

  const where = shortLineLabel(variant) ?? 'This variant';

  const after = useCallback(() => {
    // The cache holds the lines as they were before this write, and every reader —
    // the map, the tracker's filter, the room's own chip — resolves through it.
    resetLineCache();
    onChanged?.();
    if (inRoom) navigate(roomPath(reviewId, null));
  }, [inRoom, navigate, onChanged, reviewId]);

  const runAdopt = useCallback(
    async (keep: 'main' | 'variant' | null) => {
      setBusy('adopt');
      setError(null);
      const result = await adoptVariant(reviewId, variant.id, keep, { isMeetingHost });
      setBusy(null);
      if (result.question) {
        setQuestion(result.question);
        return;
      }
      if (!result.ok) {
        setError(result.error ?? 'The variant could not be adopted.');
        return;
      }
      setQuestion(null);
      after();
    },
    [after, isMeetingHost, reviewId, variant.id],
  );

  const runDrop = useCallback(async () => {
    const wanted = reason.trim();
    if (wanted === '') return;
    setBusy('drop');
    setError(null);
    const result = await dropVariant(reviewId, variant.id, wanted, { isMeetingHost });
    setBusy(null);
    if (!result.ok) {
      setError(result.error ?? 'The variant could not be dropped.');
      return;
    }
    setDropping(false);
    after();
  }, [after, isMeetingHost, reason, reviewId, variant.id]);

  if (!mayEdit || variant.kind !== 'variant' || variant.status !== 'active') return null;

  return (
    <div className="flex flex-col gap-1.5">
      {question === null && !dropping && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => void runAdopt(null)}
            disabled={busy !== null}
            className={clsx(BUTTON, 'border-green-600 text-green-700 hover:bg-green-50 bg-white')}
            title="Take this variant’s model and its cards into the main line"
          >
            <Check size={11} />
            Adopt into main line
          </button>
          <button
            onClick={() => { setDropping(true); setError(null); }}
            disabled={busy !== null}
            className={clsx(BUTTON, 'border-gray-200 text-gray-500 hover:border-gray-400 hover:text-black bg-white')}
            title="Close this variant and its open cards, and keep it on the map for the record"
          >
            <X size={11} />
            Drop variant
          </button>
        </div>
      )}

      {/* ONE plain question, two answers, and a way out. Not a comparison. */}
      {question !== null && (
        <div className="flex flex-col gap-1.5" data-testid="adopt-question">
          <p className="text-[11px] text-gray-700 leading-snug">{question}</p>
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => void runAdopt('main')}
              disabled={busy !== null}
              className={clsx(BUTTON, 'border-gray-300 text-gray-700 hover:border-black hover:text-black bg-white')}
            >
              Keep the main line’s
            </button>
            <button
              onClick={() => void runAdopt('variant')}
              disabled={busy !== null}
              className={clsx(BUTTON, 'border-black bg-black text-white hover:bg-gray-800')}
            >
              Take {where}’s
            </button>
            <button
              onClick={() => setQuestion(null)}
              disabled={busy !== null}
              className={clsx(BUTTON, 'border-transparent text-gray-400 hover:text-black')}
            >
              Not now
            </button>
          </div>
        </div>
      )}

      {dropping && (
        <div className="flex flex-col gap-1.5" data-testid="drop-variant">
          <label className="font-mono text-[9px] font-bold text-gray-400 uppercase tracking-widest" htmlFor="drop-reason">
            Why {lineLabel(variant) ?? 'this variant'} was dropped
          </label>
          <div className="flex items-center gap-1.5">
            <input
              id="drop-reason"
              value={reason}
              autoFocus
              maxLength={200}
              placeholder="Too expensive to tool"
              onChange={(e) => setReason(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void runDrop(); if (e.key === 'Escape') setDropping(false); }}
              className={FIELD}
            />
            <button
              onClick={() => void runDrop()}
              disabled={busy !== null || reason.trim() === ''}
              className={clsx(BUTTON, 'border-black bg-black text-white hover:bg-gray-800')}
            >
              Drop it
            </button>
            <button
              onClick={() => setDropping(false)}
              disabled={busy !== null}
              title="Cancel"
              aria-label="Cancel"
              className={clsx(BUTTON, 'border-gray-200 text-gray-400 hover:text-black')}
            >
              <X size={11} />
            </button>
          </div>
          <p className="text-[10px] text-gray-400 leading-snug">
            Its open cards close with this reason on them. It stays on the map, greyed, for the record.
          </p>
        </div>
      )}

      {busy !== null && <p className="text-[10px] text-gray-400">{BUSY[busy]}</p>}
      {error && <Notice text={error} />}
    </div>
  );
};

export default VariantActions;
