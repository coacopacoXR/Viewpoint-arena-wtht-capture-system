// The picture the lobby shows of a design review: one frame of the room's own 3D
// scene, downscaled to a small JPEG and stored on the review's row.
//
// docs/plan/15-sessions-and-variants.md batch BO. The lobby's cards used to be
// title, counts and a colour, which is a list of reviews that all look the same
// and none of which you can recognise from across the room. What makes a review
// recognisable is its scene, and the only place that scene exists is the WebGL
// canvas of a browser that is standing in it — so the picture is taken there,
// once, and stored as a data URL in `review_curations.thumbnail`. Not in model
// storage and not behind an endpoint of its own: a card that had to ask a second
// system for its picture is a card that renders empty while it waits, and the
// row the lobby already reads is the one place the picture can arrive with the
// review it belongs to.
//
// Two limits keep that affordable, and both are enforced here rather than left to
// the caller: 480x270, because a card is a few hundred pixels wide and a phone
// preview is not much more, and about 60 KB of base64, because a lobby of thirty
// reviews is thirty of these read in one query. A capture that will not fit is
// NOT written — not squeezed harder and not written anyway. A lobby that has to
// download two megabytes before it shows anything has lost the thing the
// thumbnail was for.
//
// Nothing in this file throws, and every function answers a value: null for "no
// picture", false for "not stored". Both are ordinary outcomes — a canvas that
// taints, a renderer that has not sized itself yet, a self-hosted install with no
// database, a review whose row predates the column — and all of them happen with
// a person standing in a working room. A thumbnail is a nicety there; losing the
// room over one is not a trade anybody would make.

import { supabase, supabaseConfigured } from '../supabase';

/** The picture the lobby stores: a JPEG data URL, small enough to read in a list. */
export const THUMBNAIL_MAX_WIDTH = 480;
export const THUMBNAIL_MAX_HEIGHT = 270;
export const THUMBNAIL_QUALITY = 0.7;
/** ~60 KB of base64. A bigger one is not written — see fitsThumbnailBudget. */
export const THUMBNAIL_MAX_BYTES = 60 * 1024;

/**
 * The part of an HTMLCanvasElement this file reads. Typed structurally so a test
 * can hand it a fake — jsdom has no canvas 2D implementation at all, and the
 * interesting behaviour here is the arithmetic and the refusals, not the browser.
 *
 * A real HTMLCanvasElement satisfies it, and so does a three.js renderer's
 * `domElement`, which is what captureRoomThumbnail is handed.
 */
export interface ThumbnailCanvas {
  width: number;
  height: number;
  toDataURL(type: string, quality: number): string;
}

/**
 * The part of a 2D context this file uses.
 *
 * `image` is `unknown` and not `ThumbnailCanvas` so that a real CanvasRenderingContext2D
 * satisfies this interface: its own `drawImage` takes a `CanvasImageSource`, and a
 * narrower parameter here would make the two incompatible in both directions, so the
 * browser's own context could not be handed to `downscaleJpeg` without a cast. Nothing
 * in this file inspects the value — it is drawn and that is all — so `unknown` is also
 * the honest type for what it does with it.
 */
export interface ThumbnailContext {
  drawImage(image: unknown, dx: number, dy: number, dw: number, dh: number): void;
}

/**
 * Makes the offscreen canvas the downscale draws into. `document.createElement`
 * in the browser:
 *
 *     const makeCanvas: CanvasFactory = (width, height) => {
 *       const canvas = document.createElement('canvas');
 *       canvas.width = width;
 *       canvas.height = height;
 *       return { canvas, context: canvas.getContext('2d') };
 *     };
 *
 * A parameter rather than a call inside this file for the reason the rest of the
 * shapes here are parameters: the context is `null` when the browser has run out
 * of them, which is a real answer on a phone that has a dozen canvases open, and
 * the caller cannot be told that unless it is the caller's factory that answers.
 */
export type CanvasFactory = (
  width: number,
  height: number,
) => { canvas: ThumbnailCanvas; context: ThumbnailContext | null };

/**
 * The scaled size that fits inside the maximum, keeping the aspect ratio, never
 * upscaling.
 *
 * Never upscaling is the part worth stating: a room rendered into a 200x100
 * canvas — a narrow window, a mobile split view — has 200x100 pixels of scene in
 * it, and stretching that to 480x270 invents the rest. A card whose thumbnail is
 * a blur is worse than one that is small.
 *
 * Zero, negative and NaN dimensions all answer `{ width: 0, height: 0 }`, which
 * is this file's "there is no picture here". They come from a canvas read before
 * the renderer gave it a size, and the caller writes nothing for them rather than
 * storing a 0x0 JPEG that every `<img>` in the lobby would then fail to decode.
 */
export function thumbnailSize(
  width: number,
  height: number,
  maxWidth: number = THUMBNAIL_MAX_WIDTH,
  maxHeight: number = THUMBNAIL_MAX_HEIGHT,
): { width: number; height: number } {
  const usable = (value: number): boolean => Number.isFinite(value) && value > 0;
  if (!usable(width) || !usable(height) || !usable(maxWidth) || !usable(maxHeight)) {
    return { width: 0, height: 0 };
  }
  // One scale for both axes, clamped at 1 so a source smaller than the maximum is
  // copied at its own size rather than enlarged to fill it.
  const scale = Math.min(1, maxWidth / width, maxHeight / height);
  return {
    // Rounded, and never down to zero: a 1000x1 source is still a picture, and a
    // 0 would read to the caller as "no thumbnail at all".
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * True when a data URL is small enough to store. Counts the BASE64 payload, not
 * the whole string: `data:image/jpeg;base64,` is 23 characters of envelope that
 * says nothing about how much picture is coming, and a budget measured on it
 * would be a budget that grew with the mime type.
 *
 * The payload's character length IS its byte count — base64 is ASCII by
 * definition — so there is nothing to decode, and decoding 60 KB to measure it
 * would be the expensive way to get the same number.
 *
 * An empty string, a non-`data:` string, `data:,` and a `data:` URL with no
 * comma are all out of budget. They are what a browser answers for a canvas it
 * could not encode, and treating one as a thumbnail would put a broken `<img>` in
 * the lobby.
 */
export function fitsThumbnailBudget(dataUrl: string, maxBytes: number = THUMBNAIL_MAX_BYTES): boolean {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return false;
  const comma = dataUrl.indexOf(',');
  if (comma < 0) return false;
  const payload = dataUrl.slice(comma + 1);
  if (payload === '') return false;
  const limit = Number.isFinite(maxBytes) && maxBytes > 0 ? maxBytes : THUMBNAIL_MAX_BYTES;
  return payload.length <= limit;
}

/**
 * Downscale a rendered canvas into a JPEG data URL, or null.
 *
 * Synchronous on purpose: a WebGL canvas only holds its drawing buffer until the
 * next composite, so the caller must be able to read it in the same frame it
 * rendered. An `await` anywhere in this path — including one hidden inside a
 * helper it calls — is the difference between a picture of the room and a
 * picture of whatever the buffer happened to be holding.
 *
 * The downscale goes through a 2D canvas rather than reading the WebGL one
 * directly because a JPEG of the room at 1920x1080 is the thing that must not be
 * stored, and `drawImage` into a smaller canvas is the one resize every browser
 * has.
 */
export function downscaleJpeg(
  source: ThumbnailCanvas,
  makeCanvas: CanvasFactory,
  quality: number = THUMBNAIL_QUALITY,
): string | null {
  try {
    const size = thumbnailSize(source.width, source.height);
    // No area, no picture — see thumbnailSize. Checked before the factory is
    // called, so a degenerate source does not allocate a canvas for nothing.
    if (size.width === 0 || size.height === 0) return null;

    const { canvas, context } = makeCanvas(size.width, size.height);
    // A null context is the browser out of them, not a bug here, and there is no
    // second way to resize.
    if (!context) return null;

    context.drawImage(source, 0, 0, size.width, size.height);
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    // `'data:,'` is what Safari hands back for a canvas it will not encode, and
    // an empty string is what an out-of-memory one hands back. Neither is a
    // picture, and fitsThumbnailBudget would refuse both anyway — the explicit
    // test is here because "no thumbnail" and "thumbnail too big" are worth
    // telling apart when this is read in a log.
    if (!dataUrl || dataUrl === 'data:,') return null;
    if (!fitsThumbnailBudget(dataUrl)) return null;
    return dataUrl;
  } catch (err) {
    // A tainted canvas throws on drawImage and on toDataURL, and a very large one
    // can throw on the allocation. Both leave the review working without a card
    // picture, which is the state it was in before this batch existed.
    console.error('[thumbnail] could not downscale the scene:', err);
    return null;
  }
}

/** The part of a three.js WebGLRenderer this file touches. */
export interface ThumbnailRenderer {
  render(scene: unknown, camera: unknown): void;
  domElement: ThumbnailCanvas;
}

/**
 * Render one frame and read it. Returns null when the room has nothing to show.
 *
 * The render happens in here rather than being left to the caller, and the read
 * follows it immediately. React-three-fiber creates its WebGL context WITHOUT
 * `preserveDrawingBuffer` unless the caller asked for it, and without that flag
 * the drawing buffer's contents are undefined once the frame has been composited
 * — so reading a canvas this function did not just render into is reading
 * whatever the driver left in it, which is usually black and sometimes the
 * previous frame. That is why render and read are one synchronous call, and why
 * nothing in this file may separate them with an await or a requestAnimationFrame.
 *
 * (components/Scene/ViewpointCanvas.tsx does ask for `preserveDrawingBuffer`,
 * because its "Save this view" reads the canvas from a button press that can land
 * between frames. This is written not to depend on that flag: a room mounted
 * without it still produces a thumbnail, and a room mounted with it produces the
 * same one.)
 */
export function captureRoomThumbnail(
  gl: ThumbnailRenderer,
  scene: unknown,
  camera: unknown,
  makeCanvas: CanvasFactory,
  quality: number = THUMBNAIL_QUALITY,
): string | null {
  try {
    gl.render(scene, camera);
    const canvas = gl.domElement;
    // A renderer that has not been given a size yet has a 0x0 canvas, and a
    // detached one may have no canvas at all. Both are "not yet", and the caller
    // can simply ask again on a later frame.
    if (!canvas || !(canvas.width > 0) || !(canvas.height > 0)) return null;
    return downscaleJpeg(canvas, makeCanvas, quality);
  } catch (err) {
    // A renderer whose context was lost throws on render rather than drawing
    // nothing, and a lost context is an ordinary thing to happen to a room that
    // has been open since morning.
    console.error('[thumbnail] could not capture the room:', err);
    return null;
  }
}

/**
 * Write the thumbnail onto the review's own row.
 *
 * @returns false when it did not land (no database, no row, refused, over budget).
 *          Nothing here throws, because the caller is a room with a person in it
 *          and the write is bookkeeping — the same trade lib/reviews/revisionsRepo.ts
 *          makes about a revision it could not record.
 *
 * An update, not an upsert: the row exists by the time a room is on screen, since
 * the lobby created it (lib/curationsRepo.createReview) before it navigated. And
 * an update of ONE column, so a thumbnail captured while somebody else edits the
 * review cannot overwrite their title or their viewpoints — which is the failure
 * a read-modify-write of the whole row would have.
 *
 * This also bumps `updated_at`, because docs/supabase-schema.sql puts a
 * before-update trigger on the table, and the lobby orders by `updated_at`
 * descending. So capturing a thumbnail moves that review up the lobby's list,
 * which is a real effect of opening a room and is accepted rather than worked
 * around: the alternative is writing the column through a path that skips the
 * trigger, and a review whose picture just changed is a review that was just
 * touched.
 */
export async function saveReviewThumbnail(
  reviewId: string | null | undefined,
  thumbnail: string | null,
): Promise<boolean> {
  const id = typeof reviewId === 'string' ? reviewId.trim() : '';
  // Nothing to write it to, or nothing to write. Neither is a failure and neither
  // is worth a round trip: an empty id would update no row and answer success.
  if (id === '' || !thumbnail) return false;

  if (!fitsThumbnailBudget(thumbnail)) {
    // Refused rather than trimmed: a capture that came out over the budget is a
    // scene the downscale could not compress, and storing it would put the one
    // oversized picture in the lobby next to twenty-nine that fit.
    console.error('[thumbnail] refused a capture over the budget:', thumbnail.length);
    return false;
  }

  // The default self-hosted install has no database at all, and lib/supabase.ts
  // hands every query a placeholder client that answers 501. A thumbnail is a
  // nicety on such an install, not a feature that may error on every room open,
  // so it is not attempted — the same gate lib/curationsRepo's realtime paths use.
  if (!supabaseConfigured) return false;

  try {
    const { error } = await supabase
      .from('review_curations')
      .update({ thumbnail })
      .eq('id', id);
    if (error) {
      // The ordinary one on an install that has not re-applied
      // docs/supabase-schema.sql since this batch is "column thumbnail does not
      // exist" — PostgREST refuses the whole request for a column it cannot find.
      // Such an install keeps working with placeholder cards, which is what it
      // did before the column existed.
      console.error('[thumbnail] could not store the thumbnail:', error.code ?? '', error.message ?? '');
      return false;
    }
    return true;
  } catch (err) {
    console.error('[thumbnail] saveReviewThumbnail threw:', err);
    return false;
  }
}
