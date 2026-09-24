// The review's owner row, and the roster behind it.
//
// docs/plan/14-rooms-models-admin-ai.md batch BC. A design review created by a
// signed-in person belongs to them: review_curations.owner_id names the account,
// and review_members carries the matching 'owner' row so the roster a screen
// renders and the column an ownership transfer writes cannot disagree.
//
// Both are written here and nowhere else, and both are written ONLY into a review
// that has no owner yet. That is what makes an existing review survive this
// batch unchanged: every curation written before accounts existed has owner_id
// NULL, and the first admin to open one claims it in batch BH rather than
// finding it silently reassigned to whoever happened to save it first.
//
// The People screen — adding an editor, removing a participant, transferring
// ownership — is batch BH. This module holds the one membership write BC needs.

import { supabase } from '../supabase';
import { getStoredIdentity } from '../identity';
import type { MemberRole } from './roles';

/**
 * The account this browser is signed in with, or null.
 *
 * The same gate lib/reviewParticipantsRepo and lib/reviews/revisionsRepo use: a
 * guest has no account to own anything, and a deployment whose identity.mode is
 * 'none' never writes an accountId into vp_user — so the default install never
 * calls the database from here at all.
 */
export function signedInAccountId(): string | null {
  const stored = getStoredIdentity();
  if (stored?.guest === true) return null;
  const accountId = stored?.accountId;
  return typeof accountId === 'string' && accountId !== '' ? accountId : null;
}

/**
 * Reviews this browser has already tried to claim.
 *
 * Module-level rather than per call because saveCuration runs on a one-second
 * debounce for as long as a curator edits, and the check costs a read of the row.
 * Once per review per page session is the same guarantee the write needs: the
 * claim is idempotent at the database too (`.is('owner_id', null)`), so this is
 * about not asking the question a hundred times, not about correctness.
 */
const claimed = new Set<string>();

/** Tests, and a review that is closed and reopened in one session. */
export function resetOwnerClaims(): void {
  claimed.clear();
}

/**
 * Make the signed-in person the owner of a review that has no owner.
 *
 * @returns true when THIS call wrote the owner. False for every other outcome —
 *          no account, the review already has an owner, no such row, or a
 *          failure — because the caller has nothing to do about any of them and
 *          a review that could not be claimed still opens and still works.
 *
 * The update is guarded with `.is('owner_id', null)` and the member row is an
 * upsert on the pair, so two curators who both save a brand-new review at the
 * same moment produce one owner: the first update wins, the second matches no
 * row, and neither leaves a roster without its owner in it.
 */
export async function ensureReviewOwner(reviewId: string): Promise<boolean> {
  const accountId = signedInAccountId();
  if (!reviewId || !accountId || claimed.has(reviewId)) return false;
  claimed.add(reviewId);

  try {
    const { data: row, error: readError } = await supabase
      .from('review_curations')
      .select('owner_id')
      .eq('id', reviewId)
      .maybeSingle();
    if (readError || !row) return false;
    if (row.owner_id) return false;

    const { error: updateError } = await supabase
      .from('review_curations')
      .update({ owner_id: accountId })
      .eq('id', reviewId)
      .is('owner_id', null);
    if (updateError) {
      console.error('[membersRepo] could not claim the review:', updateError.message);
      return false;
    }

    const { error: memberError } = await supabase.from('review_members').upsert(
      {
        review_id: reviewId,
        user_id: accountId,
        role: 'owner' satisfies MemberRole,
        added_by: accountId,
      },
      { onConflict: 'review_id,user_id' },
    );
    if (memberError) {
      // owner_id is the column resolveRole reads first, so the review is not
      // ownerless — but the roster is short a row, and the People tab in BH
      // would render an owner who is not listed. Worth a line.
      console.error('[membersRepo] owner_id is set but the roster row failed:', memberError.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[membersRepo] ensureReviewOwner threw:', err);
    return false;
  }
}
