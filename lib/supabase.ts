import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type TrackerSession = {
  id: string;
  room_id: string;
  title: string;
  ended_at: string;
  created_at: string;
  participant_count: number;
  model_name: string | null;
};

export type TrackerItem = {
  id: string;
  session_id: string;
  type: 'RISK' | 'RATIONALE' | 'ACTION';
  title: string;
  description: string;
  priority: 'Critical' | 'High' | 'Medium' | 'Low';
  status: 'Open' | 'In Review' | 'Approved' | 'Rejected';
  assignee: string | null;
  due_date: string | null;
  component_reference: string | null;
  department: string | null;
  agent_id: string;
  source_message_ids: string[] | null;
  affected_requirement_ids: string[] | null;
  impact: string | null;
  mitigation_strategy: string | null;
  design_driver: string | null;
  tradeoff_analysis: string | null;
  created_at: string;
  updated_at: string;
  // joined
  session?: TrackerSession;
};

export type TrackerComment = {
  id: string;
  item_id: string;
  author_name: string;
  text: string;
  created_at: string;
};

export type StatusHistoryEntry = {
  id: string;
  item_id: string;
  status: string;
  changed_by: string;
  note: string | null;
  created_at: string;
};
