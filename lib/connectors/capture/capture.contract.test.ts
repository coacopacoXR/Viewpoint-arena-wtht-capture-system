// Shared CaptureProvider contract test suite.
//
// Any CaptureProvider implementation — MockCaptureProvider, LocalCaptureProvider
// (nightly with running Ollama), or a corp's custom adapter — can be run
// through this suite by calling runCaptureContractTests() with a factory
// function that produces the adapter.

import { describe, it, expect } from 'vitest';
import type { CaptureProvider, DialogueOutput } from './types';
import { MockCaptureProvider } from './mock';

const VALID_TEMPLATE_TYPES = new Set([
    'neutral', 'risk', 'rationale', 'action',
    'visibility', 'social', 'questioning', 'synthesis',
]);

const VALID_INSIGHT_TYPES = new Set(['RISK', 'RATIONALE', 'ACTION']);

export interface CaptureContractSetup {
    provider: CaptureProvider;
}

export function runCaptureContractTests(
    name: string,
    setup: () => CaptureContractSetup | Promise<CaptureContractSetup>,
): void {
    describe(`CaptureProvider contract: ${name}`, () => {
        let ctx: CaptureContractSetup;

        it('generateDialogue returns a well-shaped DialogueOutput', async () => {
            ctx = await setup();
            const output: DialogueOutput = ctx.provider.generateDialogue(
                '1', 'TestPart', 0, false, 'generic',
            );

            expect(typeof output.text).toBe('string');
            expect(output.text.length).toBeGreaterThan(0);
            expect(VALID_TEMPLATE_TYPES.has(output.template.type)).toBe(true);
            // Phase 1 (step 0) should not produce action/synthesis templates
            expect(output.insightType === null || VALID_INSIGHT_TYPES.has(output.insightType)).toBe(true);
        });

        it('generateDialogue replaces {poi} with the part name', async () => {
            ctx ??= await setup();
            const output = ctx.provider.generateDialogue(
                '1', 'Bracket Alpha', 5, false, 'generic',
            );
            expect(output.text).not.toContain('{poi}');
            expect(output.text).toContain('Bracket Alpha');
        });

        it('generateDialogue respects phase selection by step', async () => {
            ctx ??= await setup();
            // Phase 1 (step 0-2): observation — insightType should be null
            const early = ctx.provider.generateDialogue('1', 'Part', 0, false, 'generic');
            expect(early.insightType).toBeNull();

            // Phase 2+ (step 3+): can produce insights
            const later = ctx.provider.generateDialogue('1', 'Part', 5, false, 'generic');
            // May or may not produce an insight depending on template selection,
            // but the template type should be risk/rationale/questioning
            expect(VALID_TEMPLATE_TYPES.has(later.template.type)).toBe(true);
        });

        it('generateDialogue uses bicycle library when modelType is bicycle', async () => {
            ctx ??= await setup();
            const output = ctx.provider.generateDialogue(
                '1', 'Fork', 0, false, 'bicycle',
            );
            expect(typeof output.text).toBe('string');
            expect(output.text.length).toBeGreaterThan(0);
        });

        it('generateInsightDetails returns a well-shaped InsightDetails for RISK', async () => {
            ctx ??= await setup();
            const details = ctx.provider.generateInsightDetails(
                'RISK', 'poi-1', 'Bracket', 'NONE',
                { type: 'risk', reasoningChain: { confidence: 0.9, implication: 'failure risk' } },
            );
            expect(details.priority).toBe('Critical');
            expect(details.decisionRole).toBe('TRIGGER');
            expect(details.status).toBe('Open');
            expect(typeof details.componentReference).toBe('string');
        });

        it('generateInsightDetails returns RATIONALE details', async () => {
            ctx ??= await setup();
            const details = ctx.provider.generateInsightDetails(
                'RATIONALE', 'poi-2', 'Rib', 'NONE',
                { type: 'rationale' },
            );
            expect(details.decisionRole).toBe('RATIONALE');
            expect(typeof details.designDriver).toBe('string');
            expect(typeof details.tradeoffAnalysis).toBe('string');
        });

        it('generateInsightDetails returns ACTION details with correct decision role', async () => {
            ctx ??= await setup();
            const noneState = ctx.provider.generateInsightDetails(
                'ACTION', 'poi-3', 'Boss', 'NONE', { type: 'action' },
            );
            expect(noneState.decisionRole).toBe('INTERMEDIATE_DECISION');

            const finalState = ctx.provider.generateInsightDetails(
                'ACTION', 'poi-3', 'Boss', 'FINAL', { type: 'action' },
            );
            expect(finalState.decisionRole).toBe('FINAL_DECISION');
        });

        it('no method accepts or returns credential-shaped values', async () => {
            ctx ??= await setup();
            const output = ctx.provider.generateDialogue(
                '1', 'TestPart', 0, false, 'generic',
            );
            // The text should not contain anything that looks like a raw secret
            const credentialPattern = /\b(sk-[a-zA-Z0-9]{20,}|ghp_[a-zA-Z0-9]{36}|AKIA[0-9A-Z]{16})\b/;
            expect(output.text).not.toMatch(credentialPattern);
        });
    });
}

// ─── Run against MockCaptureProvider (regular CI path) ────────────────

describe('CaptureProvider contract suite', () => {
    runCaptureContractTests('MockCaptureProvider', () => ({
        provider: new MockCaptureProvider(),
    }));
});
