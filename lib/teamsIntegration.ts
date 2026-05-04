import { TrackerItem, TrackerSession } from './supabase';

export interface TeamsConfig {
  webhookUrl: string;
}

function priorityEmoji(p: TrackerItem['priority']): string {
  return { Critical: '🔴', High: '🟠', Medium: '🟡', Low: '⚪' }[p];
}

function statusEmoji(s: TrackerItem['status']): string {
  return { Open: '🔓', 'In Review': '🔵', Approved: '✅', Rejected: '❌' }[s];
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export async function postSessionToTeams(
  config: TeamsConfig,
  session: TrackerSession,
  items: TrackerItem[],
): Promise<{ ok: boolean; error?: string }> {
  const risks = items.filter(i => i.type === 'RISK');
  const actions = items.filter(i => i.type === 'ACTION');
  const rationale = items.filter(i => i.type === 'RATIONALE');
  const critical = items.filter(i => i.priority === 'Critical' && i.status !== 'Approved' && i.status !== 'Rejected');
  const overdue = items.filter(i => i.due_date && new Date(i.due_date) < new Date() && i.status !== 'Approved' && i.status !== 'Rejected');

  const topItems = critical.slice(0, 3);

  const card = {
    type: 'message',
    attachments: [{
      contentType: 'application/vnd.microsoft.card.adaptive',
      content: {
        $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
        type: 'AdaptiveCard',
        version: '1.5',
        body: [
          {
            type: 'Container',
            style: 'emphasis',
            items: [{
              type: 'TextBlock',
              text: '📐 Viewpoint Arena — Design Review',
              weight: 'Bolder',
              size: 'Medium',
              color: 'Accent',
            }, {
              type: 'TextBlock',
              text: session.title,
              weight: 'Bolder',
              size: 'Large',
              wrap: true,
            }, {
              type: 'TextBlock',
              text: `${fmt(session.ended_at)} · ${session.participant_count} participants${session.model_name ? ` · ${session.model_name}` : ''}`,
              size: 'Small',
              isSubtle: true,
            }],
          },
          {
            type: 'ColumnSet',
            columns: [
              { type: 'Column', width: 'stretch', items: [{ type: 'TextBlock', text: `**${risks.length}**\nRisks`, wrap: true, horizontalAlignment: 'Center' }] },
              { type: 'Column', width: 'stretch', items: [{ type: 'TextBlock', text: `**${actions.length}**\nActions`, wrap: true, horizontalAlignment: 'Center' }] },
              { type: 'Column', width: 'stretch', items: [{ type: 'TextBlock', text: `**${rationale.length}**\nRationale`, wrap: true, horizontalAlignment: 'Center' }] },
              { type: 'Column', width: 'stretch', items: [{ type: 'TextBlock', text: `**${overdue.length}**\nOverdue`, color: overdue.length > 0 ? 'Attention' : 'Default', wrap: true, horizontalAlignment: 'Center' }] },
            ],
          },
          ...(topItems.length > 0 ? [{
            type: 'Container',
            items: [
              { type: 'TextBlock', text: '🔴 Critical Items', weight: 'Bolder', size: 'Small' },
              ...topItems.map(item => ({
                type: 'TextBlock' as const,
                text: `${priorityEmoji(item.priority)} ${statusEmoji(item.status)} **[${item.type}]** ${item.title}`,
                wrap: true,
                size: 'Small',
                spacing: 'Small',
              })),
            ],
          }] : []),
        ],
        actions: [{
          type: 'Action.OpenUrl',
          title: 'Open Tracker',
          url: `${window.location.origin}/tracker`,
          style: 'positive',
        }],
        msteams: { width: 'Full' },
      },
    }],
  };

  try {
    const res = await fetch(config.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(card),
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `Teams returned ${res.status}: ${text}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export async function postItemToTeams(
  config: TeamsConfig,
  item: TrackerItem,
): Promise<{ ok: boolean; error?: string }> {
  const card = {
    type: 'message',
    attachments: [{
      contentType: 'application/vnd.microsoft.card.adaptive',
      content: {
        $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
        type: 'AdaptiveCard',
        version: '1.5',
        body: [{
          type: 'TextBlock',
          text: `${priorityEmoji(item.priority)} [${item.type}] ${item.priority}`,
          weight: 'Bolder',
          color: item.priority === 'Critical' ? 'Attention' : 'Default',
        }, {
          type: 'TextBlock',
          text: item.title,
          wrap: true,
          weight: 'Bolder',
          size: 'Medium',
        }, {
          type: 'FactSet',
          facts: [
            { title: 'Status', value: item.status },
            ...(item.assignee ? [{ title: 'Assignee', value: item.assignee }] : []),
            ...(item.due_date ? [{ title: 'Due', value: fmt(item.due_date) }] : []),
            ...(item.component_reference ? [{ title: 'Component', value: item.component_reference }] : []),
          ],
        }, ...(item.description ? [{
          type: 'TextBlock' as const,
          text: item.description,
          wrap: true,
          isSubtle: true,
          size: 'Small',
        }] : [])],
        actions: [{
          type: 'Action.OpenUrl',
          title: 'Open Tracker',
          url: `${window.location.origin}/tracker`,
        }],
      },
    }],
  };

  try {
    const res = await fetch(config.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(card),
    });
    return res.ok ? { ok: true } : { ok: false, error: `${res.status}` };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export function getTeamsConfig(): TeamsConfig | null {
  const webhookUrl = (import.meta as any).env?.VITE_TEAMS_WEBHOOK_URL as string;
  if (webhookUrl) return { webhookUrl };
  const stored = localStorage.getItem('vp_teams_webhook');
  if (stored) return { webhookUrl: stored };
  return null;
}

export function saveTeamsConfig(config: TeamsConfig): void {
  localStorage.setItem('vp_teams_webhook', config.webhookUrl);
}
