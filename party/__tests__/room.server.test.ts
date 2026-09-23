// Tests for room.server.ts — RECORDING_STATE relay + speakerId stamping on
// TRANSCRIPT_LINE. These are the two server-side changes in section B of the
// grounded-capture plan.

import { describe, it, expect, vi, beforeEach } from 'vitest';
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

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('room.server — RECORDING_STATE', () => {
  let server: ReturnType<typeof createServer>;
  let hostConn: FakeConnection;
  let guestConn: FakeConnection;

  beforeEach(() => {
    server = createServer();
    hostConn = fakeConn('conn-host');
    guestConn = fakeConn('conn-guest');
    sendPresence(server, hostConn, 'host-1', 'Alice');
    sendPresence(server, guestConn, 'guest-1', 'Bob');
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
    // Broadcasts to ALL (no exclude list) so the sender's indicator stays in sync.
    expect(broadcast).toHaveBeenCalledTimes(1);
    const call = broadcast.mock.calls[0];
    const msg = JSON.parse(call[0] as string);
    expect(msg.type).toBe('RECORDING_STATE');
    expect(msg.payload.recording).toBe(true);
    expect(msg.payload.byUserId).toBe('host-1');
    // Second arg (exclude list) should be undefined — broadcast to all.
    expect(call[1]).toBeUndefined();
  });

  it('sends persisted RECORDING_STATE to late joiners', () => {
    server.onMessage(
      JSON.stringify({
        type: 'RECORDING_STATE',
        payload: { recording: true, startedAt: 1000, byUserId: 'host-1', byName: 'Alice' },
      }),
      hostConn as unknown as Party.Connection,
    );

    const lateConn = fakeConn('conn-late');
    server.onConnect(lateConn as unknown as Party.Connection);

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

    const sentMessages = lateConn.send.mock.calls.map((c) => JSON.parse(c[0] as string));
    const recordingMsg = sentMessages.find((m) => m.type === 'RECORDING_STATE');
    // The last state (recording: false) is persisted and sent.
    expect(recordingMsg).toBeDefined();
    expect(recordingMsg.payload.recording).toBe(false);
  });
});

describe('room.server — TRANSCRIPT_LINE speakerId stamping', () => {
  let server: ReturnType<typeof createServer>;
  let conn: FakeConnection;

  beforeEach(() => {
    server = createServer();
    conn = fakeConn('conn-1');
    sendPresence(server, conn, 'user-42', 'Alice');
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
    // The server overwrites the forged speakerId with the real one.
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
    // Second arg is the exclude list — the sender.
    expect(broadcast.mock.calls[0][1]).toEqual([conn.id]);
  });
});

describe('room.server — POINTING_SEGMENT relay + userId stamping', () => {
  let server: ReturnType<typeof createServer>;
  let conn: FakeConnection;

  beforeEach(() => {
    server = createServer();
    conn = fakeConn('conn-1');
    sendPresence(server, conn, 'user-42', 'Alice');
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
