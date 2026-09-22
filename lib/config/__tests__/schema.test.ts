import { describe, it, expect } from 'vitest';
import { configSchema, defineConfig } from '../schema.ts';
import type { ViewpointConfig } from '../schema.ts';

const validOnshapeConfig: ViewpointConfig = {
  plm: {
    provider: 'onshape',
    baseUrl: 'https://cad.onshape.com',
    clientIdEnv: 'ONSHAPE_CLIENT_ID',
    clientSecretEnv: 'ONSHAPE_CLIENT_SECRET',
  },
  capture: { provider: 'mock' },
  turn: {
    provider: 'cloudflare',
    tokenIdEnv: 'CF_TURN_TOKEN_ID',
    apiTokenEnv: 'CF_TURN_API_TOKEN',
  },
  db: {
    provider: 'supabase',
    urlEnv: 'VITE_SUPABASE_URL',
    anonKeyEnv: 'VITE_SUPABASE_ANON_KEY',
  },
  notifications: [{ provider: 'teams', webhookUrlEnv: 'TEAMS_WEBHOOK_URL' }],
  modelImport: { provider: 'onshape' },
};

describe('configSchema', () => {
  it('accepts a valid onshape config', () => {
    const result = configSchema.safeParse(validOnshapeConfig);
    expect(result.success).toBe(true);
  });

  it('accepts a valid teamcenter config', () => {
    const config: ViewpointConfig = {
      ...validOnshapeConfig,
      plm: {
        provider: 'teamcenter',
        baseUrl: 'https://tc.example.com',
        usernameEnv: 'TC_USERNAME',
        passwordEnv: 'TC_PASSWORD',
      },
    };
    expect(configSchema.safeParse(config).success).toBe(true);
  });

  it('rejects missing required fields for onshape plm', () => {
    const bad = {
      ...validOnshapeConfig,
      plm: {
        provider: 'onshape',
        baseUrl: 'https://cad.onshape.com',
      },
    };
    const result = configSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      const msg = JSON.stringify(result.error.issues);
      expect(msg).toMatch(/clientIdEnv/);
      expect(msg).toMatch(/clientSecretEnv/);
    }
  });

  it('rejects missing required fields for teamcenter plm', () => {
    const bad = {
      ...validOnshapeConfig,
      plm: {
        provider: 'teamcenter',
        baseUrl: 'https://tc.example.com',
      },
    };
    const result = configSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      const msg = JSON.stringify(result.error.issues);
      expect(msg).toMatch(/usernameEnv/);
      expect(msg).toMatch(/passwordEnv/);
    }
  });

  it('rejects VITE_-prefixed env var names', () => {
    const bad = {
      ...validOnshapeConfig,
      plm: {
        provider: 'onshape',
        baseUrl: 'https://cad.onshape.com',
        clientIdEnv: 'VITE_ONSHAPE_CLIENT_ID',
        clientSecretEnv: 'ONSHAPE_CLIENT_SECRET',
      },
    };
    const result = configSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      const msg = JSON.stringify(result.error.issues);
      expect(msg).toMatch(/VITE_/);
    }
  });

  it('rejects non-UPPER_SNAKE_CASE env var names', () => {
    const bad = {
      ...validOnshapeConfig,
      plm: {
        provider: 'onshape',
        baseUrl: 'https://cad.onshape.com',
        clientIdEnv: 'onshape_client_id',
        clientSecretEnv: 'ONSHAPE_CLIENT_SECRET',
      },
    };
    const result = configSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      const msg = JSON.stringify(result.error.issues);
      expect(msg).toMatch(/UPPER_SNAKE_CASE/);
    }
  });

  it('rejects invalid provider discriminator', () => {
    const bad = {
      ...validOnshapeConfig,
      plm: {
        provider: 'unknown',
        baseUrl: 'https://cad.onshape.com',
      },
    };
    const result = configSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('defineConfig returns the config when valid', () => {
    const result = defineConfig(validOnshapeConfig);
    expect(result).toEqual(validOnshapeConfig);
  });

  it('defineConfig throws when invalid', () => {
    expect(() =>
      defineConfig({
        ...validOnshapeConfig,
        plm: {
          provider: 'onshape',
          baseUrl: 'https://cad.onshape.com',
        } as ViewpointConfig['plm'],
      }),
    ).toThrow();
  });

  it('accepts openai capture provider with apiKeyEnv', () => {
    const config: ViewpointConfig = {
      ...validOnshapeConfig,
      capture: {
        provider: 'openai',
        model: 'gpt-4',
        apiKeyEnv: 'OPENAI_API_KEY',
      },
    };
    expect(configSchema.safeParse(config).success).toBe(true);
  });

  it('rejects openai capture provider missing apiKeyEnv', () => {
    const bad = {
      ...validOnshapeConfig,
      capture: {
        provider: 'openai',
        model: 'gpt-4',
      },
    };
    const result = configSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      const msg = JSON.stringify(result.error.issues);
      expect(msg).toMatch(/apiKeyEnv/);
    }
  });

  it('accepts selfHostedCoturn turn provider', () => {
    const config: ViewpointConfig = {
      ...validOnshapeConfig,
      turn: {
        provider: 'selfHostedCoturn',
        host: 'turn.example.com',
        port: 3478,
        sharedSecretEnv: 'COTURN_SHARED_SECRET',
      },
    };
    expect(configSchema.safeParse(config).success).toBe(true);
  });

  it('rejects cloudflare turn missing required env fields', () => {
    const bad = {
      ...validOnshapeConfig,
      turn: {
        provider: 'cloudflare',
      },
    };
    const result = configSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      const msg = JSON.stringify(result.error.issues);
      expect(msg).toMatch(/tokenIdEnv/);
      expect(msg).toMatch(/apiTokenEnv/);
    }
  });

  // The VITE_ rule is deliberately asymmetric: the Supabase pair is the one
  // documented public exception (anon key + Row Level Security), every other
  // credential must stay out of the client bundle. Pin both directions so the
  // exception cannot quietly widen.
  it('allows VITE_ prefixes on the public Supabase db fields', () => {
    expect(() => configSchema.parse(validOnshapeConfig)).not.toThrow();
  });

  it('still rejects a VITE_ prefix on a server-side credential', () => {
    const leaky = {
      ...validOnshapeConfig,
      plm: { ...validOnshapeConfig.plm, clientSecretEnv: 'VITE_ONSHAPE_CLIENT_SECRET' },
    };
    expect(() => configSchema.parse(leaky)).toThrow(/VITE_/);
  });

  it('rejects a VITE_ prefix on a notification webhook', () => {
    const leaky = {
      ...validOnshapeConfig,
      notifications: [{ provider: 'teams' as const, webhookUrlEnv: 'VITE_TEAMS_WEBHOOK_URL' }],
    };
    expect(() => configSchema.parse(leaky)).toThrow(/VITE_/);
  });

  it('accepts a config with publicUrl set to an absolute origin', () => {
    const config = {
      ...validOnshapeConfig,
      publicUrl: 'https://arena.acme.com',
    };
    expect(configSchema.safeParse(config).success).toBe(true);
  });

  it('accepts a config with publicUrl as an IP origin', () => {
    const config = {
      ...validOnshapeConfig,
      publicUrl: 'https://192.168.1.134',
    };
    expect(configSchema.safeParse(config).success).toBe(true);
  });

  it('accepts a config with publicUrl including a non-standard port', () => {
    const config = {
      ...validOnshapeConfig,
      publicUrl: 'https://192.168.1.134:8443',
    };
    expect(configSchema.safeParse(config).success).toBe(true);
  });

  it('accepts a config without publicUrl (it is optional)', () => {
    expect(configSchema.safeParse(validOnshapeConfig).success).toBe(true);
  });

  it('rejects publicUrl with a path', () => {
    const config = {
      ...validOnshapeConfig,
      publicUrl: 'https://arena.acme.com/app',
    };
    const result = configSchema.safeParse(config);
    expect(result.success).toBe(false);
    if (!result.success) {
      const msg = JSON.stringify(result.error.issues);
      expect(msg).toMatch(/path|query|fragment/);
    }
  });

  it('rejects publicUrl with a query string', () => {
    const config = {
      ...validOnshapeConfig,
      publicUrl: 'https://arena.acme.com?foo=bar',
    };
    expect(configSchema.safeParse(config).success).toBe(false);
  });

  it('rejects publicUrl with a fragment', () => {
    const config = {
      ...validOnshapeConfig,
      publicUrl: 'https://arena.acme.com#section',
    };
    expect(configSchema.safeParse(config).success).toBe(false);
  });

  it('rejects a non-URL publicUrl', () => {
    const config = {
      ...validOnshapeConfig,
      publicUrl: 'not-a-url',
    };
    expect(configSchema.safeParse(config).success).toBe(false);
  });
});
