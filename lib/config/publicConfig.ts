import type { PublicConfig } from './redact.ts';

export type { PublicConfig } from './redact.ts';

let cached: Promise<PublicConfig> | null = null;

export async function fetchPublicConfig(): Promise<PublicConfig> {
  if (cached) return cached;
  cached = (async () => {
    let response: Response;
    try {
      response = await fetch('/api/public-config');
    } catch (err) {
      cached = null;
      throw new Error(
        `Failed to fetch public config: ${(err as Error).message}`,
      );
    }
    if (!response.ok) {
      cached = null;
      throw new Error(
        `Public config endpoint returned ${response.status}`,
      );
    }
    return (await response.json()) as PublicConfig;
  })();
  return cached;
}

export function resetPublicConfigCache(): void {
  cached = null;
}
