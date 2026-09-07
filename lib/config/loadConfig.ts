import { configSchema, type ViewpointConfig } from './schema.ts';
import { ZodError } from 'zod';

if (typeof process === 'undefined' || !process.versions.node) {
  throw new Error(
    'loadConfig.ts is server-only. Import lib/config/publicConfig.ts in client code instead.',
  );
}

export function validateConfig(config: unknown): ViewpointConfig {
  try {
    return configSchema.parse(config);
  } catch (err) {
    if (err instanceof ZodError) {
      const issues = err.issues
        .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
        .join('\n');
      throw new Error(`Invalid viewpoint config:\n${issues}`);
    }
    throw err;
  }
}

type EnvField = { path: string; envName: string };

function extractEnvFields(obj: unknown, path: string[] = []): EnvField[] {
  if (obj === null || typeof obj !== 'object') return [];
  const fields: EnvField[] = [];
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const currentPath = [...path, key].join('.');
    if (key.endsWith('Env') && typeof value === 'string') {
      fields.push({ path: currentPath, envName: value });
    } else if (Array.isArray(value)) {
      value.forEach((item, i) => {
        fields.push(...extractEnvFields(item, [...path, key, String(i)]));
      });
    } else if (typeof value === 'object' && value !== null) {
      fields.push(...extractEnvFields(value, [...path, key]));
    }
  }
  return fields;
}

export function checkEnvVars(
  config: ViewpointConfig,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const envFields = extractEnvFields(config);
  const missing: string[] = [];
  for (const { path, envName } of envFields) {
    const value = env[envName];
    if (value === undefined || value === '') {
      missing.push(`${path} '${envName}'`);
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables:\n${missing.map((m) => `  - ${m} is not set`).join('\n')}`,
    );
  }
}

export async function loadConfig(
  configPath: string = './viewpoint.config.ts',
): Promise<ViewpointConfig> {
  let module: { default?: unknown };
  try {
    module = await import(configPath);
  } catch (err) {
    throw new Error(
      `Failed to load config from ${configPath}: ${(err as Error).message}`,
    );
  }
  if (!module.default) {
    throw new Error(`Config at ${configPath} must have a default export`);
  }
  const config = validateConfig(module.default);
  checkEnvVars(config);
  return config;
}
