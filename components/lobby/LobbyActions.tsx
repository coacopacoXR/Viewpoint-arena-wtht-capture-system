// The lobby's actions row: start a review, join one, and narrow the grid.
//
// docs/plan/15-sessions-and-variants.md batch BO, from the approved sketch. Three
// things sit in one row because they are the three things a person does from a lobby,
// and the page under them is the grid of design reviews rather than a form.
//
// ONE BUTTON THAT STARTS A REVIEW, NOT TWO. Batch BN made the lobby's "New session"
// write a design review row exactly the way "New design review" does, and left the two
// differing in one respect: whether the room opens with Edit on. Since every room
// started from the lobby IS a design review, "New session" had become "New design
// review, but do not turn Edit on" — a second button whose whole meaning was a query
// parameter. It is dropped here, and the room opens with Edit on, because the person
// who just created a review is the person who is about to put a model in it: without
// Edit they land in a room where the import is locked until somebody else hands it over.
//
// The JOIN box takes a bare id or a whole pasted link, including the `?line=` of a
// variant, through lib/lobby/joinTarget — the link somebody was sent is the thing they
// have, and unpicking it by hand before it can be used is the reason the box was
// avoided.

import React from 'react';
import { Plus } from 'lucide-react';
import { clsx } from 'clsx';
import { LOBBY_FILTERS, type LobbyFilter } from '../../lib/lobby/useLobbyData';

export interface LobbyActionsProps {
  filter: LobbyFilter;
  onFilter: (filter: LobbyFilter) => void;
  /** How many reviews each chip would show, so a chip with nothing behind it says so. */
  counts: Record<LobbyFilter, number>;
  joinValue: string;
  onJoinValue: (value: string) => void;
  onJoin: () => void;
  onNewReview: () => void;
  /** True while the review row is being written, so a second click cannot make a second one. */
  creating: boolean;
  /**
   * False for a guest, who may enter the room they were invited to and start nothing.
   * The button is hidden rather than disabled: a control greyed out for somebody who
   * will never have it is a question the page then has to answer.
   */
  mayStart: boolean;
  /**
   * False for a guest, and for the same reason the grid is one card for them: the chips
   * narrow a set of reviews they were never given, and a count on a chip is a statement
   * about how many reviews this install holds. The old lobby hid its lists from a guest
   * for exactly that reason; hiding the chips is the same decision.
   */
  showFilters: boolean;
}

const LobbyActions: React.FC<LobbyActionsProps> = ({
  filter,
  onFilter,
  counts,
  joinValue,
  onJoinValue,
  onJoin,
  onNewReview,
  creating,
  mayStart,
  showFilters,
}) => (
  <div className="flex items-stretch gap-2.5 flex-wrap">
    {mayStart && (
      <button
        onClick={onNewReview}
        disabled={creating}
        data-testid="new-design-review"
        className={clsx(
          'inline-flex items-center gap-1.5 h-11 px-4 rounded-md text-sm font-semibold transition-colors',
          'bg-black text-white hover:bg-gray-800 disabled:opacity-50',
        )}
      >
        <Plus size={15} />
        {creating ? 'Creating…' : 'New design review'}
      </button>
    )}

    <div className="flex h-11 rounded-md border border-gray-200 bg-white overflow-hidden focus-within:border-black transition-colors">
      <input
        type="text"
        value={joinValue}
        onChange={(event) => onJoinValue(event.target.value)}
        onKeyDown={(event) => { if (event.key === 'Enter') onJoin(); }}
        placeholder="Room code or link"
        aria-label="Room code or link"
        className="w-52 max-w-[50vw] px-3 text-[13px] text-gray-900 outline-none placeholder:text-gray-400 bg-transparent"
      />
      <button
        onClick={onJoin}
        data-testid="join-button"
        className="px-3.5 border-l border-gray-200 bg-gray-50 text-[13px] font-semibold text-gray-700 hover:bg-gray-100 hover:text-black transition-colors"
      >
        Join
      </button>
    </div>

    {showFilters && (
    <div className="flex items-center gap-1.5 ml-auto flex-wrap" role="group" aria-label="Which design reviews to show">
      {LOBBY_FILTERS.map((option) => (
        <button
          key={option.id}
          onClick={() => onFilter(option.id)}
          aria-pressed={filter === option.id}
          data-testid={`filter-${option.id}`}
          className={clsx(
            'inline-flex items-center gap-1.5 h-8 px-3 rounded-full border text-xs transition-colors',
            filter === option.id
              ? 'bg-black border-black text-white'
              : 'bg-white border-gray-200 text-gray-500 hover:border-gray-400 hover:text-black',
          )}
        >
          {option.label}
          <span className={clsx('font-mono text-[10px] tabular-nums', filter === option.id ? 'opacity-70' : 'text-gray-400')}>
            {counts[option.id]}
          </span>
        </button>
      ))}
    </div>
    )}
  </div>
);

export default LobbyActions;
