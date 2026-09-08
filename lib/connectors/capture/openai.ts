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
}
