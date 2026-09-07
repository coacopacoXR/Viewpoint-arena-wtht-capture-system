import type { ViewpointConfig } from './schema.ts';

export interface PublicConfig {
  plm: { provider: string; baseUrl?: string };
  capture: { provider: string; model?: string };
  turn: { provider: string };
  db: { provider: string };
  notifications: { provider: string }[];
  modelImport: { provider: string };
}

// Allowlist-based redactor: only fields explicitly listed below survive into
// the public response. This is the security boundary — a denylist would
// silently leak any field added to the schema later.
//
// What the browser needs to know:
//   - which provider is active per connector category (render the right UI)
//   - non-secret connection details the browser calls directly (base URLs,
//     model names)
//
// What must NOT leak:
//   - any *Env field name (even the deliberately-public Supabase pair —
//     the endpoint exposes neither env var names nor their resolved values)
//   - any resolved secret value
export function redactConfig(config: ViewpointConfig): PublicConfig {
  const plm: PublicConfig['plm'] = { provider: config.plm.provider };
  if ('baseUrl' in config.plm) plm.baseUrl = config.plm.baseUrl;

  const capture: PublicConfig['capture'] = { provider: config.capture.provider };
  if ('model' in config.capture) capture.model = config.capture.model;

  return {
    plm,
    capture,
    turn: { provider: config.turn.provider },
    db: { provider: config.db.provider },
    notifications: config.notifications.map((n) => ({ provider: n.provider })),
    modelImport: { provider: config.modelImport.provider },
  };
}
