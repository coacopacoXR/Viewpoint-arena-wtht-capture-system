// "You are on Variant A · Steel hinge pin" — the chip in a variant's own top bar.
//
// docs/plan/15-sessions-and-variants.md batch BL. A variant meets in a DIFFERENT
// room from the review's main line (`<reviewId>~<letter>`, its own presence, its own
// audio, its own scene), and the address that puts you there is
// `/room/<id>?line=<lineId>` — which looks exactly like the main line's address to
// somebody who arrived by a link. Without a say-so on screen, the meeting that spends
// an hour on a steel hinge pin and never notices it is not on the main line is the
// failure this prevents, and it is a silent one: nothing else in the room looks
// different, because that is the point of a variant.
//
// So: the chip names the line, and the panel it opens carries the way back to the main
// line's room — plus, for the review's owners and editors, the two things you can do with
// a variant from inside it: adopt it into the main line, or drop it. All of it BEHIND the
// chip rather than beside it, because the top bar is full: batch BQ2 took the "Main line"
// button that used to sit next to the chip and put it in here, and gave the bar a measured
// compact state, for exactly that reason. A control nobody can reach is still worse than
// one that needs a click.
//
// Renders NOTHING on the main line. Every review that existed before this batch has
// an address with no `?line=` in it, and a chip reading "Main line" in all of them
// would be a new piece of furniture in every room in the building to say something
// nobody had wondered about.

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronDown } from 'lucide-react';
import { clsx } from 'clsx';
import { lineLabel, roomPath, shortLineLabel, type ReviewLine } from '../../../lib/reviews/lines';
import { VariantActions } from '../../review/VariantActions';

export interface LineChipProps {
  /** The review's id, which is the room's id. */
  roomId: string;
  /** The line this room resolved itself to. Null on the main line and for an ad-hoc room. */
  line: ReviewLine | null;
  /** can('editReview') — whether the two actions belong on the chip at all. */
  mayEdit: boolean;
  /** Whether this browser is running the meeting. Read on an install with no accounts. */
  isMeetingHost?: boolean;
}

const LineChip: React.FC<LineChipProps> = ({ roomId, line, mayEdit, isMeetingHost }) => {
  const [open, setOpen] = useState(false);
  if (!line || line.kind !== 'variant') return null;

  const full = lineLabel(line) ?? 'Variant';
  const short = shortLineLabel(line) ?? 'Variant';

  return (
    <div className="relative shrink-0 flex items-center" data-testid="line-chip">
      {/* One control, and it is a button for EVERYBODY in the room. It used to be a
          chip with a second button beside it — "Main line →" — which is how the top bar
          came to hold twelve controls and stop fitting; the way back is a thing you
          choose once you know you are somewhere else, so it lives in the panel the chip
          opens. Somebody who may not change the review gets the same chip and the same
          panel, with only the way back in it: knowing you are on a variant is what lets
          you take part in the meeting, and a participant with no route back to the main
          line is a participant who has to edit the address bar. */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title={
          mayEdit
            ? `You are on ${full}. Adopt it into the main line, or drop it.`
            : `You are on ${full}`
        }
        className={clsx(
          'h-9 px-2 flex items-center gap-1.5 rounded-sm border transition-all pointer-events-auto',
          'bg-violet-50 text-violet-800 border-violet-200 hover:border-violet-400',
        )}
      >
        <span className="text-[10px] font-bold uppercase tracking-wide max-w-[16ch] truncate">
          You are on {full}
        </span>
        <ChevronDown size={13} className={clsx('transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div
          className={clsx(
            'absolute top-10 left-0 z-50 max-w-[80vw] bg-white border border-gray-200 rounded-md shadow-lg p-3 pointer-events-auto',
            mayEdit ? 'w-[380px]' : 'w-56',
          )}
        >
          <p className="font-mono text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-2">
            {short}
          </p>
          {/* The way back. Same review, no `?line=`, which is the address every link
              already in circulation carries. */}
          <Link
            to={roomPath(roomId, null)}
            title="Go to the main line’s room"
            className="h-9 px-2 flex items-center gap-1.5 rounded-sm border border-gray-200 bg-white text-gray-600 hover:border-gray-400 hover:text-black transition-colors"
          >
            <span className="text-[10px] font-bold uppercase tracking-wide">Main line</span>
            <ArrowRight size={13} />
          </Link>
          {mayEdit && (
            <div className="mt-3 border-t border-gray-100 pt-3">
              <VariantActions
                reviewId={roomId}
                variant={line}
                mayEdit={mayEdit}
                isMeetingHost={isMeetingHost}
                inRoom
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default LineChip;
