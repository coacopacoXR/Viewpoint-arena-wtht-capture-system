import { z } from 'zod';

const ENV_VAR_NAME_RE = /^[A-Z][A-Z0-9_]*$/;

const envVarName = z
  .string()
  .min(1, 'env var name must not be empty')
  .refine((v) => ENV_VAR_NAME_RE.test(v), {
    message: 'env var name must be UPPER_SNAKE_CASE',
  })
  .refine((v) => !v.startsWith('VITE_'), {
    message:
      'VITE_-prefixed names are inlined into the client bundle by Vite; secrets must never use VITE_ prefix',
  });

// Deliberately public, client-visible env names.
//
// Almost every credential must stay out of the client bundle, which is what
// `envVarName` enforces. The Supabase pair is the documented exception in
// docs/plan/01-architecture-and-master-config.md §3: the anon key is designed
// to be embedded in client code, with access control enforced by Postgres Row
// Level Security rather than by keeping the key secret. The browser therefore
// has to be able to read both, so they keep the VITE_ prefix.
//
// Do NOT reuse this for anything else. If a new field needs it, it almost
// certainly belongs server-side instead.
const publicEnvVarName = z
  .string()
  .min(1, 'env var name must not be empty')
  .refine((v) => ENV_VAR_NAME_RE.test(v), {
    message: 'env var name must be UPPER_SNAKE_CASE',
  });

const onshapePlm = z.object({
  provider: z.literal('onshape'),
  baseUrl: z.string().url('plm.baseUrl must be a URL'),
  clientIdEnv: envVarName,
  clientSecretEnv: envVarName,
});

const teamcenterPlm = z.object({
  provider: z.literal('teamcenter'),
  baseUrl: z.string().url('plm.baseUrl must be a URL'),
  usernameEnv: envVarName,
  passwordEnv: envVarName,
});

const plmSchema = z.discriminatedUnion('provider', [onshapePlm, teamcenterPlm]);

const captureSchema = z.discriminatedUnion('provider', [
  z.object({ provider: z.literal('mock') }),
  z.object({
    provider: z.literal('local'),
    serviceUrl: z.string().url('capture.serviceUrl must be a URL'),
  }),
  z.object({
    provider: z.literal('openai'),
    model: z.string().min(1, 'capture.model is required'),
    apiKeyEnv: envVarName,
  }),
  z.object({
    provider: z.literal('anthropic'),
    model: z.string().min(1, 'capture.model is required'),
    apiKeyEnv: envVarName,
  }),
  z.object({
    provider: z.literal('ollamaDirect'),
    baseUrl: z.string().url('capture.baseUrl must be a URL'),
    model: z.string().min(1, 'capture.model is required'),
  }),
]);

const cloudflareTurn = z.object({
  provider: z.literal('cloudflare'),
  tokenIdEnv: envVarName,
  apiTokenEnv: envVarName,
});

const selfHostedCoturnTurn = z.object({
  provider: z.literal('selfHostedCoturn'),
  host: z.string().min(1, 'turn.host is required'),
  port: z.number().int().positive('turn.port must be a positive integer'),
  sharedSecretEnv: envVarName,
});

const turnSchema = z.discriminatedUnion('provider', [
  cloudflareTurn,
  selfHostedCoturnTurn,
]);

const dbSchema = z.discriminatedUnion('provider', [
  z.object({
    provider: z.literal('supabase'),
    // publicEnvVarName, not envVarName — see the comment on publicEnvVarName.
    urlEnv: publicEnvVarName,
    anonKeyEnv: publicEnvVarName,
  }),
]);

const teamsNotification = z.object({
  provider: z.literal('teams'),
  webhookUrlEnv: envVarName,
});

const notificationsSchema = z.array(
  z.discriminatedUnion('provider', [teamsNotification]),
);

const modelImportSchema = z.discriminatedUnion('provider', [
  z.object({ provider: z.literal('onshape') }),
  z.object({ provider: z.literal('genericGltf') }),
]);

export const configSchema = z.object({
  plm: plmSchema,
  capture: captureSchema,
  turn: turnSchema,
  db: dbSchema,
  notifications: notificationsSchema,
  modelImport: modelImportSchema,
});

export type ViewpointConfig = z.infer<typeof configSchema>;

export function defineConfig(config: ViewpointConfig): ViewpointConfig {
  configSchema.parse(config);
  return config;
}
