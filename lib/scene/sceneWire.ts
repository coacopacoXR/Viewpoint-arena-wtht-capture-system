// Reading a scene off the wire, and off the room's persisted storage.
//
// Both are untrusted: one comes from a browser this server has never seen, the
// other from a record a PREVIOUS BUILD of this server wrote. Batch BA learned
// why that second one matters the hard way — a room server that stored its
// model before models were synced by reference had written up to 50 MB of
// base64 into room storage, and restoring that record would have replayed the
// bytes to every connection that joined. So every value here is rebuilt field
// by field from what it should be, never returned as received, and anything
// that does not parse is refused rather than rescued.
//
// Nothing in this module imports from party/ or from three, so the room server
// and the browser can share it.

import {
  FIRST_REVISION,
  lineFromFileName,
  sceneModelId,
  type BuiltInModel,
  type ModelEditors,
  type RoomScene,
  type SceneModel,
  type SceneStatePayload,
  type SceneUpdate,
} from './roomScene';

/**
 * A model reference as batch BA defined it — what an un-updated client still
 * sends as MODEL_CHANGE, and what an un-updated server persisted. Declared
 * structurally here so this module does not have to import from party/, which
 * imports from here.
 */
export interface LegacyModelReference {
  modelType: 'synth' | 'bicycle' | 'imported';
  hash?: string;
  fileName?: string;
  size?: number;
}

const BUILT_IN_MODELS: BuiltInModel[] = ['synth', 'headphones', 'bicycle'];

/** Three finite numbers, or nothing. A NaN in an offset would poison every render. */
export function asOffset(value: unknown): [number, number, number] | null {
  if (!Array.isArray(value) || value.length !== 3) return null;
  const [x, y, z] = value;
  if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number') return null;
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
  return [x, y, z];
}

function asBuiltIn(value: unknown): BuiltInModel | null {
  return typeof value === 'string' && (BUILT_IN_MODELS as string[]).includes(value)
    ? (value as BuiltInModel)
    : null;
}

/**
 * One scene model, rebuilt.
 *
 * A model with no hash is refused: there would be nothing for anybody to fetch,
 * so accepting it would tell every participant to render a model that does not
 * exist. `line` and `revision` fall back rather than fail, because a record
 * written before revisions existed is still a perfectly good model — it is the
 * first revision of a line named after its file.
 *
 * `fileBase64` is checked for and refused, which is BA's rule surviving into
 * the list shape: a payload carrying bytes is from a client that has not been
 * updated, and dropping it is what keeps 50 MB off the socket and out of
 * storage. The field is never read.
 */
export function asSceneModel(value: unknown): SceneModel | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  if ('fileBase64' in record) return null;

  const id = typeof record.id === 'string' && record.id !== '' ? record.id : null;
  const hash = typeof record.hash === 'string' && record.hash !== '' ? record.hash : null;
  const fileName = typeof record.fileName === 'string' && record.fileName !== '' ? record.fileName : null;
  if (!id || !hash || !fileName) return null;

  const line = typeof record.line === 'string' && record.line !== '' ? record.line : lineFromFileName(fileName);
  const revision = typeof record.revision === 'string' && record.revision !== '' ? record.revision : FIRST_REVISION;
  const offset = asOffset(record.offset) ?? [0, 0, 0];
  // Rotation and scale, which batch BI found being DROPPED here. asSceneUpdate's
  // setTransform carries both, the room server applies and persists both, and this
  // is the function that reads a scene back off the wire — so a model somebody
  // turned round or resized in Edit mode reached every other participant unturned,
  // and came back unturned to everybody after a room reload from storage. Read the
  // way setTransform reads them: a rotation that is not three finite numbers, or a
  // scale that is not a positive finite one, is left OUT rather than rescued, so
  // "absent means identity" stays the single rule (see sceneModelTransform).
  const rotation = asOffset(record.rotation);
  const rawScale = record.scale;
  const scale = typeof rawScale === 'number' && Number.isFinite(rawScale) && rawScale > 0
    ? rawScale
    : null;

  return {
    id,
    hash,
    fileName,
    line,
    revision,
    visible: record.visible === undefined ? true : record.visible === true,
    offset,
    ...(rotation ? { rotation } : {}),
    ...(scale === null ? {} : { scale }),
  };
}

/** A whole scene, rebuilt. Anything unreadable inside it is dropped, not fatal. */
export function asRoomScene(value: unknown): RoomScene | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.models)) return null;
  const models: SceneModel[] = [];
  for (const entry of record.models) {
    const model = asSceneModel(entry);
    // One bad record must not cost the room the rest of its scene: a model
    // somebody can no longer see is recoverable, an empty room in the middle of
    // a review is not. Duplicate ids are dropped so the list stays addressable.
    if (model && !models.some((existing) => existing.id === model.id)) models.push(model);
  }
  const builtIn = record.builtIn === undefined || record.builtIn === null ? null : asBuiltIn(record.builtIn);
  return { models, builtIn };
}

/**
 * What SCENE_STATE carries, rebuilt — the scene and who may change it.
 *
 * The client validates it too, even though its own room server built it: a
 * SCENE_STATE that threw would take the rest of the message loop with it, and
 * the roster, the transcript and the comments all arrive through the same
 * handler.
 */
export function asSceneStatePayload(value: unknown): SceneStatePayload | null {
  const scene = asRoomScene(value);
  if (!scene) return null;
  const record = value as Record<string, unknown>;
  return { ...scene, modelEditors: asModelEditors(record.modelEditors) ?? 'host' };
}

/** One operation, rebuilt. Null means "this server cannot apply that". */
export function asSceneUpdate(value: unknown): SceneUpdate | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  switch (record.op) {
    case 'add': {
      const model = asSceneModel(record.model);
      return model ? { op: 'add', model } : null;
    }
    case 'setVisible': {
      if (typeof record.id !== 'string' || record.id === '') return null;
      if (typeof record.visible !== 'boolean') return null;
      return { op: 'setVisible', id: record.id, visible: record.visible };
    }
    case 'remove': {
      if (typeof record.id !== 'string' || record.id === '') return null;
      return { op: 'remove', id: record.id };
    }
    case 'setOffset': {
      if (typeof record.id !== 'string' || record.id === '') return null;
      const offset = asOffset(record.offset);
      return offset ? { op: 'setOffset', id: record.id, offset } : null;
    }
    case 'setTransform': {
      if (typeof record.id !== 'string' || record.id === '') return null;
      const raw = record.transform;
      if (typeof raw !== 'object' || raw === null) return null;
      const fields = raw as Record<string, unknown>;
      const offset = asOffset(fields.offset);
      const rotation = asOffset(fields.rotation);
      if (!offset || !rotation) return null;
      // A scale the renderer could not use is refused rather than rescued: zero
      // would make the model vanish for everybody in the room and a negative one
      // would turn it inside out, and neither is a transform anybody meant.
      const scale = fields.scale;
      if (typeof scale !== 'number' || !Number.isFinite(scale) || scale <= 0) return null;
      return { op: 'setTransform', id: record.id, transform: { offset, rotation, scale } };
    }
    case 'setBuiltIn': {
      if (record.builtIn === null) return { op: 'setBuiltIn', builtIn: null };
      const builtIn = asBuiltIn(record.builtIn);
      return builtIn ? { op: 'setBuiltIn', builtIn } : null;
    }
    default:
      return null;
  }
}

/**
 * Who may change models, rebuilt.
 *
 * A list is de-duplicated and capped: it is persisted with the scene and
 * replayed to every connection, so it is the one field here a client could
 * otherwise grow without bound.
 */
export function asModelEditors(value: unknown, maxNamed = 100): ModelEditors | null {
  if (value === 'host' || value === 'everyone') return value;
  if (!Array.isArray(value)) return null;
  const ids: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string' || entry === '') continue;
    if (!ids.includes(entry)) ids.push(entry);
    if (ids.length >= maxNamed) break;
  }
  return ids;
}

/**
 * The scene an old MODEL_CHANGE meant.
 *
 * An un-updated client still sends "here is the model on screen", and the room
 * has to make sense of it rather than drop it: from that client's point of view
 * it imported a model, and everybody else should see it. So the reference
 * becomes a scene holding exactly that one model, which is what the message
 * always meant — it was the whole scene, when the whole scene was one model.
 *
 * The id is derived from the hash so translating the SAME reference twice (a
 * persisted BA record and then a replay of it from an old client) lands on the
 * same model instead of adding a second copy — and so a model an old client put
 * up is the same model a new one would have added, which is what keeps the pins
 * that name its meshes pointing at them.
 *
 * Returns null for a reference carrying bytes, or an imported one with no hash
 * to fetch — BA's refusals, unchanged.
 */
export function sceneFromLegacyReference(reference: LegacyModelReference & { fileBase64?: string }): RoomScene | null {
  if (typeof reference.fileBase64 === 'string') return null;
  if (reference.modelType === 'synth' || reference.modelType === 'bicycle') {
    return { models: [], builtIn: reference.modelType };
  }
  if (reference.modelType !== 'imported') return null;
  const hash = reference.hash ?? '';
  const model = asSceneModel({
    id: sceneModelId(hash),
    hash,
    fileName: reference.fileName ?? 'imported-model',
    line: reference.fileName ? lineFromFileName(reference.fileName) : 'Imported model',
    revision: FIRST_REVISION,
    visible: true,
    offset: [0, 0, 0],
  });
  if (!model) return null;
  return { models: [model], builtIn: null };
}
