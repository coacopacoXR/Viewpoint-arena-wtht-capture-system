// CaptureProvider interface — see docs/plan/02-connector-adapters.md §2.
//
// Every capture implementation (Mock, LocalCapture, Ollama, OpenAI, …)
// implements this interface. A shared contract test suite
// (capture.contract.test.ts) asserts the behavioural guarantees so any
// implementation — ours or a corp's — can be verified against the same checks.

import type { InsightCard, InsightType } from '../../../types';
import type { HealthCheckResult } from '../../health/types.ts';

/**
 * One speaker-labelled slice of a real transcript.
 *
 * From docs/plan/02-connector-adapters.md §2 / local-capture-plan.md
 * §"Provider abstraction". Produced by a TranscriptionProvider (whisper) or
 * supplied by the caller in bring-your-own-transcript mode.
 */
export interface TranscriptChunk {
  speakerId: string;
  text: string;
  startMs: number;
  endMs: number;
}

/**
 * Where the review was, spatially, when the transcript window was captured.
 * Fused into the extraction prompt so a card can be attributed to the part
 * that was on screen / under the laser at the time.
 */
export interface SlideContext {
  agendaIdx: number;
  slideTitle: string;
  hoveredPartName?: string;
  laserTargetPartName?: string;
}

/**
 * Output of a single dialogue-generation call.
 *
 * Mirrors the shape returned by the original DialogueEngine logic so the
 * MockProvider can be a drop-in extraction with zero behaviour change.
 */
export interface DialogueOutput {
  /** The generated dialogue text (with {poi} already replaced). */
  text: string;
  /** The phrase-library template that was selected. */
  template: {
    type:
      | 'neutral'
      | 'risk'
      | 'rationale'
      | 'action'
      | 'visibility'
      | 'social'
      | 'questioning'
      | 'synthesis';
    summary?: string;
  };
  /** Non-null when the template should trigger an insight card. */
  insightType: InsightType | null;
}

/**
 * CaptureProvider — a capture backend, of either flavour.
 *
 * There are two genuinely different kinds of capture provider and they do not
 * share a single method:
 *
 *  1. SIMULATION-driven (`generateDialogue` + `generateInsightDetails`) —
 *     invents a review conversation from the scene tree. This is what
 *     MockProvider does, extracted verbatim from DialogueEngine.tsx. It is
 *     synchronous because nothing leaves the process.
 *  2. TRANSCRIPT-driven (`extractInsights`) — turns a real, already-spoken
 *     meeting transcript into insight cards. This is what every real backend
 *     (OpenAI, Anthropic, Ollama, capture-service) does. It is async because
 *     it crosses a network.
 *
 * Neither flavour can implement the other honestly: a transcript provider has
 * no phrase library to invent dialogue from, and the simulation has no
 * transcript to read. Making both sets of methods OPTIONAL — and naming each
 * capability precisely with SimulationCaptureProvider / TranscriptCaptureProvider
 * below — is what lets one interface cover both without either side growing a
 * method it would have to stub or throw from.
 *
 * Call sites must feature-detect before use:
 * `typeof provider.extractInsights === 'function'`. An object with none of the
 * three satisfies this type but fails the contract suite, which is where that
 * mistake gets caught.
 */
export interface CaptureProvider {
  /**
   * Generate a single dialogue utterance.
   *
   * @param agentId      Personality profile id ('1' | '2' | '3').
   * @param partName     Name of the part / POI being discussed.
   * @param step         Conversation-context step (drives phase selection).
   * @param isUserDriven Whether the user selected this part (biases depth).
   * @param modelType    Active model type ('bicycle' selects bike-specific phrases).
   */
  generateDialogue?(
    agentId: string,
    partName: string,
    step: number,
    isUserDriven: boolean,
    modelType: string,
  ): DialogueOutput;

  /**
   * Generate structured insight details for an insight card.
   *
   * @param type          Insight type (RISK | RATIONALE | ACTION).
   * @param targetId      POI / component id.
   * @param targetLabel   Human-readable component name.
   * @param decisionState Current decision state for the component.
   * @param template      The phrase template that triggered the insight.
   */
  generateInsightDetails?(
    type: InsightType,
    targetId: string,
    targetLabel: string,
    decisionState: 'NONE' | 'INTERMEDIATE' | 'FINAL',
    template: {
      type: string;
      reasoningChain?: { confidence?: number; implication?: string };
    },
  ): import('../../../types').InsightDetails;

  /**
   * Turn a transcript window plus the spatial context it was spoken in into
   * insight cards. Resolves to `[]` when the window held nothing worth
   * capturing; rejects with a descriptive Error rather than returning
   * partially-built cards.
   *
   * No implementation of this method may accept or return a credential: cloud
   * providers proxy through api/capture/extract.ts, which holds the API key in
   * server-side process.env (docs/plan/02-connector-adapters.md §2).
   */
  extractInsights?(
    transcript: TranscriptChunk[],
    context: SlideContext,
  ): Promise<InsightCard[]>;

  /**
   * Is this connector usable right now? Called by GET /api/health
   * (docs/plan/05-observability-and-metrics.md §1).
   *
   * Optional like the other two capabilities, and implemented by every
   * provider in this repo — including MockCaptureProvider, which has nothing
   * to reach and says so. Must never reject, and must never run an extraction:
   * a health check that spends tokens or uploads audio is not a health check.
   * `detail` must stay free of credentials, env var names, model output and
   * hostnames — see the full rules on PLMAdapter.healthCheck in
   * lib/connectors/plm/types.ts.
   */
  healthCheck?(): Promise<HealthCheckResult>;
}

/**
 * The simulation capability, stated precisely. MockCaptureProvider satisfies
 * this (and therefore CaptureProvider) with no change.
 */
export type SimulationCaptureProvider = Required<
  Pick<CaptureProvider, 'generateDialogue' | 'generateInsightDetails'>
>;

/**
 * The transcript capability, stated precisely. OpenAICaptureProvider,
 * AnthropicCaptureProvider, OllamaDirectCaptureProvider and (in T4.4)
 * LocalCaptureProvider all satisfy this.
 */
export type TranscriptCaptureProvider = Required<
  Pick<CaptureProvider, 'extractInsights'>
>;
