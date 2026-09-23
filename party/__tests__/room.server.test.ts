// Tests for room.server.ts — knock-to-join gate, RECORDING_STATE relay,
// TRANSCRIPT_LINE speakerId stamping, and POINTING_SEGMENT relay.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type * as Party from 'partykit/server';
import RoomServer from '../room.server';

// ─── Fakes ──────────────────────────────────────────────────────────────────

function fakeRoom(): Party.Room {
  return {
    id: 'test-room',
    broadcast: vi.fn(),
  } as unknown as Party.Room;
}

interface FakeConnection {
  id: string;
  send: ReturnType<typeof vi.fn>;
}

function fakeConn(id: string): FakeConnection {
  return { id, send: vi.fn() };
}

function createServer(): RoomServer & { room: { broadcast: ReturnType<typeof vi.fn> } } {
  const room = fakeRoom();
  return new RoomServer(room) as RoomServer & { room: { broadcast: ReturnType<typeof vi.fn> } };
}

/** Register a connection (onConnect) and then send PRESENCE to admit it. */
function admitUser(
  server: RoomServer & { room: { broadcast: ReturnType<typeof vi.fn> } },
  conn: FakeConnection,
  userId: string,
  name = 'User',
) {
  server.onConnect(conn as unknown as Party.Connection);
  conn.send.mockClear();
  server.onMessage(
    JSON.stringify({
      type: 'PRESENCE',
      payload: {
        userId,
        name,
        color: '#000',
        position: [0, 0, 0],
        lookAt: [0, 0, 0],
      },
    }),
    conn as unknown as Party.Connection,
  );
}

/** Send PRESENCE without prior onConnect (for testing the gate). */
function sendPresence(server: RoomServer, conn: FakeConnection, userId: string, name = 'User') {
  server.onMessage(
    JSON.stringify({
      type: 'PRESENCE',
      payload: {
        userId,
        name,
        color: '#000',
        position: [0, 0, 0],
        lookAt: [0, 0, 0],
      },
    }),
    conn as unknown as Party.Connection,
  );
}

/**
 * Get a second person all the way in: they knock, the host admits them, and
 * their next PRESENCE lands. Needed because under the default 'ask' policy a
 * bare PRESENCE only parks them — a fixture that skipped the ADMIT was
 * asserting relay behaviour for someone still stuck at the door.
 */
function admitViaHost(
  server: ReturnType<typeof createServer>,
  hostConn: FakeConnection,
  conn: FakeConnection,
  userId: string,
  name = 'User',
) {
  admitUser(server, conn, userId, name); // knock (parks under 'ask')
  server.onMessage(
    JSON.stringify({ type: 'ADMIT', payload: { userId } }),
    hostConn as unknown as Party.Connection,
  );
  sendPresence(server, conn, userId, name);
}

function sentTypes(conn: FakeConnection): string[] {
  return conn.send.mock.calls.map((c) => JSON.parse(c[0] as string).type);
}

// ─── Knock-to-join gate ─────────────────────────────────────────────────────

describe('room.server — knock-to-join gate', () => {
  let server: ReturnType<typeof createServer>;

  beforeEach(() => {
    server = createServer();
  });

  it('admits the first PRESENCE immediately and makes them host', () => {
    const conn = fakeConn('c1');
    admitUser(server, conn, 'alice', 'Alice');

    expect(server.admitted.has('alice')).toBe(true);
    expect(server.participants.has('alice')).toBe(true);
    expect(server.joinOrder[0]).toBe('alice');
    // The first arrival gets JOIN_ADMITTED + room state bundle
    const types = sentTypes(conn);
    expect(types).toContain('JOIN_ADMITTED');
    expect(types).toContain('ROSTER');
    expect(types).toContain('HOST_CHANGE');
  });

  it('parks a second userId under ask policy and sends JOIN_PENDING', () => {
    const hostConn = fakeConn('c-host');
    admitUser(server, hostConn, 'host-1', 'Alice');
    hostConn.send.mockClear();

    const guestConn = fakeConn('c-guest');
    server.onConnect(guestConn as unknown as Party.Connection);
    guestConn.send.mockClear();
    sendPresence(server, guestConn, 'guest-1', 'Bob');

    // Guest is NOT admitted
    expect(server.admitted.has('guest-1')).toBe(false);
    expect(server.participants.has('guest-1')).toBe(false);
    expect(server.pending.has('guest-1')).toBe(true);

    // Guest gets JOIN_PENDING
    expect(sentTypes(guestConn)).toContain('JOIN_PENDING');

    // Host gets JOIN_REQUESTS
    expect(sentTypes(hostConn)).toContain('JOIN_REQUESTS');
  });

  it('pending user does NOT appear in the roster', () => {
    const hostConn = fakeConn('c-host');
    admitUser(server, hostConn, 'host-1', 'Alice');

    const guestConn = fakeConn('c-guest');
    server.onConnect(guestConn as unknown as Party.Connection);
    guestConn.send.mockClear();
    sendPresence(server, guestConn, 'guest-1', 'Bob');

    // The guest should not be in participants at all
    expect(server.participants.has('guest-1')).toBe(false);
  });

  it("host's ADMIT puts the guest in and sends room state", () => {
    const hostConn = fakeConn('c-host');
    admitUser(server, hostConn, 'host-1', 'Alice');
    hostConn.send.mockClear();

    const guestConn = fakeConn('c-guest');
    server.onConnect(guestConn as unknown as Party.Connection);
    guestConn.send.mockClear();
    sendPresence(server, guestConn, 'guest-1', 'Bob');

    // Host admits the guest
    server.onMessage(
      JSON.stringify({ type: 'ADMIT', payload: { userId: 'guest-1' } }),
      hostConn as unknown as Party.Connection,
    );

    expect(server.admitted.has('guest-1')).toBe(true);
    // Guest received JOIN_ADMITTED + room state
    const guestTypes = sentTypes(guestConn);
    expect(guestTypes).toContain('JOIN_ADMITTED');
    expect(guestTypes).toContain('ROSTER');
  });

  it("DECLINE sends JOIN_DECLINED and drops the pending entry", () => {
    const hostConn = fakeConn('c-host');
    admitUser(server, hostConn, 'host-1', 'Alice');
    hostConn.send.mockClear();

    const guestConn = fakeConn('c-guest');
    server.onConnect(guestConn as unknown as Party.Connection);
    guestConn.send.mockClear();
    sendPresence(server, guestConn, 'guest-1', 'Bob');

    server.onMessage(
      JSON.stringify({ type: 'DECLINE', payload: { userId: 'guest-1' } }),
      hostConn as unknown as Party.Connection,
    );

    expect(server.pending.has('guest-1')).toBe(false);
    expect(sentTypes(guestConn)).toContain('JOIN_DECLINED');
  });

  it('ADMIT from a non-host is silently ignored', () => {
    const hostConn = fakeConn('c-host');
    admitUser(server, hostConn, 'host-1', 'Alice');

    const guestConn = fakeConn('c-guest');
    server.onConnect(guestConn as unknown as Party.Connection);
    guestConn.send.mockClear();
    sendPresence(server, guestConn, 'guest-1', 'Bob');

    const otherConn = fakeConn('c-other');
    admitUser(server, otherConn, 'other-1', 'Carol');
    otherConn.send.mockClear();

    // Non-host tries to admit
    server.onMessage(
      JSON.stringify({ type: 'ADMIT', payload: { userId: 'guest-1' } }),
      otherConn as unknown as Party.Connection,
    );

    expect(server.pending.has('guest-1')).toBe(true);
    expect(server.admitted.has('guest-1')).toBe(false);
  });

  it('DECLINE from a non-host is silently ignored', () => {
    const hostConn = fakeConn('c-host');
    admitUser(server, hostConn, 'host-1', 'Alice');

    const guestConn = fakeConn('c-guest');
    server.onConnect(guestConn as unknown as Party.Connection);
    guestConn.send.mockClear();
    sendPresence(server, guestConn, 'guest-1', 'Bob');

    const otherConn = fakeConn('c-other');
    admitUser(server, otherConn, 'other-1', 'Carol');

    server.onMessage(
      JSON.stringify({ type: 'DECLINE', payload: { userId: 'guest-1' } }),
      otherConn as unknown as Party.Connection,
    );

    expect(server.pending.has('guest-1')).toBe(true);
  });

  it("open policy admits immediately", () => {
    server.joinPolicy = 'open';

    const conn1 = fakeConn('c1');
    admitUser(server, conn1, 'alice', 'Alice');

    const conn2 = fakeConn('c2');
    server.onConnect(conn2 as unknown as Party.Connection);
    conn2.send.mockClear();
    sendPresence(server, conn2, 'bob', 'Bob');

    expect(server.admitted.has('bob')).toBe(true);
    expect(server.participants.has('bob')).toBe(true);
    expect(sentTypes(conn2)).toContain('JOIN_ADMITTED');
  });

  it("switching to open drains the pending queue", () => {
    const hostConn = fakeConn('c-host');
    admitUser(server, hostConn, 'host-1', 'Alice');
    hostConn.send.mockClear();

    const guestConn = fakeConn('c-guest');
    server.onConnect(guestConn as unknown as Party.Connection);
    guestConn.send.mockClear();
    sendPresence(server, guestConn, 'guest-1', 'Bob');
    expect(server.pending.has('guest-1')).toBe(true);

    // Host switches to open
    server.onMessage(
      JSON.stringify({ type: 'SET_JOIN_POLICY', payload: { policy: 'open' } }),
      hostConn as unknown as Party.Connection,
    );

    expect(server.pending.has('guest-1')).toBe(false);
    expect(server.admitted.has('guest-1')).toBe(true);
    expect(sentTypes(guestConn)).toContain('JOIN_ADMITTED');
  });

  it('repeated PRESENCE from a pending userId does not resend JOIN_REQUESTS', () => {
    const hostConn = fakeConn('c-host');
    admitUser(server, hostConn, 'host-1', 'Alice');
    hostConn.send.mockClear();

    const guestConn = fakeConn('c-guest');
    server.onConnect(guestConn as unknown as Party.Connection);
    guestConn.send.mockClear();
    sendPresence(server, guestConn, 'guest-1', 'Bob');

    // Count JOIN_REQUESTS sent to host so far
    const jrBefore = hostConn.send.mock.calls.filter(
      (c) => JSON.parse(c[0] as string).type === 'JOIN_REQUESTS',
    ).length;

    // Same userId sends PRESENCE again with same name
    sendPresence(server, guestConn, 'guest-1', 'Bob');

    const jrAfter = hostConn.send.mock.calls.filter(
      (c) => JSON.parse(c[0] as string).type === 'JOIN_REQUESTS',
    ).length;

    expect(jrAfter).toBe(jrBefore);
  });

  it('a knock when admitted is empty is admitted even though policy is ask', () => {
    // Fresh server, policy is 'ask' by default
    expect(server.joinPolicy).toBe('ask');

    const conn = fakeConn('c1');
    server.onConnect(conn as unknown as Party.Connection);
    conn.send.mockClear();
    sendPresence(server, conn, 'first-user', 'First');

    expect(server.admitted.has('first-user')).toBe(true);
    expect(sentTypes(conn)).toContain('JOIN_ADMITTED');
  });

  it('lets a waiter in once the host closes the tab, instead of stranding them', () => {
    // The rule is keyed on who is actually in the room, not on who was ever
    // admitted — otherwise a host who leaves while someone waits locks the
    // room for good, and the waiter's re-knocks are answered by nobody.
    const hostConn = fakeConn('c-host');
    admitUser(server, hostConn, 'host-1', 'Alice');

    const guestConn = fakeConn('c-guest');
    server.onConnect(guestConn as unknown as Party.Connection);
    sendPresence(server, guestConn, 'guest-1', 'Bob');
    expect(server.pending.has('guest-1')).toBe(true);

    server.onClose(hostConn as unknown as Party.Connection);
    guestConn.send.mockClear();

    // The client re-knocks on its timer.
    sendPresence(server, guestConn, 'guest-1', 'Bob');

    expect(server.admitted.has('guest-1')).toBe(true);
    expect(server.pending.has('guest-1')).toBe(false);
    expect(sentTypes(guestConn)).toContain('JOIN_ADMITTED');
    expect(server.joinOrder[0]).toBe('guest-1'); // joinOrder[0] IS the host
  });

  it('does not make an admitted user knock again after a reconnect', () => {
    // A reload keeps the same userId (sessionStorage) and partysocket
    // reconnects on its own after a blip; sending either to the back of the
    // host's queue would be absurd for the host refreshing their own room.
    const hostConn = fakeConn('c-host');
    admitUser(server, hostConn, 'host-1', 'Alice');

    const guestConn = fakeConn('c-guest');
    admitUser(server, guestConn, 'guest-1', 'Bob'); // parked, then admitted below
    server.onMessage(
      JSON.stringify({ type: 'ADMIT', payload: { userId: 'guest-1' } }),
      hostConn as unknown as Party.Connection,
    );
    expect(server.admitted.has('guest-1')).toBe(true);

    server.onClose(guestConn as unknown as Party.Connection);

    // Same userId, new connection — the host is still in the room, so rule 2
    // does not apply; only the kept admission can let them straight back in.
    const againConn = fakeConn('c-guest-2');
    server.onConnect(againConn as unknown as Party.Connection);
    againConn.send.mockClear();
    sendPresence(server, againConn, 'guest-1', 'Bob');

    expect(server.pending.has('guest-1')).toBe(false);
    expect(sentTypes(againConn)).not.toContain('JOIN_PENDING');
    expect(server.participants.has('guest-1')).toBe(true);
    // And it must be TOLD it is in: the client's join state starts at
    // 'joining' on a new socket, so silence leaves it on "Connecting…"
    // for ever — which is exactly what happened to a host who reloaded.
    expect(sentTypes(againConn)).toContain('JOIN_ADMITTED');
    expect(sentTypes(againConn)).toContain('ROSTER');
  });

  it('leaves a waiting connection out of every relay', () => {
    // A hidden waiting-room UI would be worthless if the meeting still
    // streamed to the socket behind it. Whatever the room relays — presence,
    // transcript lines, comments — must skip a connection that is not in.
    const hostConn = fakeConn('c-host');
    admitUser(server, hostConn, 'host-1', 'Alice');

    const waiterConn = fakeConn('c-waiter');
    server.onConnect(waiterConn as unknown as Party.Connection);
    sendPresence(server, waiterConn, 'waiter-1', 'Bob');
    server.room.broadcast.mockClear();

    server.onMessage(
      JSON.stringify({
        type: 'TRANSCRIPT_LINE',
        payload: { id: 't1', agentId: 'a', text: 'the bracket is too thin', timestamp: 1 },
      }),
      hostConn as unknown as Party.Connection,
    );

    const excluded = server.room.broadcast.mock.calls[0][1] as string[];
    expect(excluded).toContain('c-waiter');

    // And once admitted, they are included again.
    server.onMessage(
      JSON.stringify({ type: 'ADMIT', payload: { userId: 'waiter-1' } }),
      hostConn as unknown as Party.Connection,
    );
    server.room.broadcast.mockClear();
    server.onMessage(
      JSON.stringify({
        type: 'TRANSCRIPT_LINE',
        payload: { id: 't2', agentId: 'a', text: 'agreed', timestamp: 2 },
      }),
      hostConn as unknown as Party.Connection,
    );
    expect(server.room.broadcast.mock.calls[0][1] as string[]).not.toContain('c-waiter');
  });

  it('hands the room state to a connection once, not on every PRESENCE', () => {
    const conn = fakeConn('c1');
    admitUser(server, conn, 'alice', 'Alice');
    expect(sentTypes(conn).filter((t) => t === 'ROSTER')).toHaveLength(1);

    conn.send.mockClear();
    sendPresence(server, conn, 'alice', 'Alice'); // the scene's next frame
    expect(sentTypes(conn)).not.toContain('ROSTER');
    expect(sentTypes(conn)).not.toContain('JOIN_ADMITTED');
  });

  it('a pending entry older than five minutes is dropped', () => {
    const hostConn = fakeConn('c-host');
    admitUser(server, hostConn, 'host-1', 'Alice');

    const guestConn = fakeConn('c-guest');
    server.onConnect(guestConn as unknown as Party.Connection);
    guestConn.send.mockClear();
    sendPresence(server, guestConn, 'guest-1', 'Bob');
    expect(server.pending.has('guest-1')).toBe(true);

    // Artificially age the pending entry
    const entry = server.pending.get('guest-1')!;
    entry.since = Date.now() - 6 * 60 * 1000;

    // Next knock triggers expiry check
    sendPresence(server, guestConn, 'guest-1', 'Bob');

    // The old entry was expired and a fresh one was created
    expect(server.pending.has('guest-1')).toBe(true);
    expect(server.pending.get('guest-1')!.since).toBeGreaterThan(entry.since);
  });

  it("non-admitted connection's COMMENT_ADD is dropped", () => {
    const hostConn = fakeConn('c-host');
    admitUser(server, hostConn, 'host-1', 'Alice');
    server.room.broadcast.mockClear();

    const guestConn = fakeConn('c-guest');
    server.onConnect(guestConn as unknown as Party.Connection);
    sendPresence(server, guestConn, 'guest-1', 'Bob');
    // guest is pending, not admitted
    server.room.broadcast.mockClear();

    server.onMessage(
      JSON.stringify({ type: 'COMMENT_ADD', payload: { comment: { id: 'c1', text: 'hi' } } }),
      guestConn as unknown as Party.Connection,
    );

    expect(server.room.broadcast).not.toHaveBeenCalled();
    expect(server.comments).toHaveLength(0);
  });

  it("non-admitted connection's MODEL_CHANGE is dropped", () => {
    const hostConn = fakeConn('c-host');
    admitUser(server, hostConn, 'host-1', 'Alice');
    server.room.broadcast.mockClear();

    const guestConn = fakeConn('c-guest');
    server.onConnect(guestConn as unknown as Party.Connection);
    sendPresence(server, guestConn, 'guest-1', 'Bob');
    server.room.broadcast.mockClear();

    server.onMessage(
      JSON.stringify({ type: 'MODEL_CHANGE', payload: { modelType: 'synth' } }),
      guestConn as unknown as Party.Connection,
    );

    expect(server.room.broadcast).not.toHaveBeenCalled();
  });

  it("non-admitted connection's TRANSCRIPT_LINE is dropped", () => {
    const hostConn = fakeConn('c-host');
    admitUser(server, hostConn, 'host-1', 'Alice');
    server.room.broadcast.mockClear();

    const guestConn = fakeConn('c-guest');
    server.onConnect(guestConn as unknown as Party.Connection);
    sendPresence(server, guestConn, 'guest-1', 'Bob');
    server.room.broadcast.mockClear();

    server.onMessage(
      JSON.stringify({
        type: 'TRANSCRIPT_LINE',
        payload: { id: 'l1', agentId: 'a', text: 'hi', timestamp: 0 },
      }),
      guestConn as unknown as Party.Connection,
    );

    expect(server.room.broadcast).not.toHaveBeenCalled();
  });
});

// ─── RECORDING_STATE ────────────────────────────────────────────────────────

describe('room.server — RECORDING_STATE', () => {
  let server: ReturnType<typeof createServer>;
  let hostConn: FakeConnection;
  let guestConn: FakeConnection;

  beforeEach(() => {
    server = createServer();
    hostConn = fakeConn('conn-host');
    guestConn = fakeConn('conn-guest');
    admitUser(server, hostConn, 'host-1', 'Alice');
    admitViaHost(server, hostConn, guestConn, 'guest-1', 'Bob');
    server.room.broadcast.mockClear();
  });

  it('persists and broadcasts RECORDING_STATE to ALL clients (including sender)', () => {
    server.onMessage(
      JSON.stringify({
        type: 'RECORDING_STATE',
        payload: { recording: true, startedAt: 1000, byUserId: 'host-1', byName: 'Alice' },
      }),
      hostConn as unknown as Party.Connection,
    );

    const broadcast = server.room.broadcast;
    expect(broadcast).toHaveBeenCalledTimes(1);
    const call = broadcast.mock.calls[0];
    const msg = JSON.parse(call[0] as string);
    expect(msg.type).toBe('RECORDING_STATE');
    expect(msg.payload.recording).toBe(true);
    expect(msg.payload.byUserId).toBe('host-1');
    // The sender is included (they need their own state back); the list now
    // carries whoever has not been admitted, which here is nobody.
    expect(call[1] ?? []).not.toContain('conn-host');
    expect(call[1] ?? []).not.toContain('conn-guest');
  });

  it('sends persisted RECORDING_STATE to late joiners via sendRoomState', () => {
    server.onMessage(
      JSON.stringify({
        type: 'RECORDING_STATE',
        payload: { recording: true, startedAt: 1000, byUserId: 'host-1', byName: 'Alice' },
      }),
      hostConn as unknown as Party.Connection,
    );

    const lateConn = fakeConn('conn-late');
    server.onConnect(lateConn as unknown as Party.Connection);
    lateConn.send.mockClear();
    // Late joiner sends PRESENCE and gets admitted (admitted.size > 0, but
    // we set joinPolicy to open for this test to bypass the gate)
    server.joinPolicy = 'open';
    sendPresence(server, lateConn, 'late-1', 'Late');

    const sentMessages = lateConn.send.mock.calls.map((c) => JSON.parse(c[0] as string));
    const recordingMsg = sentMessages.find((m) => m.type === 'RECORDING_STATE');
    expect(recordingMsg).toBeDefined();
    expect(recordingMsg.payload.byUserId).toBe('host-1');
  });

  it('clears recording state when recording stops', () => {
    server.onMessage(
      JSON.stringify({
        type: 'RECORDING_STATE',
        payload: { recording: true, startedAt: 1000, byUserId: 'host-1', byName: 'Alice' },
      }),
      hostConn as unknown as Party.Connection,
    );
    server.onMessage(
      JSON.stringify({
        type: 'RECORDING_STATE',
        payload: { recording: false, startedAt: 0, byUserId: 'host-1', byName: 'Alice' },
      }),
      hostConn as unknown as Party.Connection,
    );

    const lateConn = fakeConn('conn-late');
    server.onConnect(lateConn as unknown as Party.Connection);
    lateConn.send.mockClear();
    server.joinPolicy = 'open';
    sendPresence(server, lateConn, 'late-1', 'Late');

    const sentMessages = lateConn.send.mock.calls.map((c) => JSON.parse(c[0] as string));
    const recordingMsg = sentMessages.find((m) => m.type === 'RECORDING_STATE');
    expect(recordingMsg).toBeDefined();
    expect(recordingMsg.payload.recording).toBe(false);
  });
});

// ─── TRANSCRIPT_LINE ────────────────────────────────────────────────────────

describe('room.server — TRANSCRIPT_LINE speakerId stamping', () => {
  let server: ReturnType<typeof createServer>;
  let conn: FakeConnection;

  beforeEach(() => {
    server = createServer();
    conn = fakeConn('conn-1');
    admitUser(server, conn, 'user-42', 'Alice');
    server.room.broadcast.mockClear();
  });

  it('overwrites speakerId with the connection userId', () => {
    server.onMessage(
      JSON.stringify({
        type: 'TRANSCRIPT_LINE',
        payload: {
          id: 'line-1',
          agentId: 'live-transcript',
          text: 'hello',
          timestamp: Date.now(),
          speakerName: 'Alice',
          speakerId: 'FORGED-ID',
          offsetMs: 0,
        },
      }),
      conn as unknown as Party.Connection,
    );

    const broadcast = server.room.broadcast;
    expect(broadcast).toHaveBeenCalledTimes(1);
    const msg = JSON.parse(broadcast.mock.calls[0][0] as string);
    expect(msg.payload.speakerId).toBe('user-42');
  });

  it('relays to everyone except the sender', () => {
    server.onMessage(
      JSON.stringify({
        type: 'TRANSCRIPT_LINE',
        payload: {
          id: 'line-1',
          agentId: 'live-transcript',
          text: 'hello',
          timestamp: Date.now(),
          speakerName: 'Alice',
          offsetMs: 0,
        },
      }),
      conn as unknown as Party.Connection,
    );

    const broadcast = server.room.broadcast;
    expect(broadcast.mock.calls[0][1]).toEqual([conn.id]);
  });
});

// ─── POINTING_SEGMENT ───────────────────────────────────────────────────────

describe('room.server — POINTING_SEGMENT relay + userId stamping', () => {
  let server: ReturnType<typeof createServer>;
  let conn: FakeConnection;

  beforeEach(() => {
    server = createServer();
    conn = fakeConn('conn-1');
    admitUser(server, conn, 'user-42', 'Alice');
    server.room.broadcast.mockClear();
  });

  it('overwrites userId with the connection userId', () => {
    server.onMessage(
      JSON.stringify({
        type: 'POINTING_SEGMENT',
        payload: {
          userId: 'FORGED-ID',
          userName: 'Alice',
          partId: 'part-1',
          partName: 'Left Ear Cup',
          source: 'laser',
          fromMs: 0,
          toMs: 1000,
        },
      }),
      conn as unknown as Party.Connection,
    );

    const broadcast = server.room.broadcast;
    expect(broadcast).toHaveBeenCalledTimes(1);
    const msg = JSON.parse(broadcast.mock.calls[0][0] as string);
    expect(msg.type).toBe('POINTING_SEGMENT');
    expect(msg.payload.userId).toBe('user-42');
  });

  it('relays to everyone except the sender', () => {
    server.onMessage(
      JSON.stringify({
        type: 'POINTING_SEGMENT',
        payload: {
          userId: 'user-42',
          userName: 'Alice',
          partId: 'part-1',
          partName: 'Left Ear Cup',
          source: 'laser',
          fromMs: 0,
          toMs: 1000,
        },
      }),
      conn as unknown as Party.Connection,
    );

    const broadcast = server.room.broadcast;
    expect(broadcast.mock.calls[0][1]).toEqual([conn.id]);
  });
});

// ─── Audit log ──────────────────────────────────────────────────────────────

describe('room.server — audit log', () => {
  let server: ReturnType<typeof createServer>;
  let hostConn: FakeConnection;
  let guestConn: FakeConnection;
  let fetchMock: ReturnType<typeof vi.fn>;
  const origAnonKey = process.env.ANON_KEY;
  const origRestUrl = process.env.REST_URL;

  beforeEach(() => {
    server = createServer();
    hostConn = fakeConn('conn-host');
    guestConn = fakeConn('conn-guest');
    fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env.ANON_KEY = origAnonKey;
    process.env.REST_URL = origRestUrl;
  });

  it('ADMIT posts one audit row with correct action, actor and subject', () => {
    process.env.ANON_KEY = 'test-anon-key';
    process.env.REST_URL = 'http://rest:3000';
    admitUser(server, hostConn, 'host-1', 'Alice');
    server.onConnect(guestConn as unknown as Party.Connection);
    sendPresence(server, guestConn, 'guest-1', 'Bob');
    fetchMock.mockClear();

    server.onMessage(
      JSON.stringify({ type: 'ADMIT', payload: { userId: 'guest-1' } }),
      hostConn as unknown as Party.Connection,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    // The ROOT path: PostgREST serves its tables there, and `/rest/v1/` is
    // only the prefix nginx-proxy rewrites away for the browser. Posting to
    // the prefixed path from inside the compose network is a 404, which a
    // fire-and-forget write swallows for ever.
    expect(url).toBe('http://rest:3000/audit_events');
    expect(opts.method).toBe('POST');
    expect(opts.headers['Authorization']).toBe('Bearer test-anon-key');
    expect(opts.headers['apikey']).toBe('test-anon-key');
    expect(opts.headers['Prefer']).toBe('return=minimal');
    const body = JSON.parse(opts.body);
    expect(body.action).toBe('admitted');
    expect(body.room_id).toBe('test-room');
    expect(body.actor_name).toBe('Alice');
    expect(body.actor_id).toBe('host-1');
    expect(body.subject_name).toBe('Bob');
    expect(body.subject_id).toBe('guest-1');
  });

  it('DECLINE posts one audit row with correct action, actor and subject', () => {
    process.env.ANON_KEY = 'test-anon-key';
    process.env.REST_URL = 'http://rest:3000';
    admitUser(server, hostConn, 'host-1', 'Alice');
    server.onConnect(guestConn as unknown as Party.Connection);
    sendPresence(server, guestConn, 'guest-1', 'Bob');
    fetchMock.mockClear();

    server.onMessage(
      JSON.stringify({ type: 'DECLINE', payload: { userId: 'guest-1' } }),
      hostConn as unknown as Party.Connection,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.action).toBe('declined');
    expect(body.actor_name).toBe('Alice');
    expect(body.actor_id).toBe('host-1');
    expect(body.subject_name).toBe('Bob');
    expect(body.subject_id).toBe('guest-1');
  });

  it('SET_JOIN_POLICY records the new policy in detail', () => {
    process.env.ANON_KEY = 'test-anon-key';
    process.env.REST_URL = 'http://rest:3000';
    admitUser(server, hostConn, 'host-1', 'Alice');
    fetchMock.mockClear();

    server.onMessage(
      JSON.stringify({ type: 'SET_JOIN_POLICY', payload: { policy: 'open' } }),
      hostConn as unknown as Party.Connection,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.action).toBe('join_policy');
    expect(body.actor_name).toBe('Alice');
    expect(body.actor_id).toBe('host-1');
    expect(body.detail).toBe('open');
  });

  it('with ANON_KEY unset: no fetch at all, and the admission still happens', () => {
    delete process.env.ANON_KEY;
    admitUser(server, hostConn, 'host-1', 'Alice');
    server.onConnect(guestConn as unknown as Party.Connection);
    sendPresence(server, guestConn, 'guest-1', 'Bob');
    fetchMock.mockClear();

    server.onMessage(
      JSON.stringify({ type: 'ADMIT', payload: { userId: 'guest-1' } }),
      hostConn as unknown as Party.Connection,
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(server.admitted.has('guest-1')).toBe(true);
  });

  it('a throwing fetch does not stop the admission', () => {
    process.env.ANON_KEY = 'test-anon-key';
    fetchMock.mockImplementation(() => { throw new Error('network down'); });
    admitUser(server, hostConn, 'host-1', 'Alice');
    server.onConnect(guestConn as unknown as Party.Connection);
    sendPresence(server, guestConn, 'guest-1', 'Bob');

    server.onMessage(
      JSON.stringify({ type: 'ADMIT', payload: { userId: 'guest-1' } }),
      hostConn as unknown as Party.Connection,
    );

    expect(server.admitted.has('guest-1')).toBe(true);
    const guestTypes = sentTypes(guestConn);
    expect(guestTypes).toContain('JOIN_ADMITTED');
  });
});
