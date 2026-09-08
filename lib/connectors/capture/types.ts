// CaptureProvider interface — see docs/plan/02-connector-adapters.md §2.
//
// Every capture implementation (Mock, LocalCapture, Ollama, OpenAI, …)
// implements this interface. A shared contract test suite
// (capture.contract.test.ts) asserts the behavioural guarantees so any
// implementation — ours or a corp's — can be verified against the same checks.

import type { InsightType } from '../../../types';

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
 * CaptureProvider — generates the simulated (or real) review conversation.
 *
 * The MockProvider extracts the current DialogueEngine generation logic
 * behind this interface with **no behaviour change**. Future implementations
 * (LocalCapture, Ollama, cloud LLMs) will replace the mock with real AI.
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
  generateDialogue(
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
  generateInsightDetails(
    type: InsightType,
    targetId: string,
    targetLabel: string,
    decisionState: 'NONE' | 'INTERMEDIATE' | 'FINAL',
    template: {
      type: string;
      reasoningChain?: { confidence?: number; implication?: string };
    },
  ): import('../../../types').InsightDetails;
}
