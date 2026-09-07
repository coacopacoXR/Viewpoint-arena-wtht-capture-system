// TurnAdapter interface — see docs/plan/02-connector-adapters.md §3.
//
// Every TURN provider (Cloudflare, self-hosted coturn, …) implements this
// interface. A shared contract test suite (turn.contract.test.ts) asserts
// the behavioural guarantees.

export interface TurnAdapter {
  /**
   * Return ICE servers configured for RTCPeerConnection.
   *
   * Implementations mint short-lived credentials server-side. The returned
   * array is safe to pass directly to RTCPeerConnection's iceServers config.
   */
  getIceServers(): Promise<RTCIceServer[]>;
}
