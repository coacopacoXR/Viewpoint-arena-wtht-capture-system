import type * as Party from 'partykit/server';
import type { InsightCard, SpatialComment, LiveChatMessage, XRParticipantData } from '../types';
import type { ReviewDraft } from '../lib/reviewSetupStore';
import { verifyAccessToken, type VerifiedAccount } from './verifyJwt';
import {
  applySceneUpdate as reduceSceneUpdate,
  emptyScene,
  mayChangeModels,
  MAX_SCENE_MODELS,
  type ModelEditors,
  type RoomScene,
  type SceneRefusalReason,
  type SceneStatePayload,
  type SceneUpdate,
} from '../lib/scene/roomScene';
import {
  asModelEditors,
  asRoomScene,
  asSceneUpdate,
  sceneFromLegacyReference,
} from '../lib/scene/sceneWire';

export type WebRTCSignalData =
  | { type: 'offer'; sdp: RTCSessionDescriptionInit }
  | { type: 'answer'; sdp: RTCSessionDescriptionInit }
  | { type: 'ice'; candidate?: RTCIceCandidateInit };

/**
 * What is on screen, by reference — the shape batch BA introduced, kept only so
 * a client that has not been updated can still be understood.
 *
 * `hash` is the SHA-256 the file was stored under (POST /api/models). Clients
 * fetch the bytes from /api/models/<hash> instead of receiving them here, which
 * is what removes the size limit a websocket imposes on a shared model: a room
 * used to carry up to 50 MB of base64 through this payload, held in the server's
 * memory and replayed to every connection that joined. `fileName` travels with
 * the hash because utils/modelLoader.ts dispatches on the extension, and `size`
 * is what a client shows while the download runs.
 *
 * This server no longer SENDS one — it holds a whole scene (RoomScene) and
 * relays that as SCENE_STATE. An arriving MODEL_CHANGE is translated into
 * "the scene is this one model", which is what the message always meant back
 * when the scene could only hold one; see sceneFromLegacyReference.
 */
export interface ModelReference {
  modelType: 'synth' | 'bicycle' | 'imported';
  hash?: string;
  fileName?: string;
  size?: number;
}

/**
 * A MODEL_CHANGE as it arrives, which may still carry bytes.
 *
 * `fileBase64` is declared only so the handler can recognise a payload from a
 * client that has not been updated and DROP it. Nothing stores that field and
 * nothing relays it.
 */
export interface IncomingModelChange extends ModelReference {
  fileBase64?: string;
}

export interface ParticipantPresence {
  userId: string;
  name: string;
  color: string;
  position: [number, number, number];
  lookAt: [number, number, number];
  sameRoom?: boolean;
  // Who this client's camera is locked to, and whether they are mid-nudge
  // (dragging their own view without leaving the follow). Optional so an
  // older client's payload stays valid — a missing field means "not following".
  followingUserId?: string | null;
  followNudged?: boolean;
  // True when this person is in the room without an account, on a deployment
  // whose identity block allows guests. Carried as a flag rather than baked
  // into `name`, so the suffix a UI adds never reaches stored data (tracker
  // items, audit rows, transcripts). Optional: an older client sends nothing,
  // which reads as "not a guest" — the only answer possible before identity.
  guest?: boolean;
  // The signed-in person's access token, sent by the client on the way IN and
  // deleted by the server before this payload is stored, queued, relayed or
  // persisted — see applyVerifiedIdentity. It is a bearer credential: anybody
  // who received it could be that person everywhere in the app, so no code path
  // may put it back on the wire. Optional, and never sent at all by a client on
  // a deployment whose identity.mode is 'none'.
  accessToken?: string;
  // The account behind this presence, stamped by the server from a token it
  // verified — the same id RLS's auth.uid() answers for that person. Never
  // taken from a client: a payload that arrives carrying one without a valid
  // token has it removed, so what another client reads here is either proven or
  // absent.
  accountId?: string;
}

type RoomMessage =
  | { type: 'PRESENCE'; payload: ParticipantPresence }
  | { type: 'LEAVE'; payload: { userId: string } }
  | { type: 'ROSTER'; payload: ParticipantPresence[] }
  | { type: 'PRESENTER_CHANGE'; payload: { agentId: string | null } }
  | { type: 'INSIGHT_CARD'; payload: InsightCard }
  | { type: 'LEADER_CHANGE'; payload: { userId: string | null } }
  | { type: 'BOARDROOM_COUNTDOWN'; payload: Record<string, never> }
  | { type: 'BOARDROOM_STATE'; payload: { active: boolean; leaderId: string | null; takeover: { enabled: boolean; approvedUserIds: string[] } } }
  | { type: 'ARENA_ENTRY'; payload: Record<string, never> }
  | { type: 'LASER_MOVE'; payload: { userId: string; position: [number, number, number] | null; targetId?: string | null; targetMeshName?: string | null; targetPartName?: string | null } }
  | { type: 'PRIVACY_MODE'; payload: { enabled: boolean } }
  | { type: 'LEADER_TAKEOVER'; payload: { userId: string } }
  | { type: 'MODEL_CHANGE'; payload: IncomingModelChange }
  | { type: 'SCENE_STATE'; payload: SceneStatePayload }
  | { type: 'SCENE_UPDATE'; payload: SceneUpdate }
  | { type: 'SCENE_REFUSED'; payload: { reason: SceneRefusalReason } }
  | { type: 'SET_MODEL_EDITORS'; payload: { modelEditors: ModelEditors } }
  | { type: 'REVIEW_CONFIG'; payload: { config: ReviewDraft } }
  | { type: 'HOST_CHANGE'; payload: { hostId: string | null } }
  | { type: 'HOST_TRANSFER'; payload: { toUserId: string } }
  | { type: 'MEETING_END'; payload: Record<string, never> }
  | { type: 'TAKEOVER_SYNC'; payload: { enabled: boolean; approvedUserIds: string[] } }
  | { type: 'PRESENTER_REQUEST'; payload: { fromUserId: string; fromName: string } }
  | { type: 'PRESENTER_REQUEST_DENIED'; payload: { fromUserId: string } }
  | { type: 'TAKEOVER_ATTEMPT'; payload: { userId: string } }
  | { type: 'PRESENTER_CHANGED'; payload: { userId: string } }
  | { type: 'COMMENT_ADD'; payload: { comment: SpatialComment } }
  | { type: 'COMMENT_UPDATE'; payload: { id: string; updates: Partial<SpatialComment> } }
  | { type: 'COMMENT_DELETE'; payload: { id: string } }
  | { type: 'COMMENT_RESOLVE'; payload: { id: string } }
  | { type: 'COMMENT_ROSTER'; payload: { comments: SpatialComment[] } }
  | { type: 'WEBRTC_SIGNAL'; payload: { from: string; to: string; data: unknown } }
  | { type: 'LIVE_CHAT'; payload: LiveChatMessage }
  | { type: 'XR_PRESENCE'; payload: XRParticipantData }
  | { type: 'TRANSCRIPT_LINE'; payload: { id: string; agentId: string; text: string; timestamp: number; speakerName?: string; speakerId?: string; offsetMs?: number } }
  | { type: 'RECORDING_STATE'; payload: { recording: boolean; startedAt: number; byUserId: string; byName: string } }
  | { type: 'POINTING_SEGMENT'; payload: { userId: string; userName: string; partId: string; partName: string; source: 'laser' | 'finger' | 'hover'; fromMs: number; toMs: number } }
  | { type: 'ADMIT'; payload: { userId: string } }
  | { type: 'DECLINE'; payload: { userId: string } }
  | { type: 'SET_JOIN_POLICY'; payload: { policy: 'open' | 'ask' } }
  | { type: 'JOIN_PENDING'; payload: Record<string, never> }
  | { type: 'JOIN_ADMITTED'; payload: Record<string, never> }
  | { type: 'JOIN_DECLINED'; payload: Record<string, never> }
  | { type: 'JOIN_REQUESTS'; payload: { pending: Array<{ userId: string; name: string; since: number; guest?: boolean }> } }
  | { type: 'JOIN_POLICY'; payload: { policy: 'open' | 'ask' } };

const PRESENTER_COOLDOWN = 1500; // ms — server-authoritative cooldown between presenter changes

// Where the admitted set is kept between restarts, and how many of the most
// recent admissions are worth keeping.
const ADMITTED_KEY = 'admitted-user-ids';
const MAX_PERSISTED_ADMISSIONS = 200;

// Where the on-screen model is kept between restarts. See persistCurrentModel
// for why this one is persisted when almost nothing else here is.
//
// Written by batch BA and no longer written now — a room that upgrades finds its
// model under this key and onStart translates it into a scene. Kept as a name so
// that translation has something to read.
const MODEL_KEY = 'current-model';

// Where the scene is kept between restarts, and with it who may change it.
const SCENE_KEY = 'room-scene';

/**
 * A persisted or received model reference, or null when it is not one.
 *
 * Strict in one deliberate direction: a room server that stored its model
 * BEFORE models were synced by reference wrote the base64 bytes into room
 * storage along with it. Restoring that record would replay up to 50 MB to
 * every connection that joins — the exact thing the reference shape exists to
 * stop — so a record carrying `fileBase64` is dropped rather than rescued. The
 * room comes back with no model and the next import puts one up, which is
 * recoverable; a partykit container that runs out of memory on restart is not.
 *
 * An 'imported' record with no hash is refused for the same reason: there would
 * be nothing for a client to fetch, so replaying it would tell every joiner to
 * render a model that does not exist.
 */
function asModelReference(value: unknown): ModelReference | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.fileBase64 === 'string') return null;
  const modelType = record.modelType;
  if (modelType !== 'synth' && modelType !== 'bicycle' && modelType !== 'imported') return null;
  const hash = typeof record.hash === 'string' && record.hash !== '' ? record.hash : undefined;
  if (modelType === 'imported' && !hash) return null;
  return {
    modelType,
    hash,
    fileName: typeof record.fileName === 'string' ? record.fileName : undefined,
    size: typeof record.size === 'number' && Number.isFinite(record.size) ? record.size : undefined,
  };
}

export default class RoomServer implements Party.Server {
  participants = new Map<string, ParticipantPresence>();
  // Ordered by first PRESENCE — index 0 is always the session host
  joinOrder: string[] = [];
  // Maps PartyKit connection ID → app userId (populated on first PRESENCE from that conn)
  connToUser = new Map<string, string>();
  // Server-authoritative presenter tracking (boardroom)
  boardroomLeaderId: string | null = null;
  lastPresenterChange = 0;
  // Takeover-mode policy — held server-side so late joiners get a consistent view
  takeoverModeEnabled = false;
  takeoverApprovedUserIds: string[] = [];
  // What is on screen: every model in the room's scene, each by reference (a
  // hash, a name, a line and a revision), plus which built-in is up when there
  // are none. Persisted to room storage (SCENE_KEY) so a restart does not drop
  // it, and relayed whole to every connection on every change. Never the bytes
  // — see ModelReference.
  //
  // Held HERE rather than on the clients, and changed only by an operation
  // applied to this copy, because the alternative is two people who each send
  // "the scene is this list" and the second one silently undoes the first: they
  // were both working from a list that was already out of date.
  scene: RoomScene = emptyScene();
  // Who may change the models. Enforced here rather than only by hiding a
  // button: the websocket is the thing that has to say no, because a button
  // anybody can put back with devtools is not a permission.
  modelEditors: ModelEditors = 'host';
  // Persisted curated review config (viewpoints, pins, agenda…)
  reviewConfig: ReviewDraft | null = null;
  // Persisted spatial comments for late joiners
  comments: SpatialComment[] = [];
  // Whether the room is currently in boardroom mode — sent to late joiners
  isBoardroomMode = false;
  // Persisted recording state for late joiners (section B: per-speaker mics).
  // Null when no recording is in progress.
  recordingState: { recording: boolean; startedAt: number; byUserId: string; byName: string } | null = null;
  // Per-link join policy. 'ask' (default) means new arrivals must be admitted
  // by the host; 'open' lets anyone through. NOT persisted to Supabase in
  // batch M2 — a PartyKit room that hibernates comes back at 'ask', which is
  // the safe direction.
  joinPolicy: 'open' | 'ask' = 'ask';
  // UserIds that have been admitted through the knock gate.
  admitted = new Set<string>();
  // Pending knock queue: userId → { userId, name, since }.
  pending = new Map<string, { userId: string; name: string; since: number; guest?: boolean }>();
  // Live connection objects keyed by connection id, for targeted sends.
  connections = new Map<string, Party.Connection>();
  // Connection ids that have already been told they are in and handed the
  // room state, so a reconnect gets it once and a chatty client does not
  // get the whole bundle on every PRESENCE.
  stateSent = new Set<string>();
  // Whether we have already logged that audit is not configured (ANON_KEY
  // empty). Logged once per server instance, not per admission.
  private auditNotConfiguredLogged = false;
  // Verified access tokens, per connection: the token string that was checked
  // and the promise that check produced. Presence arrives about ten times a
  // second and the answer only changes when the token does (a refresh, an hour
  // apart), so checking every frame would be an HMAC per frame per participant
  // for nothing. The PROMISE is what is cached, so two frames that arrive while
  // the first check is still in flight share one verification instead of
  // starting a second. Dropped in onClose: a closed connection's credential has
  // no business staying in memory.
  private verifiedTokens = new Map<
    string,
    { token: string; result: Promise<VerifiedAccount | null> }
  >();
  // Whether we have already logged that identity is switched on but cannot be
  // verified (JWT_SECRET empty). Once per server instance, like the audit line.
  private identityNotConfiguredLogged = false;
  // Whether we have already logged that a MODEL_CHANGE was dropped. Once per
  // server instance: an un-updated client sends one per import, and a room that
  // retries would otherwise fill the container's log with the same line.
  private modelChangeDropLogged = false;

  constructor(readonly room: Party.Room) {}

  /**
   * Admissions outlive a restart of this server.
   *
   * Everything else here is deliberately in-memory: a room that comes back
   * empty is a room nobody is in. The admitted set is different, because the
   * container is restarted for upgrades while meetings are running, and
   * without this the first person to reconnect becomes host and everyone else
   * lands back in the queue — the host re-admitting colleagues who never left
   * (seen live 2026-09-23: guest bounced to the waiting room, host shown
   * "Maria wants to join" for someone already in the meeting).
   *
   * onStart runs before the first connection, so the set is restored before
   * any knock is judged. Storage is per room and persisted to the volume the
   * compose file already mounts; if it is unavailable, every path below
   * behaves exactly as it did before, which is the pre-restart-safety
   * behaviour rather than a broken one.
   *
   * The join policy is NOT restored: it goes back to 'ask', which is the safe
   * direction, and a host who wanted an open link can say so again.
   *
   * The scene IS restored, for the same reason as the admitted set: an upgrade
   * restarts this container during a meeting, and a room that came back with
   * nobody's models in it would leave every reconnecting participant staring at
   * the default headphones while the review carries on about a bracket. What is
   * restored is a hash, a name, a line and a revision per model — restoring it
   * costs one small read, and the bytes stay in the store they were uploaded to.
   *
   * A record written before models were synced by reference carries those bytes
   * inline and is dropped instead; see asModelReference. A record written by
   * batch BA, which held ONE model rather than a list, is translated into the
   * one-model scene it always meant, so a room that upgrades mid-review keeps
   * the model it was looking at.
   */
  async onStart() {
    try {
      const saved = await this.room.storage.get<string[]>(ADMITTED_KEY);
      if (Array.isArray(saved)) {
        for (const userId of saved) {
          if (typeof userId === 'string' && userId) this.admitted.add(userId);
        }
      }
    } catch {
      // No storage on this runtime — carry on with an empty set.
    }
    try {
      const saved = await this.room.storage.get(SCENE_KEY);
      if (typeof saved === 'object' && saved !== null) {
        const record = saved as Record<string, unknown>;
        const scene = asRoomScene(record);
        if (scene) {
          this.scene = scene;
          // 'host' when the record predates the setting, which is the default
          // and the safe direction: a room that comes back permissive is a room
          // where anybody can swap the product under discussion.
          this.modelEditors = asModelEditors(record.modelEditors) ?? 'host';
        }
      }
    } catch {
      // No storage on this runtime — the room comes back with no models, which
      // is what it did before, and the next import puts one up.
    }
    if (this.scene.models.length > 0 || this.scene.builtIn !== null) return;
    try {
      const legacy = asModelReference(await this.room.storage.get(MODEL_KEY));
      const translated = legacy ? sceneFromLegacyReference(legacy) : null;
      if (translated) this.scene = translated;
    } catch {
      // Same as above: nothing to restore from, so the room starts empty.
    }
  }

  /**
   * Write the admitted set back. Fire-and-forget: an admission must not wait
   * on a disk write, and a failed write costs a re-admission after a restart,
   * not a broken room. Capped so a long-lived room cannot grow it without
   * bound; a Set keeps insertion order, so the oldest go first.
   */
  private persistAdmitted(): void {
    try {
      const ids = [...this.admitted].slice(-MAX_PERSISTED_ADMISSIONS);
      void this.room.storage.put(ADMITTED_KEY, ids).catch(() => {});
    } catch {
      // No storage on this runtime.
    }
  }

  /**
   * Write the scene, and who may change it, back — the way persistAdmitted does.
   *
   * Fire-and-forget for the same reason: a scene change must not wait on a disk
   * write, and a failed write costs a late joiner the models until somebody
   * changes the scene again, not a broken room. There is no cap to apply beyond
   * MAX_SCENE_MODELS, enforced on the way in, because there is nothing here that
   * grows on its own — this is a hash, a name, a line, a revision and a position
   * per model, which is the whole benefit of syncing by reference.
   */
  private persistScene(): void {
    try {
      void this.room.storage.put(SCENE_KEY, this.sceneStatePayload()).catch(() => {});
    } catch {
      // No storage on this runtime.
    }
  }

  /**
   * Drop a MODEL_CHANGE this room cannot use, and say why once.
   *
   * Once per server instance rather than once per message: an un-updated client
   * sends one of these per import, and a room where three people have not
   * reloaded would otherwise write the same line to the container's log every
   * time any of them touched the model button.
   */
  private dropModelChange(reason: string): void {
    if (this.modelChangeDropLogged) return;
    this.modelChangeDropLogged = true;
    console.log(`[room] dropped a MODEL_CHANGE: ${reason}`);
  }

  /** The scene plus who may change it — what SCENE_STATE carries and storage keeps. */
  private sceneStatePayload(): SceneStatePayload {
    return {
      models: this.scene.models,
      builtIn: this.scene.builtIn,
      modelEditors: this.modelEditors,
    };
  }

  /**
   * Why this connection may not change the models, or null when it may.
   *
   * The host is whoever computeHost() says — the first person in, which is the
   * same answer the client was given by HOST_CHANGE, so the button it disabled
   * and the refusal it gets here are the same judgement made twice rather than
   * two different judgements that can disagree.
   */
  private sceneRefusalFor(senderUserId: string | undefined): SceneRefusalReason | null {
    if (mayChangeModels(this.modelEditors, senderUserId ?? null, this.computeHost())) return null;
    return this.modelEditors === 'host' ? 'host-only' : 'not-an-editor';
  }

  /**
   * Tell ONE connection that its change was refused, and why.
   *
   * Targeted rather than relayed: the room does not need to hear that somebody
   * tried, and the person who tried needs to hear it or their screen would sit
   * there looking as though the click did nothing. Nothing else happens — the
   * scene is untouched, so there is no SCENE_STATE to send and no reason for
   * anybody else's screen to change.
   */
  private refuseScene(conn: Party.Connection, reason: SceneRefusalReason): void {
    conn.send(JSON.stringify({ type: 'SCENE_REFUSED', payload: { reason } } as RoomMessage));
  }

  /**
   * Apply one operation to this room's scene, then tell everybody the result.
   *
   * Relayed to the sender too, and that is the point of the design: there is one
   * copy of the list, it lives here, and every client — including the one that
   * asked for the change — learns what the scene now is from this message rather
   * than from its own optimistic guess. A client that was refused, or that asked
   * for something another client had already done, ends up correct either way.
   */
  private applySceneUpdate(update: SceneUpdate, sender: Party.Connection): void {
    if (update.op === 'add' && this.scene.models.length >= MAX_SCENE_MODELS) {
      this.refuseScene(sender, 'scene-full');
      return;
    }
    const next = reduceSceneUpdate(this.scene, update);
    // The reducer returns the same object when the operation changed nothing —
    // an unknown id, a duplicate add, a flag that already had that value. There
    // is then nothing to write and nothing to say: relaying a scene nobody's
    // copy differs from would redraw every participant's model tree for nothing.
    if (next === this.scene) return;
    this.scene = next;
    this.persistScene();
    this.relay(JSON.stringify({ type: 'SCENE_STATE', payload: this.sceneStatePayload() } as RoomMessage));
  }

  private computeHost(): string | null {
    return this.joinOrder[0] ?? null;
  }

  private boardroomStatePayload() {
    return {
      active: this.isBoardroomMode,
      leaderId: this.boardroomLeaderId,
      takeover: {
        enabled: this.takeoverModeEnabled,
        approvedUserIds: this.takeoverApprovedUserIds,
      },
    };
  }

  private resetBoardroomState() {
    this.isBoardroomMode = false;
    this.boardroomLeaderId = null;
    this.takeoverModeEnabled = false;
    this.takeoverApprovedUserIds = [];
    this.lastPresenterChange = 0;
  }

  private sendRoomState(conn: Party.Connection) {
    conn.send(JSON.stringify({
      type: 'ROSTER',
      payload: Array.from(this.participants.values()),
    } as RoomMessage));
    conn.send(JSON.stringify({
      type: 'HOST_CHANGE',
      payload: { hostId: this.computeHost() },
    } as RoomMessage));
    // The scene always goes, even when it is empty: it carries `modelEditors`
    // too, and a participant who arrives before anybody has imported anything
    // still needs to know whether the import button is theirs to press.
    conn.send(JSON.stringify({
      type: 'SCENE_STATE',
      payload: this.sceneStatePayload(),
    } as RoomMessage));
    if (this.reviewConfig) {
      conn.send(JSON.stringify({ type: 'REVIEW_CONFIG', payload: { config: this.reviewConfig } } as RoomMessage));
    }
    conn.send(JSON.stringify({ type: 'COMMENT_ROSTER', payload: { comments: this.comments } } as RoomMessage));
    conn.send(JSON.stringify({
      type: 'BOARDROOM_STATE',
      payload: this.boardroomStatePayload(),
    } as RoomMessage));
    if (this.recordingState) {
      conn.send(JSON.stringify({
        type: 'RECORDING_STATE',
        payload: this.recordingState,
      } as RoomMessage));
    }
  }

  /**
   * Relay to the room — admitted connections only.
   *
   * `room.broadcast` reaches every open socket, which quietly undoes the gate:
   * a person parked at the door was receiving other people's PRESENCE, and by
   * the same route would have received the live transcript, the comments and
   * the pointing segments of a meeting nobody had let them into (found live
   * 2026-09-23 by reading the guest's websocket frames). Every relay goes
   * through here instead, so admission is the single thing that decides what
   * leaves the server. The only exception is JOIN_POLICY, which is not room
   * content and which the waiting room itself describes.
   */
  private relay(data: string, without: string[] = []) {
    const excluded = [...without];
    for (const connId of this.connections.keys()) {
      const uid = this.connToUser.get(connId);
      if (!uid || !this.admitted.has(uid)) excluded.push(connId);
    }
    this.room.broadcast(data, excluded);
  }

  private broadcastJoinRequests() {
    const list = Array.from(this.pending.values());
    const hostId = this.computeHost();
    if (!hostId) return;
    for (const [connId, userId] of this.connToUser) {
      if (userId === hostId && this.admitted.has(userId)) {
        const conn = this.connections.get(connId);
        if (conn) {
          conn.send(JSON.stringify({
            type: 'JOIN_REQUESTS',
            payload: { pending: list },
          } as RoomMessage));
        }
      }
    }
  }

  private sendToUser(userId: string, msg: RoomMessage) {
    const json = JSON.stringify(msg);
    for (const [connId, uid] of this.connToUser) {
      if (uid === userId) {
        const conn = this.connections.get(connId);
        if (conn) conn.send(json);
      }
    }
  }

  /**
   * Tell every connection of an admitted userId that it is in, and hand it the
   * room state — once per connection. JOIN_ADMITTED goes first so the client
   * can leave the waiting room before the state arrives.
   *
   * Every admitted connection must hear this, not just a brand new
   * participant: a reload or a dropped socket reconnects with the same userId,
   * which is already in `admitted`, and the client's join state starts again at
   * 'joining' on the new socket. Without this the host who refreshes their own
   * room sits on "Connecting…" for ever (found live 2026-09-23).
   */
  private deliverAdmission(userId: string) {
    for (const [connId, uid] of this.connToUser) {
      if (uid !== userId || this.stateSent.has(connId)) continue;
      const conn = this.connections.get(connId);
      if (!conn) continue;
      this.stateSent.add(connId);
      conn.send(JSON.stringify({ type: 'JOIN_ADMITTED', payload: {} } as RoomMessage));
      this.sendRoomState(conn);
    }
  }

  /**
   * Record a grant event (admission, decline, policy change) to the audit
   * table via PostgREST. Fire-and-forget: a failed write must never delay or
   * block an admission. When ANON_KEY is empty, skip silently (one log line
   * per server instance, not per event).
   */
  private audit(
    action: string,
    fields: {
      actorName?: string;
      actorId?: string;
      subjectName?: string;
      subjectId?: string;
      detail?: string;
    },
  ): void {
    const anonKey = this.envValue('ANON_KEY');
    if (!anonKey) {
      if (!this.auditNotConfiguredLogged) {
        this.auditNotConfiguredLogged = true;
        console.log('[audit] ANON_KEY not set — audit log disabled for this room server');
      }
      return;
    }
    // PostgREST serves its tables at the ROOT. `/rest/v1/` is the prefix
    // nginx-proxy rewrites away for the browser, and posting to it from
    // inside the compose network is a 404 — which a fire-and-forget write
    // would have swallowed for ever (checked against the running container).
    const restUrl = (this.envValue('REST_URL') || 'http://rest:3000').replace(/\/+$/, '');
    try {
      void fetch(`${restUrl}/audit_events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${anonKey}`,
          'apikey': anonKey,
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({
          action,
          room_id: this.room.id,
          actor_name: fields.actorName ?? '',
          actor_id: fields.actorId ?? '',
          subject_name: fields.subjectName ?? '',
          subject_id: fields.subjectId ?? '',
          detail: fields.detail ?? '',
        }),
      }).catch(() => {});
    } catch {
      // Synchronous throw from fetch (network down, stub in tests): swallow.
    }
  }

  /**
   * A variable this room server was started with.
   *
   * `room.env`, not `process.env`: room code runs inside workerd, which does
   * not inherit the container's environment. PartyKit puts `--var` values here
   * (deploy/partykit-entrypoint.sh passes them). process.env stays as a
   * fallback for tests and for any runtime that does populate it.
   */
  private envValue(name: string): string | undefined {
    const fromRoom = this.room.env?.[name];
    return typeof fromRoom === 'string' ? fromRoom : process.env[name];
  }

  /**
   * Whether this deployment asks the room server to prove who people are.
   *
   * Anything other than 'none' counts as on, including a value this code has
   * never heard of: a typo in .env should cost an operator a room full of
   * "(guest)" labels they come and ask about, not silently go back to trusting
   * typed names. docker-compose.yml defaults the variable to 'none', so a
   * deployment that never set it gets exactly the pre-identity behaviour.
   */
  private identityRequired(): boolean {
    const mode = this.envValue('IDENTITY_MODE');
    return Boolean(mode) && mode !== 'none';
  }

  /**
   * The verification for one connection's current token, computed at most once
   * per distinct token string. See `verifiedTokens` for why.
   */
  private verifiedToken(
    connId: string,
    token: string,
    secret: string,
  ): Promise<VerifiedAccount | null> {
    const cached = this.verifiedTokens.get(connId);
    if (cached && cached.token === token) return cached.result;
    const result = verifyAccessToken(token, secret);
    this.verifiedTokens.set(connId, { token, result });
    return result;
  }

  /**
   * Replace the self-asserted half of a PRESENCE payload with what a verified
   * access token proves, and remove the token itself.
   *
   * Mutates the payload in place, and that is the whole point: this object is
   * what the handler parsed, and every read of it below — the participants map,
   * the knock queue, the ROSTER a late joiner is handed, the relay to everyone
   * else — happens after this returns. There is therefore no path by which the
   * token reaches another client or the room's persisted storage, and no path
   * by which a name the server did not vouch for is relayed as though it had.
   *
   * The token is deleted on EVERY path, identity 'none' and a payload that
   * carried no token included: dropping a credential because the server
   * happens not to need it is how it ends up relayed by the next change to
   * this file. `accountId` goes the same way, for the same reason — it is
   * stamped here and only from a token this server verified, so a value a
   * client claimed for itself is never handed to anybody else.
   *
   * Returns null rather than a resolved promise when there is nothing to
   * check. `await` on an already-resolved promise still defers the rest of the
   * handler by a microtask, and a room server that relayed every presence of
   * every default install one tick later than it received it would be paying
   * for a feature that is switched off.
   */
  private applyVerifiedIdentity(
    connId: string,
    payload: ParticipantPresence,
  ): Promise<void> | null {
    const raw = payload.accessToken;
    const token = typeof raw === 'string' && raw !== '' ? raw : undefined;
    delete payload.accessToken;
    delete payload.accountId;

    if (!this.identityRequired()) return null;

    const secret = this.envValue('JWT_SECRET');
    if (!secret) {
      // Fail closed, and say so once: everybody in the room reads as a guest
      // until the operator wires the secret through, which is visible in the
      // participant list rather than hidden in a room that looks fine.
      if (!this.identityNotConfiguredLogged) {
        this.identityNotConfiguredLogged = true;
        console.log(
          '[identity] IDENTITY_MODE is set but JWT_SECRET is not — ' +
            'no access token can be verified, so every participant is marked as a guest',
        );
      }
      payload.guest = true;
      return null;
    }

    if (!token) {
      payload.guest = true;
      return null;
    }

    return this.verifiedToken(connId, token, secret).then((verified) => {
      if (!verified) {
        // Expired, forged, or for another audience. The person keeps the name
        // they typed and is marked as a guest, which is what the host's knock
        // prompt and the participant list already render as "not proven".
        payload.guest = true;
        return;
      }
      payload.name = verified.name;
      payload.guest = false;
      payload.accountId = verified.sub;
    });
  }

  onConnect(conn: Party.Connection) {
    this.connections.set(conn.id, conn);
    // Before the connection has identified itself via PRESENCE we can only
    // send the current join policy. The full room state bundle is deferred
    // until the connection is admitted through the knock gate.
    conn.send(JSON.stringify({
      type: 'JOIN_POLICY',
      payload: { policy: this.joinPolicy },
    } as RoomMessage));
  }

  async onMessage(message: string, sender: Party.Connection): Promise<void> {
    let msg: RoomMessage;
    try {
      msg = JSON.parse(message);
    } catch {
      return;
    }

    // Map the connection to its userId early so the gate and onClose agree.
    // PRESENCE is the only message that establishes this mapping; LEAVE only
    // needs it for cleanup, and is also allowed through the gate.
    if (msg.type === 'PRESENCE') {
      this.connToUser.set(sender.id, msg.payload.userId);
      // Who this connection really is, settled BEFORE anything reads the
      // payload: the knock queue, the roster and every relay below must see a
      // name the server vouched for, and none of them may ever see the token
      // that proved it. Awaited only when there was something to verify — see
      // applyVerifiedIdentity for why every other path stays synchronous.
      const verification = this.applyVerifiedIdentity(sender.id, msg.payload);
      if (verification) await verification;
    }

    // Knock gate: a connection that has not been admitted may only send
    // PRESENCE (the knock itself) and LEAVE. Everything else is dropped.
    const senderUserId = this.connToUser.get(sender.id);
    if (senderUserId && !this.admitted.has(senderUserId) && msg.type !== 'PRESENCE' && msg.type !== 'LEAVE') {
      return;
    }

    if (msg.type === 'PRESENCE') {
      const { userId, name } = msg.payload;

      // Already admitted — normal presence update, relay to others.
      if (this.admitted.has(userId)) {
        const isNew = !this.participants.has(userId);
        this.participants.set(userId, msg.payload);

        // A reconnecting connection (reload, dropped socket) is admitted
        // already but has been told nothing yet. No-op once it has.
        this.deliverAdmission(userId);

        if (isNew) {
          this.joinOrder.push(userId);
          this.relay(JSON.stringify({
            type: 'HOST_CHANGE',
            payload: { hostId: this.computeHost() },
          } as RoomMessage));
        }

        this.relay(JSON.stringify(msg), [sender.id]);
        return;
      }

      // Not yet admitted — apply the knock-gate rules.

      // Expire stale pending entries (older than 5 minutes) while we're here.
      const now = Date.now();
      for (const [pid, entry] of this.pending) {
        if (now - entry.since > 5 * 60 * 1000) {
          this.pending.delete(pid);
        }
      }

      // Rule 1: open policy → admit immediately.
      // Rule 2: nobody is in the room → admit immediately, and this userId
      //         becomes the host (it is first in joinOrder). Two cases, one
      //         rule: the very first arrival has nobody to ask, and a waiter
      //         whose host closed the tab would otherwise wait forever.
      //         Keyed on live participants, NOT on `admitted` — that set keeps
      //         past admissions so a reload does not need re-admitting, and so
      //         it never empties.
      if (this.joinPolicy === 'open' || this.participants.size === 0) {
        this.admitted.add(userId);
        this.persistAdmitted();
        this.pending.delete(userId);

        // Now treat this as a normal first PRESENCE for an admitted user.
        const isNew = !this.participants.has(userId);
        this.participants.set(userId, msg.payload);

        if (isNew) {
          this.joinOrder.push(userId);
        }

        this.deliverAdmission(userId);

        // Broadcast presence to the rest of the room (normal join).
        this.relay(JSON.stringify(msg), [sender.id]);

        if (isNew) {
          this.relay(JSON.stringify({
            type: 'HOST_CHANGE',
            payload: { hostId: this.computeHost() },
          } as RoomMessage));
        }

        // If the queue changed, tell the host.
        this.broadcastJoinRequests();
        return;
      }

      // Rule 3: park in pending. Idempotent — only notify the host when the
      // entry is new or what the knock prompt shows them changed.
      const guest = msg.payload.guest === true;
      const existing = this.pending.get(userId);
      if (!existing || existing.name !== name || (existing.guest ?? false) !== guest) {
        this.pending.set(userId, { userId, name, since: existing?.since ?? now, guest });
        this.sendToUser(userId, { type: 'JOIN_PENDING', payload: {} });
        this.broadcastJoinRequests();
      }

    } else if (msg.type === 'ADMIT') {
      // Host-only: admit a pending userId.
      const senderId = this.connToUser.get(sender.id);
      if (senderId !== this.computeHost() || !this.admitted.has(senderId)) return;

      const { userId } = msg.payload;
      const pendingEntry = this.pending.get(userId);
      if (!pendingEntry) return;
      const subjectName = pendingEntry.name;
      this.pending.delete(userId);
      this.admitted.add(userId);
      this.persistAdmitted();

      this.deliverAdmission(userId);

      // Audit: host admitted someone.
      const hostPresence = this.participants.get(senderId);
      this.audit('admitted', {
        actorName: hostPresence?.name ?? '',
        actorId: senderId,
        subjectName,
        subjectId: userId,
      });

      // Broadcast a synthetic PRESENCE so the room sees the new participant.
      // We don't have the full presence payload here, but the newly admitted
      // client will send its own PRESENCE on the next animation frame.
      this.broadcastJoinRequests();

    } else if (msg.type === 'DECLINE') {
      // Host-only: decline a pending userId.
      const senderId = this.connToUser.get(sender.id);
      if (senderId !== this.computeHost() || !this.admitted.has(senderId)) return;

      const { userId } = msg.payload;
      const pendingEntry = this.pending.get(userId);
      if (!pendingEntry) return;
      const subjectName = pendingEntry.name;
      this.pending.delete(userId);

      // Audit: host declined someone.
      const hostPresence = this.participants.get(senderId);
      this.audit('declined', {
        actorName: hostPresence?.name ?? '',
        actorId: senderId,
        subjectName,
        subjectId: userId,
      });

      this.sendToUser(userId, { type: 'JOIN_DECLINED', payload: {} });
      this.broadcastJoinRequests();

    } else if (msg.type === 'SET_JOIN_POLICY') {
      // Host-only: change the join policy.
      const senderId = this.connToUser.get(sender.id);
      if (senderId !== this.computeHost() || !this.admitted.has(senderId)) return;

      this.joinPolicy = msg.payload.policy;

      // Audit: host changed the join policy.
      const hostPresence = this.participants.get(senderId);
      this.audit('join_policy', {
        actorName: hostPresence?.name ?? '',
        actorId: senderId,
        detail: this.joinPolicy,
      });

      // Switching to 'open' drains the queue — admit everyone pending.
      if (this.joinPolicy === 'open') {
        for (const [userId] of this.pending) {
          this.pending.delete(userId);
          this.admitted.add(userId);
          this.persistAdmitted();
          this.deliverAdmission(userId);
        }
      }

      // Everyone, waiters included: the policy is what the waiting room and
      // the invite popup describe, and it is not room content.
      this.room.broadcast(JSON.stringify({
        type: 'JOIN_POLICY',
        payload: { policy: this.joinPolicy },
      } as RoomMessage));
      this.broadcastJoinRequests();

    } else if (msg.type === 'HOST_TRANSFER') {
      // Move target to front of join order → they become new host
      const { toUserId } = msg.payload;
      this.joinOrder = [toUserId, ...this.joinOrder.filter(id => id !== toUserId)];
      this.relay(JSON.stringify({
        type: 'HOST_CHANGE',
        payload: { hostId: this.computeHost() },
      } as RoomMessage));

    } else if (msg.type === 'LEADER_TAKEOVER') {
      // Host-initiated presenter change (or accepted request). Authoritative on the
      // server so the sender + every other client end up agreeing on the leader.
      const { userId } = msg.payload;
      // Allow only if the requested user is actually a known participant — guards
      // against stale UI clicks for users who just left.
      if (!this.participants.has(userId)) return;
      this.boardroomLeaderId = userId;
      this.lastPresenterChange = Date.now();
      // Broadcast to ALL connections (no exclude) so the sender's UI updates too.
      this.relay(JSON.stringify(msg));

    } else if (msg.type === 'TAKEOVER_ATTEMPT') {
      // Server validates cooldown + approval and broadcasts authoritative
      // PRESENTER_CHANGED to ALL clients (including the attempter).
      const now = Date.now();
      const { userId } = msg.payload;
      if (
        this.takeoverModeEnabled &&
        this.takeoverApprovedUserIds.includes(userId) &&
        this.participants.has(userId) &&
        userId !== this.boardroomLeaderId &&
        now - this.lastPresenterChange > PRESENTER_COOLDOWN
      ) {
        this.boardroomLeaderId = userId;
        this.lastPresenterChange = now;
        this.relay(JSON.stringify({
          type: 'PRESENTER_CHANGED',
          payload: { userId },
        } as RoomMessage));
      }
      // If gated out (cooldown, not approved, already presenter), silently ignore

    } else if (msg.type === 'TAKEOVER_SYNC') {
      // Host-driven policy update. Persist on the server so late joiners and
      // re-entries see a consistent state, and prune stale userIds.
      const { enabled, approvedUserIds } = msg.payload;
      this.takeoverModeEnabled = enabled;
      this.takeoverApprovedUserIds = approvedUserIds.filter(id => this.participants.has(id));
      // Echo the pruned list to everyone so clients stay in lock-step
      this.relay(JSON.stringify({
        type: 'TAKEOVER_SYNC',
        payload: { enabled: this.takeoverModeEnabled, approvedUserIds: this.takeoverApprovedUserIds },
      } as RoomMessage));

    } else if (msg.type === 'SCENE_UPDATE') {
      // The room's scene, changed by one operation rather than replaced by one
      // list. Validated first: this payload came from a browser and is about to
      // be written into room state, into persisted storage, and out to every
      // other connection, so a field this server has never heard of must not be
      // able to ride along.
      const senderId = this.connToUser.get(sender.id);
      const refusal = this.sceneRefusalFor(senderId);
      if (refusal) {
        this.refuseScene(sender, refusal);
        return;
      }
      const update = asSceneUpdate(msg.payload);
      if (!update) {
        this.refuseScene(sender, 'unreadable-update');
        return;
      }
      this.applySceneUpdate(update, sender);

    } else if (msg.type === 'SET_MODEL_EDITORS') {
      // Host-only, and a step above the scene itself: whoever may change the
      // models decides what everybody else's import button does, so letting a
      // non-host set it would have been letting them grant themselves the right.
      const senderId = this.connToUser.get(sender.id);
      if (senderId !== this.computeHost() || !this.admitted.has(senderId)) {
        this.refuseScene(sender, 'host-only-setting');
        return;
      }
      const editors = asModelEditors(msg.payload.modelEditors);
      if (!editors) {
        this.refuseScene(sender, 'unreadable-update');
        return;
      }
      this.modelEditors = editors;
      this.persistScene();
      this.audit('model_editors', {
        actorName: this.participants.get(senderId)?.name ?? '',
        actorId: senderId,
        detail: Array.isArray(editors) ? `named:${editors.length}` : editors,
      });
      this.relay(JSON.stringify({
        type: 'SCENE_STATE',
        payload: this.sceneStatePayload(),
      } as RoomMessage));

    } else if (msg.type === 'MODEL_CHANGE') {
      // A client that has not been updated still sends the file itself. Dropped
      // rather than relayed or stored: this server keeps the scene in memory and
      // replays it to every connection that joins, so accepting it would put up
      // to 50 MB per import back on exactly the path the reference shape
      // removed. Nothing the sender can see breaks — their own screen already
      // shows the model they imported — and the line in the log names the cause.
      if (typeof msg.payload.fileBase64 === 'string') {
        this.dropModelChange(
          'it carried fileBase64, which means that client has not been updated. ' +
            'Models travel as a hash now (docs/plan/14-rooms-models-admin-ai.md).',
        );
        return;
      }
      // Validated, and then rebuilt rather than stored as received: a field this
      // handler has never heard of must not be able to ride into room state,
      // into persisted storage, or out to every other connection.
      const reference = asModelReference(msg.payload);
      if (!reference) {
        this.dropModelChange('it was not a model reference this server could read.');
        return;
      }
      // Permission is checked on the translated change, not waived because the
      // message arrived in the old shape: an un-updated client is still a client,
      // and "who may change models" would mean nothing to one that had not
      // reloaded since the setting was introduced.
      const refusal = this.sceneRefusalFor(this.connToUser.get(sender.id));
      if (refusal) {
        this.refuseScene(sender, refusal);
        return;
      }
      const translated = sceneFromLegacyReference(reference);
      if (!translated) {
        this.dropModelChange('it could not be read as a model this room could fetch.');
        return;
      }
      // "The scene is this one model", which is what the message always meant
      // when the scene could only hold one. Replaces whatever was there, so a
      // room with an old client in it behaves the way that client expects.
      this.scene = translated;
      this.persistScene();
      this.relay(JSON.stringify({
        type: 'SCENE_STATE',
        payload: this.sceneStatePayload(),
      } as RoomMessage));

    } else if (msg.type === 'REVIEW_CONFIG') {
      this.reviewConfig = msg.payload.config;
      this.relay(JSON.stringify(msg), [sender.id]);

    } else if (msg.type === 'COMMENT_ADD') {
      this.comments.push(msg.payload.comment);
      this.relay(JSON.stringify(msg), [sender.id]);

    } else if (msg.type === 'COMMENT_UPDATE') {
      const { id, updates } = msg.payload;
      const idx = this.comments.findIndex((c) => c.id === id);
      if (idx !== -1) {
        this.comments[idx] = { ...this.comments[idx], ...updates };
      }
      this.relay(JSON.stringify(msg), [sender.id]);

    } else if (msg.type === 'COMMENT_DELETE') {
      this.comments = this.comments.filter((c) => c.id !== msg.payload.id);
      this.relay(JSON.stringify(msg), [sender.id]);

    } else if (msg.type === 'COMMENT_RESOLVE') {
      const idx = this.comments.findIndex((c) => c.id === msg.payload.id);
      if (idx !== -1) {
        this.comments[idx] = { ...this.comments[idx], resolved: true };
      }
      this.relay(JSON.stringify(msg), [sender.id]);

    } else if (msg.type === 'WEBRTC_SIGNAL') {
      // Relay to all peers; client filters by `to` field
      this.relay(JSON.stringify(msg), [sender.id]);

    } else if (msg.type === 'BOARDROOM_COUNTDOWN') {
      // Seed boardroom state. Leader defaults to the current host until someone
      // is explicitly promoted via LEADER_TAKEOVER or TAKEOVER_ATTEMPT.
      this.isBoardroomMode = true;
      this.boardroomLeaderId = this.computeHost();
      // Clean slate for takeover policy each entry — host re-enables explicitly
      this.takeoverModeEnabled = false;
      this.takeoverApprovedUserIds = [];
      this.lastPresenterChange = Date.now();
      this.relay(JSON.stringify(msg), [sender.id]);

    } else if (msg.type === 'ARENA_ENTRY') {
      // Leaving boardroom — wipe all boardroom state so the next entry is clean
      this.resetBoardroomState();
      this.relay(JSON.stringify(msg), [sender.id]);

    } else if (msg.type === 'RECORDING_STATE') {
      // Persist for late joiners. Only the host should send this, but the
      // server does not enforce that — the client-side RecordingContext
      // gates it behind canRecord (host-only). Broadcasting to ALL (no
      // exclude) so the sender's own indicator stays in sync.
      this.recordingState = msg.payload;
      this.relay(JSON.stringify(msg));

    } else if (msg.type === 'TRANSCRIPT_LINE') {
      // Server-authoritative speaker stamp: overwrite speakerId with the
      // connection's own userId so nobody can forge a line as somebody
      // else. This closes a hole that existed before section B — the old
      // passthrough relay trusted the client-supplied speakerName/id.
      const userId = this.connToUser.get(sender.id);
      if (userId) {
        msg.payload.speakerId = userId;
      }
      this.relay(JSON.stringify(msg), [sender.id]);

    } else if (msg.type === 'POINTING_SEGMENT') {
      // Same trust model as TRANSCRIPT_LINE: the server stamps userId from
      // the connection so one client cannot forge segments as another.
      const userId = this.connToUser.get(sender.id);
      if (userId) {
        msg.payload.userId = userId;
      }
      this.relay(JSON.stringify(msg), [sender.id]);

    } else if (
      msg.type === 'PRESENTER_CHANGE' ||
      msg.type === 'INSIGHT_CARD' ||
      msg.type === 'LEADER_CHANGE' ||
      msg.type === 'LASER_MOVE' ||
      msg.type === 'PRIVACY_MODE' ||
      msg.type === 'MEETING_END' ||
      msg.type === 'PRESENTER_REQUEST' ||
      msg.type === 'PRESENTER_REQUEST_DENIED' ||
      msg.type === 'LIVE_CHAT' ||
      msg.type === 'XR_PRESENCE'
    ) {
      this.relay(JSON.stringify(msg), [sender.id]);
    }
  }

  onClose(conn: Party.Connection) {
    this.connections.delete(conn.id);
    this.stateSent.delete(conn.id);
    // The connection's access token, and the verdict on it, go with it. A
    // reconnect arrives with its own token and is verified again.
    this.verifiedTokens.delete(conn.id);
    const userId = this.connToUser.get(conn.id);
    this.connToUser.delete(conn.id);

    // Drop any pending knock entry for this connection.
    if (userId) {
      const wasPending = this.pending.has(userId);
      this.pending.delete(userId);
      if (wasPending) {
        this.broadcastJoinRequests();
      }
    }

    if (!userId || !this.participants.has(userId)) return;

    this.participants.delete(userId);
    this.joinOrder = this.joinOrder.filter(id => id !== userId);

    // Prune the leaving user out of any boardroom approvals/leadership so the
    // remaining room doesn't chase a ghost.
    let takeoverChanged = false;
    if (this.takeoverApprovedUserIds.includes(userId)) {
      this.takeoverApprovedUserIds = this.takeoverApprovedUserIds.filter(id => id !== userId);
      takeoverChanged = true;
    }

    let leaderChanged = false;
    if (this.boardroomLeaderId === userId) {
      this.boardroomLeaderId = this.computeHost();
      this.lastPresenterChange = Date.now();
      leaderChanged = true;
    }

    this.relay(JSON.stringify({
      type: 'LEAVE',
      payload: { userId },
    } as RoomMessage));

    this.relay(JSON.stringify({
      type: 'HOST_CHANGE',
      payload: { hostId: this.computeHost() },
    } as RoomMessage));

    if (takeoverChanged) {
      this.relay(JSON.stringify({
        type: 'TAKEOVER_SYNC',
        payload: { enabled: this.takeoverModeEnabled, approvedUserIds: this.takeoverApprovedUserIds },
      } as RoomMessage));
    }

    if (leaderChanged && this.boardroomLeaderId) {
      this.relay(JSON.stringify({
        type: 'LEADER_TAKEOVER',
        payload: { userId: this.boardroomLeaderId },
      } as RoomMessage));
    }

    // The admission is deliberately NOT revoked here. PartySocket reconnects
    // on its own after a network blip, and a browser reload keeps the same
    // userId (sessionStorage), so revoking would send the host to the back of
    // their own queue for refreshing the page. A new tab gets a new userId and
    // knocks like any other arrival, and a room with nobody left in it admits
    // its next knock by rule 2 — so nothing stays locked.

    // Send the pending queue to the new host (if any) so they see waiters
    // immediately after a host transfer.
    if (this.pending.size > 0) {
      this.broadcastJoinRequests();
    }
  }
}
