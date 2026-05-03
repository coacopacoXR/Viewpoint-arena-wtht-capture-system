import { supabase } from './supabase';
import { InsightCard } from '../types';

export async function flushSessionToTracker(opts: {
  roomId: string;
  insightCards: InsightCard[];
  participantCount: number;
  modelName: string | null;
}): Promise<string | null> {
  const { roomId, insightCards, participantCount, modelName } = opts;

  if (insightCards.length === 0) return null;

  // 1. Create the session record
  const { data: session, error: sessionErr } = await supabase
    .from('tracker_sessions')
    .insert({
      room_id: roomId,
      title: `Design Review — ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`,
      ended_at: new Date().toISOString(),
      participant_count: participantCount,
      model_name: modelName,
    })
    .select()
    .single();

  if (sessionErr || !session) {
    console.error('[tracker] failed to create session:', sessionErr);
    return null;
  }

  // 2. Insert all insight cards as tracker items
  const items = insightCards.map(card => ({
    session_id: session.id,
    type: card.type,
    title: card.title,
    description: card.description,
    priority: card.details.priority,
    status: card.details.status,
    assignee: card.details.assignee ?? null,
    due_date: card.details.dueDate ?? null,
    component_reference: card.details.componentReference ?? null,
    department: card.details.department ?? null,
    agent_id: card.agentId,
    source_message_ids: card.sourceMessageIds ?? null,
    affected_requirement_ids: card.affectedRequirementIds ?? null,
    impact: card.details.impact ?? null,
    mitigation_strategy: card.details.mitigationStrategy ?? null,
    design_driver: card.details.designDriver ?? null,
    tradeoff_analysis: card.details.tradeoffAnalysis ?? null,
  }));

  const { error: itemsErr } = await supabase
    .from('tracker_items')
    .insert(items);

  if (itemsErr) {
    console.error('[tracker] failed to insert items:', itemsErr);
  }

  return session.id;
}
