import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** False when the build had no Supabase URL/key (db connector not set up). */
export const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// createClient THROWS on an empty URL, and this module is imported by the
// lobby, so an unconfigured build used to be a blank white page — including
// the default self-hosted install, which leaves VITE_SUPABASE_URL as a TODO.
// Unconfigured, the client gets a placeholder URL on the reserved .invalid TLD
// (RFC 6761) and a fetch that never touches the network: every query resolves
// at once as an ordinary `{ error }` result, which callers already handle.
//
// The fetch answers 501 rather than throwing on purpose. postgrest-js retries
// a thrown network error (1s + 2s + 4s of backoff), which kept the review setup
// page on "Loading draft…" for ~8 seconds; it does not retry a 501.
const UNCONFIGURED_URL = 'https://supabase-not-configured.invalid';

const notConfiguredFetch: typeof fetch = async () =>
  new Response(
    JSON.stringify({
      code: 'not_configured',
      message: 'Supabase is not configured for this deployment',
    }),
    { status: 501, headers: { 'Content-Type': 'application/json' } },
  );

if (!supabaseConfigured) {
  console.warn(
    '[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set; ' +
      'saved reviews, stats and the tracker are unavailable.',
  );
}

export const supabase = supabaseConfigured
  ? createClient(supabaseUrl as string, supabaseAnonKey as string)
  : createClient(UNCONFIGURED_URL, 'not-configured', {
      global: { fetch: notConfiguredFetch },
    });

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
