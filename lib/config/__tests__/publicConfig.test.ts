import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../redact.ts', () => ({}));

const fakeConfig = {
  plm: { provider: 'onshape', baseUrl: 'https://cad.onshape.com' },
  capture: { provider: 'mock' },
  turn: { provider: 'cloudflare' },
  db: { provider: 'supabase' },
  notifications: [{ provider: 'teams' }],
  modelImport: { provider: 'onshape' },
};

describe('fetchPublicConfig', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('fetches and caches the public config', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => fakeConfig,
    });
    vi.stubGlobal('fetch', fetchMock);

    const { fetchPublicConfig } = await import('../publicConfig.ts');

    const first = await fetchPublicConfig();
    const second = await fetchPublicConfig();

    expect(first).toEqual(fakeConfig);
    expect(second).toEqual(fakeConfig);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/public-config');

    vi.unstubAllGlobals();
  });

  it('throws a clear error when fetch fails and allows retry', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('network down'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => fakeConfig,
      });
    vi.stubGlobal('fetch', fetchMock);

    const { fetchPublicConfig } = await import('../publicConfig.ts');

    await expect(fetchPublicConfig()).rejects.toThrow(
      'Failed to fetch public config: network down',
    );

    // Cache cleared on failure — retry succeeds.
    const result = await fetchPublicConfig();
    expect(result).toEqual(fakeConfig);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    vi.unstubAllGlobals();
  });

  it('throws a clear error on non-OK response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });
    vi.stubGlobal('fetch', fetchMock);

    const { fetchPublicConfig } = await import('../publicConfig.ts');

    await expect(fetchPublicConfig()).rejects.toThrow(
      'Public config endpoint returned 500',
    );

    vi.unstubAllGlobals();
  });
});
