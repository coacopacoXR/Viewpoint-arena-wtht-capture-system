// SelfHostedCoturnAdapter — stub for air-gapped docker-compose deployments.
//
// Full implementation deferred to Phase 5 (docker-compose work). This stub
// throws an explicit not-implemented error so callers get a clear message
// rather than silently receiving empty ICE servers.
//
// It is STILL a stub after T5.1, and that is a deliberate scoping decision
// rather than an oversight: docker-compose.yml has no coturn service, so there
// is nothing for this adapter to talk to, and inventing a coturn deployment
// (static-auth-secret vs. the REST API, TLS, realm, min/max port range) inside
// an installer ticket would ship untested WebRTC relay configuration. Pick
// turn.provider 'cloudflare', or set TURN_URL / TURN_USERNAME / TURN_CREDENTIAL
// and let api/turn-credentials.ts's static override serve your own coturn.

import type { TurnAdapter } from './types.ts';
import type { HealthCheckResult } from '../../health/types.ts';
import { HEALTH_DETAILS } from '../../health/details.ts';

export class SelfHostedCoturnAdapter implements TurnAdapter {
  async getIceServers(): Promise<RTCIceServer[]> {
    throw new Error(
      'turn/selfHostedCoturn: not implemented — scheduled for Phase 5 ' +
        '(see docs/plan/08-task-breakdown.md T5.1). Use the Cloudflare ' +
        'provider or configure a TURN server manually.',
    );
  }

  /**
   * Reports the stub honestly instead of throwing.
   *
   * getIceServers() throws, and an aggregator that called it to probe health
   * would turn a known-unimplemented adapter into an exception path. Returning
   * `{ ok: false }` here is what makes a deployment that selected
   * selfHostedCoturn show up as DEGRADED on /api/health — visible, explained,
   * and with every other connector still reported — rather than failing the
   * endpoint or silently pretending to work.
   */
  async healthCheck(): Promise<HealthCheckResult> {
    return { ok: false, detail: HEALTH_DETAILS.notImplemented };
  }
}
