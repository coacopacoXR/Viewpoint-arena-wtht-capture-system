// OpenAICaptureProvider — browser-safe TranscriptCaptureProvider.
//
// Holds no credential and cannot be given one: there is no apiKey option, and
// nothing in this file reads process.env or import.meta.env. The transcript
// goes to our own serverless function (api/capture/extract.ts), which reads
// OPENAI_API_KEY — or whatever capture.apiKeyEnv names — from server-side
// process.env and calls OpenAI itself.
//
// See docs/plan/02-connector-adapters.md §2: "never call these directly from
// the browser with a key".

import type { InsightCard } from '../../../types';
import type {
  SlideContext,
  TranscriptCaptureProvider,
  TranscriptChunk,
} from './types';
import type { ExtractClientOptions } from './extractClient';
import {
  extractInsightsViaEndpoint,
  probeExtractEndpoint,
} from './extractClient';
import type { HealthCheckResult } from '../../health/types';
import { HEALTH_DETAILS } from '../../health/details';

export type OpenAICaptureOptions = ExtractClientOptions;

export class OpenAICaptureProvider implements TranscriptCaptureProvider {
  private readonly _options: OpenAICaptureOptions;

  constructor(options: OpenAICaptureOptions = {}) {
    this._options = options;
  }

  async extractInsights(
    transcript: TranscriptChunk[],
    context: SlideContext,
  ): Promise<InsightCard[]> {
    return extractInsightsViaEndpoint('openai', transcript, context, this._options);
  }

  /** True when the server has an OpenAI key configured. Never exposes it. */
  async isConfigured(): Promise<boolean> {
    return probeExtractEndpoint(this._options);
  }

  /**
   * Can the server-side extraction proxy be reached?
   *
   * This is the only thing a browser-side provider can honestly check: the key
   * lives in api/capture/extract.ts's process.env and is never sent here, so
   * "is OpenAI configured" is not a question this module can answer. The HEAD
   * probe reports whether the proxy is deployed and holds a cloud key at all —
   * it cannot say which vendor's, because the probe names no provider.
   *
   * It never runs an extraction: that would spend money on every health poll.
   */
  async healthCheck(): Promise<HealthCheckResult> {
    const reachable = await probeExtractEndpoint(this._options);
    return reachable
      ? { ok: true, detail: HEALTH_DETAILS.proxyReachable }
      : { ok: false, detail: HEALTH_DETAILS.proxyUnavailable };
  }
}
