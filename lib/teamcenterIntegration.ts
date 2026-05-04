import { TrackerItem } from './supabase';

export interface TeamcenterConfig {
  baseUrl: string;
  username: string;
  password: string;
}

interface TcSession {
  sessionId: string;
  baseUrl: string;
}

async function tcLogin(config: TeamcenterConfig): Promise<TcSession> {
  const url = `${config.baseUrl.replace(/\/$/, '')}/tc/micro/auth/v1/login`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: config.username, password: config.password }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Teamcenter login failed (${res.status}): ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  const sessionId = data.sessionID ?? data.session_id ?? data.token;
  if (!sessionId) throw new Error('Teamcenter login succeeded but no session ID in response');

  return { sessionId, baseUrl: config.baseUrl.replace(/\/$/, '') };
}

async function tcCreateTask(session: TcSession, item: TrackerItem): Promise<string> {
  const url = `${session.baseUrl}/tc/micro/wf/v1/tasks`;
  const body = {
    object_name: item.title,
    object_desc: [item.description, item.impact, item.mitigation_strategy].filter(Boolean).join('\n\n'),
    task_type: 'Do',
    due_date: item.due_date ? new Date(item.due_date).toISOString() : undefined,
    assigned_to: item.assignee ?? undefined,
    reference_designator: item.component_reference ?? undefined,
    priority: { Critical: 1, High: 2, Medium: 3, Low: 4 }[item.priority],
    fnd0status: 'Not Started',
    viewpoint_item_id: item.id,
    viewpoint_item_type: item.type,
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Session-ID': session.sessionId,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Create task failed (${res.status}): ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.uid ?? data.id ?? 'created';
}

async function tcCreateChangeNotice(session: TcSession, item: TrackerItem): Promise<string> {
  const url = `${session.baseUrl}/tc/micro/change/v1/changenotices`;
  const body = {
    object_name: item.title,
    object_desc: [item.description, item.impact, item.mitigation_strategy].filter(Boolean).join('\n\n'),
    cm0due_date: item.due_date ? new Date(item.due_date).toISOString() : undefined,
    cm0assigned_user: item.assignee ?? undefined,
    cm0priority: item.priority,
    cm0severity: item.priority === 'Critical' ? 'Safety' : item.priority === 'High' ? 'Major' : 'Minor',
    cm0affected_items: item.component_reference ? [{ object_name: item.component_reference }] : [],
    viewpoint_item_id: item.id,
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Session-ID': session.sessionId,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Create CN failed (${res.status}): ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.uid ?? data.id ?? 'created';
}

export async function pushActionsToTeamcenter(
  config: TeamcenterConfig,
  items: TrackerItem[],
  mode: 'tasks' | 'change_notices' = 'tasks',
  onProgress?: (done: number, total: number) => void,
): Promise<{ ok: boolean; pushed: number; errors: string[]; ids: string[] }> {
  const session = await tcLogin(config);
  const actionItems = items.filter(i => i.type === 'ACTION');
  const errors: string[] = [];
  const ids: string[] = [];

  for (const item of actionItems) {
    try {
      const id = mode === 'change_notices'
        ? await tcCreateChangeNotice(session, item)
        : await tcCreateTask(session, item);
      ids.push(id);
    } catch (err) {
      errors.push(`${item.title.slice(0, 40)}: ${String(err)}`);
    }
    onProgress?.(ids.length + errors.length, actionItems.length);
  }

  return { ok: errors.length === 0, pushed: ids.length, errors, ids };
}

export async function pushRisksToTeamcenter(
  config: TeamcenterConfig,
  items: TrackerItem[],
  onProgress?: (done: number, total: number) => void,
): Promise<{ ok: boolean; pushed: number; errors: string[]; ids: string[] }> {
  return pushActionsToTeamcenter(config, items.filter(i => i.type === 'RISK').map(i => ({ ...i, type: 'ACTION' as const })), 'change_notices', onProgress);
}

export function getTeamcenterConfig(): TeamcenterConfig | null {
  const env = (import.meta as any).env ?? {};
  const baseUrl = env.VITE_TC_BASE_URL as string;
  const username = env.VITE_TC_USERNAME as string;
  const password = env.VITE_TC_PASSWORD as string;

  if (baseUrl && username && password) return { baseUrl, username, password };

  try {
    const stored = localStorage.getItem('vp_tc_config');
    if (stored) return JSON.parse(stored) as TeamcenterConfig;
  } catch { /* */ }

  return null;
}

export function saveTeamcenterConfig(config: TeamcenterConfig): void {
  localStorage.setItem('vp_tc_config', JSON.stringify({ ...config, password: config.password }));
}
