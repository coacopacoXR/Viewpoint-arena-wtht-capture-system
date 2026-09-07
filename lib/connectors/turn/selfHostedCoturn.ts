// SelfHostedCoturnAdapter — stub for air-gapped docker-compose deployments.
//
// Full implementation deferred to Phase 5 (docker-compose work). This stub
// throws an explicit not-implemented error so callers get a clear message
// rather than silently receiving empty ICE servers.

import type { TurnAdapter } from './types.ts';

export class SelfHostedCoturnAdapter implements TurnAdapter {
  async getIceServers(): Promise<RTCIceServer[]> {
    throw new Error(
      'turn/selfHostedCoturn: not implemented — scheduled for Phase 5 ' +
        '(see docs/plan/08-task-breakdown.md T5.1). Use the Cloudflare ' +
        'provider or configure a TURN server manually.',
    );
  }
}
