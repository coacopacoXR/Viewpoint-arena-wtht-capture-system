// MockTurnAdapter — deterministic implementation for contract tests.

import type { TurnAdapter } from './types.ts';

export class MockTurnAdapter implements TurnAdapter {
  private _servers: RTCIceServer[];
  shouldFail = false;

  constructor(servers?: RTCIceServer[]) {
    this._servers = servers ?? [
      { urls: 'stun:stun.example.com' },
      {
        urls: 'turn:turn.example.com:3478',
        username: 'mock-user',
        credential: 'mock-cred',
      },
    ];
  }

  async getIceServers(): Promise<RTCIceServer[]> {
    if (this.shouldFail) {
      throw new Error('mock turn failure');
    }
    return this._servers;
  }
}
