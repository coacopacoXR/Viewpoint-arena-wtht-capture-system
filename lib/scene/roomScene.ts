// What is on screen in a room, as data — and the rules for changing it.
//
// Batch BA made a model a hash: one file, stored once, fetched by everybody.
// This is the next step the plan asks for (docs/plan/14-rooms-models-admin-ai.md,
// "Other models in the scene", "Model and revisions", "Who may change models"):
// the room holds a LIST of models, each one a revision of a product line, and
// the list is the room server's to keep.
//
// Everything here is pure and dependency-free on purpose. The room server runs
// inside workerd and imports this module to apply a change to its own copy of
// the scene; the browser imports the same module to predict what the server
// will do and to render the result. One reducer, two callers — which is what
// stops a client from believing something the server would never have allowed.

/** A model that ships with the app and has nothing to fetch. */
export type BuiltInModel = 'synth' | 'headphones' | 'bicycle';

/**
 * One model in the room's scene.
 *
 * `hash` is BA's content address: the bytes live in model storage and every
 * participant fetches them from /api/models/<hash>, so this record is small
 * enough to persist, replay to a late joiner and relay on every change.
 *
 * `line` is the product this is — a bracket, a mating part, a competitor's
 * unit — and `revision` is which version of it. Revisions of one line are the
 * continuity the plan asks for: uploading a variation of a model adds Rev B to
 * the same room instead of starting a new one, and Compare can then put A and B
 * side by side.
 *
 * `id` is minted by sceneModelId(hash) and is what everything else keys on: the
 * parsed geometry in the store, and every SCENE_UPDATE that refers to the model.
 * It is derived from the hash rather than random, for the reason given there.
 */
export interface SceneModel {
  id: string;
  hash: string;
  fileName: string;
  line: string;
  revision: string;
  visible: boolean;
  /** Placement in the room, in scene units. See lib/scene/placement.ts. */
  offset: [number, number, number];
}

/**
 * The scene: every model the room is showing, plus which built-in is up when
 * there are none. `builtIn` is null for a room that has only ever held imports.
 */
export interface RoomScene {
  models: SceneModel[];
  builtIn: BuiltInModel | null;
}

/**
 * Who may change the models in this room.
 *
 * 'host' is the default and the safe direction: a design review where a
 * supplier's guest can swap the product under discussion for something else is
 * a meeting nobody controls. 'everyone' is what a team working alone wants, and
 * a list of userIds is the middle ground — the plan's "named people".
 */
export type ModelEditors = 'host' | 'everyone' | string[];

/** What SCENE_STATE carries: the scene, and who is allowed to change it. */
export interface SceneStatePayload extends RoomScene {
  modelEditors: ModelEditors;
}

/**
 * One change a client asks the room server to make.
 *
 * Operations rather than whole scenes, and that is the point: two people who
 * each sent "here is my scene list" would have the second silently undo the
 * first, because neither had seen the other's change yet. An operation says
 * only what it means — hide THIS model, move THAT one — so the server can apply
 * both to its single copy and relay a list that is true for everybody.
 */
export type SceneUpdate =
  | { op: 'add'; model: SceneModel }
  | { op: 'setVisible'; id: string; visible: boolean }
  | { op: 'remove'; id: string }
  | { op: 'setOffset'; id: string; offset: [number, number, number] }
  | { op: 'setBuiltIn'; builtIn: BuiltInModel | null };

/**
 * Why the room server turned a change down. The words a person reads live in describeSceneRefusal.
 *
 * 'host-only' and 'host-only-setting' are batch BB's answers, and they are what
 * a deployment on identity.mode 'none' still gets — there, the meeting host is
 * the only thing resembling an authority. The two 'role-' reasons are batch BC's:
 * on a deployment with accounts, the room server looks up what the signed-in
 * person is IN THIS DESIGN REVIEW (lib/reviews/roles.ts) and refuses them by
 * role, which is a different fact with a different explanation. Telling an
 * editor "only the host can" would have sent them looking for a host who was not
 * the thing standing in their way.
 */
export type SceneRefusalReason =
  | 'host-only'
  | 'not-an-editor'
  | 'host-only-setting'
  | 'role-forbidden'
  | 'role-forbidden-setting'
  | 'scene-full'
  | 'unreadable-update';

/**
 * How many models one room's scene may hold.
 *
 * Every model is a record the room persists and replays to each connection that
 * joins, and a file every one of those connections then downloads. A review
 * compares a product against a mating part and a competitor's version, so the
 * useful number is single figures; the cap exists for the same reason
 * MAX_PERSISTED_ADMISSIONS does, which is that a room server has no other way
 * to stop a client growing its state without bound.
 */
export const MAX_SCENE_MODELS = 24;

/** A scene with nothing in it and no built-in chosen. */
export function emptyScene(): RoomScene {
  return { models: [], builtIn: null };
}

/**
 * The two fields that make something "a revision of a line".
 *
 * A SceneModel has them, and so does a model_revisions row
 * (lib/reviews/revisionsRepo.ts). Taking this instead of SceneModel is what lets
 * the revision-letter arithmetic below have ONE implementation across the scene
 * the room is showing and the history the review has stored — the two lists are
 * not the same, and a second copy of the arithmetic would eventually disagree.
 */
export interface LineRevision {
  line: string;
  revision: string;
}

/** The label the model tree shows: "Bracket · Rev B". */
export function sceneModelLabel(model: Pick<SceneModel, 'line' | 'revision'>): string {
  return `${model.line} · Rev ${model.revision}`;
}

/** A line's name is the file it was first imported from, without the extension. */
export function lineFromFileName(fileName: string): string {
  const base = fileName.replace(/\.[^/.]+$/, '').trim();
  return base === '' ? fileName : base;
}

/**
 * A scene model's id, derived from the file's content hash.
 *
 * A random uuid would be stable inside one room, and the plan asks for a stable
 * id — but it would be a DIFFERENT stable id on every client that built the
 * scene itself, and two of those exist: a review opened from its curation
 * (lib/activeReviewStore) makes a one-model scene out of `asset.modelHash` with
 * no room server involved, and a room makes one out of what the server relays.
 * Pins and comments name the mesh they were placed on, so the same file has to
 * produce the same scene on both paths or a pin made while curating points at
 * nothing once the review is open.
 *
 * The consequence is that one file cannot be in a scene twice: `add` refuses an
 * id that is already there. The import flow says so rather than doing nothing.
 */
export function sceneModelId(hash: string): string {
  return `model-${hash}`;
}

/** The first revision of a new line. */
export const FIRST_REVISION = 'A';

/**
 * The revision letter after this one: A→B, Y→Z, Z→AA, AZ→BA, ZZ→AAA.
 *
 * Excel-column arithmetic, because a product that outlives 26 meetings in one
 * room is exactly the product whose history is worth keeping, and running out
 * of letters in the middle of it would be a silly thing to explain.
 *
 * Anything that is not a run of letters — an empty revision, a restored record
 * somebody hand-edited — reads as "no revision yet", so the next one is A.
 */
export function nextRevisionLetter(revision: string): string {
  const current = revision.trim().toUpperCase();
  if (!/^[A-Z]+$/.test(current)) return FIRST_REVISION;
  const letters = current.split('');
  for (let i = letters.length - 1; i >= 0; i -= 1) {
    if (letters[i] === 'Z') {
      letters[i] = 'A';
      continue;
    }
    letters[i] = String.fromCharCode(letters[i].charCodeAt(0) + 1);
    return letters.join('');
  }
  // Every letter carried: ZZ becomes AAA.
  return `A${letters.join('')}`;
}

/** Which revision of a line is the newest. Later letters are longer, then alphabetical. */
export function latestRevision(models: readonly LineRevision[], line: string): string | null {
  let latest: string | null = null;
  for (const model of models) {
    if (model.line !== line) continue;
    const candidate = model.revision.trim().toUpperCase();
    if (candidate === '') continue;
    if (latest === null || candidate.length > latest.length || (candidate.length === latest.length && candidate > latest)) {
      latest = candidate;
    }
  }
  return latest;
}

/**
 * The revision letter a new upload into `line` should get.
 *
 * Computed from the line's newest letter rather than from the last entry in the
 * array: the array is in the order additions arrived, which is the same thing
 * for a room that has only ever been added to, and is not the same thing for a
 * scene restored from storage that somebody rearranged.
 *
 * Takes anything with a line and a revision, not only a SceneModel, because the
 * same arithmetic decides the letter for a model_revisions row — and there the
 * stored history is the truth rather than whatever the scene happens to hold.
 */
export function nextRevisionFor(models: readonly LineRevision[], line: string): string {
  const latest = latestRevision(models, line);
  return latest === null ? FIRST_REVISION : nextRevisionLetter(latest);
}

/**
 * The id prefix that keeps one model's tree node ids out of another's.
 *
 * Two imported models both number their nodes from zero, so without a prefix
 * the second one's `imported_4` is the first one's `imported_4`: the tree would
 * show one row for two meshes, hiding a part would hide a part of the other
 * model, and a pin would resolve to the wrong geometry on somebody else's
 * screen.
 *
 * Derived from the model's HASH, not from a counter and not from a random id, so
 * that every participant computes the same prefix for the same file — which is
 * what makes a pin placed on my screen point at the same mesh on yours, and what
 * lets a review opened from its curation agree with the same review opened in a
 * room. A counter would have made node ids depend on the order models happened
 * to load in.
 *
 * Eight hex characters collide at about one in four billion per pair, and a
 * scene holds a handful of models.
 */
export function sceneModelPrefix(hash: string): string {
  const slug = hash.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toLowerCase();
  return slug === '' ? 'model' : `m${slug}`;
}

/**
 * Whether this person may change the models in the room.
 *
 * The host always may, whatever the setting says: a room whose host has been
 * locked out of its own scene is a room nobody can fix. A null host means
 * nobody has been named yet — a solo session, or a socket that has not heard
 * HOST_CHANGE — and the app reads that as "you are the host" everywhere else
 * (Interface, SharePanel, ManageButton), so it reads that way here too.
 *
 * The room server calls this with the host it computed itself, and the browser
 * calls it with the host the server told it about, which is why the answer is
 * the same on both sides of the socket. Enforcing it only in the UI would have
 * left the websocket open to anybody who wanted to use it.
 */
export function mayChangeModels(
  modelEditors: ModelEditors,
  userId: string | null,
  hostId: string | null,
): boolean {
  if (userId === null) return hostId === null;
  if (userId === hostId) return true;
  if (hostId === null) return true;
  if (modelEditors === 'everyone') return true;
  if (Array.isArray(modelEditors)) return modelEditors.includes(userId);
  return false;
}

/**
 * What a refusal says, in words.
 *
 * Written out here rather than sent by the server, for the same reason
 * lib/modelsClient.ts writes its own messages: the wire carries a short code
 * and the sentence a person reads lives in the code that shows it.
 */
export function describeSceneRefusal(reason: SceneRefusalReason): string {
  if (reason === 'host-only') {
    return 'Only the host can change the models in this room. Ask them to import it, or to let more people change models.';
  }
  if (reason === 'not-an-editor') {
    return 'The host has chosen who may change models in this room, and you are not one of them.';
  }
  if (reason === 'host-only-setting') {
    return 'Only the host can choose who may change models.';
  }
  if (reason === 'role-forbidden') {
    return 'Only the owner and the editors of this design review can change its models. Ask the owner to make you an editor.';
  }
  if (reason === 'role-forbidden-setting') {
    return 'Only the owner of this design review can choose who may change its models.';
  }
  if (reason === 'scene-full') {
    return `This room is already showing ${MAX_SCENE_MODELS} models. Hide or remove one before adding another.`;
  }
  return 'The room server could not read that scene change, so nothing was changed for anybody.';
}

/**
 * Apply one operation to a scene.
 *
 * Returns the SAME object when the operation changes nothing — an unknown id, a
 * duplicate add, a flag that already had that value. The room server relies on
 * that identity to decide whether there is anything to persist or relay, so a
 * client poking at a model that is not there does not push a fresh SCENE_STATE
 * to everybody in the room.
 *
 * Pure and total: it never throws on an operation it does not recognise, it
 * just leaves the scene alone, because the alternative is a room server that
 * crashes on a message from a client built after it was.
 */
export function applySceneUpdate(scene: RoomScene, update: SceneUpdate): RoomScene {
  switch (update.op) {
    case 'add': {
      if (!scene.models.some((model) => model.id === update.model.id)) {
        return { ...scene, models: [...scene.models, update.model] };
      }
      return scene;
    }
    case 'setVisible': {
      const target = scene.models.find((model) => model.id === update.id);
      if (!target || target.visible === update.visible) return scene;
      return {
        ...scene,
        models: scene.models.map((model) =>
          model.id === update.id ? { ...model, visible: update.visible } : model,
        ),
      };
    }
    case 'remove': {
      if (!scene.models.some((model) => model.id === update.id)) return scene;
      return { ...scene, models: scene.models.filter((model) => model.id !== update.id) };
    }
    case 'setOffset': {
      const target = scene.models.find((model) => model.id === update.id);
      if (!target) return scene;
      if (
        target.offset[0] === update.offset[0] &&
        target.offset[1] === update.offset[1] &&
        target.offset[2] === update.offset[2]
      ) {
        return scene;
      }
      return {
        ...scene,
        models: scene.models.map((model) =>
          model.id === update.id ? { ...model, offset: update.offset } : model,
        ),
      };
    }
    case 'setBuiltIn': {
      if (scene.builtIn === update.builtIn) return scene;
      return { ...scene, builtIn: update.builtIn };
    }
    default:
      return scene;
  }
}

/**
 * Which lines a newly imported file could be a revision of, best guess first:
 * the line with the file's own name ("bracket.step" continues "bracket"), then
 * the line the tree is pointing at, then the rest in scene order. Offering only
 * "the last model added" put a new cube in as Rev B of a STEP assembly and hid
 * the assembly (found live).
 */
export function revisionTargets(
  models: readonly { line: string }[],
  fileName: string,
  activeLine: string | null,
): string[] {
  const lines: string[] = [];
  for (const model of models) if (!lines.includes(model.line)) lines.push(model.line);
  const byName = lineFromFileName(fileName);
  const first = [byName, activeLine].filter((l): l is string => l !== null && lines.includes(l));
  return [...new Set([...first, ...lines])];
}
