import { defineConfig } from './lib/config/schema.ts';

export default defineConfig({
  plm: {
    provider: 'onshape',
    baseUrl: 'https://cad.onshape.com',
    clientIdEnv: 'ONSHAPE_CLIENT_ID',
    clientSecretEnv: 'ONSHAPE_CLIENT_SECRET',
  },
  capture: {
    provider: 'mock',
  },
  turn: {
    provider: 'selfHostedCoturn',
    host: 'localhost',
    port: 3478,
    sharedSecretEnv: 'COTURN_SHARED_SECRET',
    // When the api container runs inside Docker, the public host (e.g.
    // 'localhost') resolves to the api container itself, not to coturn.
    // probeHost is the compose service name the api uses for its STUN health
    // probe on the backend network. Omit it when the api runs outside Docker.
    probeHost: 'coturn',
  },
  db: {
    provider: 'supabase',
    // These two intentionally keep the VITE_ prefix: the browser must read
    // them. The Supabase anon key is client-safe by design, with access
    // control enforced by Row Level Security in Postgres. Every other
    // credential below is server-side only and must never use VITE_.
    urlEnv: 'VITE_SUPABASE_URL',
    anonKeyEnv: 'VITE_SUPABASE_ANON_KEY',
  },
  notifications: [{ provider: 'teams', webhookUrlEnv: 'TEAMS_WEBHOOK_URL' }],
  modelImport: { provider: 'onshape' },
});
