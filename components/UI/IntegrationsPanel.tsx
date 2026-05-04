import React, { useState, useCallback } from 'react';
import clsx from 'clsx';
import { TrackerItem, TrackerSession } from '../../lib/supabase';
import {
  postSessionToTeams,
  getTeamsConfig,
  saveTeamsConfig,
  TeamsConfig,
} from '../../lib/teamsIntegration';
import {
  syncItemsToSharePoint,
  getSharePointConfig,
  saveSharePointConfig,
  SharePointConfig,
} from '../../lib/sharepointIntegration';
import {
  pushActionsToTeamcenter,
  getTeamcenterConfig,
  saveTeamcenterConfig,
  TeamcenterConfig,
} from '../../lib/teamcenterIntegration';

// ─── Shared ───────────────────────────────────────────────────────────────────

interface StatusMsg { type: 'idle' | 'loading' | 'success' | 'error'; text?: string; }

const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement> & { label: string }> = ({ label, ...props }) => (
  <div>
    <label className="block text-[10px] font-mono font-bold text-gray-400 uppercase tracking-widest mb-1">{label}</label>
    <input
      {...props}
      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-black placeholder:text-gray-300"
    />
  </div>
);

const StatusBanner: React.FC<{ status: StatusMsg }> = ({ status }) => {
  if (status.type === 'idle') return null;
  return (
    <div className={clsx('rounded-lg px-3 py-2 text-xs font-medium', {
      'bg-blue-50 text-blue-700': status.type === 'loading',
      'bg-emerald-50 text-emerald-700': status.type === 'success',
      'bg-red-50 text-red-700': status.type === 'error',
    })}>
      {status.type === 'loading' && <span className="inline-block w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mr-2" />}
      {status.text}
    </div>
  );
};

// ─── Teams Section ────────────────────────────────────────────────────────────

const TeamsSection: React.FC<{ session: TrackerSession | null; items: TrackerItem[] }> = ({ session, items }) => {
  const [cfg, setCfg] = useState<TeamsConfig>(() => getTeamsConfig() ?? { webhookUrl: '' });
  const [status, setStatus] = useState<StatusMsg>({ type: 'idle' });

  async function handlePost() {
    if (!cfg.webhookUrl.trim()) { setStatus({ type: 'error', text: 'Webhook URL is required.' }); return; }
    if (!session) { setStatus({ type: 'error', text: 'Select a session first.' }); return; }
    saveTeamsConfig(cfg);
    setStatus({ type: 'loading', text: 'Posting to Teams…' });
    const result = await postSessionToTeams(cfg, session, items);
    setStatus(result.ok
      ? { type: 'success', text: `Posted! ${items.length} items summarised.` }
      : { type: 'error', text: result.error ?? 'Unknown error' }
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-xl">💬</span>
        <div>
          <p className="text-sm font-bold text-gray-900">Microsoft Teams</p>
          <p className="text-xs text-gray-500">Post a session summary card to a Teams channel via incoming webhook.</p>
        </div>
      </div>
      <Input
        label="Incoming Webhook URL"
        type="url"
        value={cfg.webhookUrl}
        onChange={e => setCfg({ webhookUrl: e.target.value })}
        placeholder="https://…webhook.office.com/…"
      />
      <button onClick={handlePost} disabled={status.type === 'loading'}
        className="w-full bg-[#6264A7] hover:bg-[#4F52A0] text-white text-sm font-semibold py-2 rounded-lg transition-colors disabled:opacity-50">
        Post Session Summary to Teams
      </button>
      <StatusBanner status={status} />
      <p className="text-[10px] text-gray-400 leading-relaxed">
        Create a webhook: Teams channel → ··· → Connectors → Incoming Webhook. Paste the URL above.
      </p>
    </div>
  );
};

// ─── SharePoint Section ───────────────────────────────────────────────────────

const SharePointSection: React.FC<{ items: TrackerItem[] }> = ({ items }) => {
  const [cfg, setCfg] = useState<SharePointConfig>(() => getSharePointConfig() ?? { clientId: '', tenantId: '', siteId: '', listId: '' });
  const [status, setStatus] = useState<StatusMsg>({ type: 'idle' });
  const [progress, setProgress] = useState(0);

  const handleSync = useCallback(async () => {
    if (!cfg.clientId || !cfg.tenantId || !cfg.siteId || !cfg.listId) {
      setStatus({ type: 'error', text: 'All SharePoint fields are required.' }); return;
    }
    saveSharePointConfig(cfg);
    setStatus({ type: 'loading', text: 'Authenticating with Microsoft…' });
    setProgress(0);
    try {
      const result = await syncItemsToSharePoint(cfg, items, (done, total) => {
        setProgress(Math.round((done / total) * 100));
        setStatus({ type: 'loading', text: `Syncing… ${done}/${total}` });
      });
      setStatus(result.ok
        ? { type: 'success', text: `Synced ${result.synced} items to SharePoint.` }
        : { type: 'error', text: `${result.synced} synced, ${result.errors.length} errors: ${result.errors[0]}` }
      );
    } catch (err) {
      setStatus({ type: 'error', text: String(err) });
    }
  }, [cfg, items]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-xl">📋</span>
        <div>
          <p className="text-sm font-bold text-gray-900">SharePoint</p>
          <p className="text-xs text-gray-500">Write tracker items to a SharePoint list via Microsoft Graph API.</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Input label="Azure App Client ID" value={cfg.clientId} onChange={e => setCfg(c => ({ ...c, clientId: e.target.value }))} placeholder="xxxxxxxx-xxxx-…" />
        <Input label="Tenant ID" value={cfg.tenantId} onChange={e => setCfg(c => ({ ...c, tenantId: e.target.value }))} placeholder="xxxxxxxx-xxxx-…" />
        <Input label="Site ID" value={cfg.siteId} onChange={e => setCfg(c => ({ ...c, siteId: e.target.value }))} placeholder="contoso.sharepoint.com,…" />
        <Input label="List ID" value={cfg.listId} onChange={e => setCfg(c => ({ ...c, listId: e.target.value }))} placeholder="xxxxxxxx-xxxx-…" />
      </div>
      {status.type === 'loading' && progress > 0 && (
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-blue-500 transition-all" style={{ width: `${progress}%` }} />
        </div>
      )}
      <button onClick={handleSync} disabled={status.type === 'loading'}
        className="w-full bg-[#0078D4] hover:bg-[#006ABD] text-white text-sm font-semibold py-2 rounded-lg transition-colors disabled:opacity-50">
        Sign in & Sync {items.length} Items to SharePoint
      </button>
      <StatusBanner status={status} />
      <p className="text-[10px] text-gray-400 leading-relaxed">
        Requires an Azure app registration with Sites.ReadWrite.All permission (delegated). A sign-in popup will appear.
      </p>
    </div>
  );
};

// ─── Teamcenter Section ───────────────────────────────────────────────────────

const TeamcenterSection: React.FC<{ items: TrackerItem[] }> = ({ items }) => {
  const [cfg, setCfg] = useState<TeamcenterConfig>(() => getTeamcenterConfig() ?? { baseUrl: '', username: '', password: '' });
  const [mode, setMode] = useState<'tasks' | 'change_notices'>('tasks');
  const [status, setStatus] = useState<StatusMsg>({ type: 'idle' });
  const [progress, setProgress] = useState(0);

  const actionCount = items.filter(i => i.type === 'ACTION').length;

  async function handlePush() {
    if (!cfg.baseUrl || !cfg.username || !cfg.password) {
      setStatus({ type: 'error', text: 'All Teamcenter fields are required.' }); return;
    }
    saveTeamcenterConfig(cfg);
    setStatus({ type: 'loading', text: 'Connecting to Teamcenter…' });
    setProgress(0);
    try {
      const result = await pushActionsToTeamcenter(cfg, items, mode, (done, total) => {
        setProgress(Math.round((done / total) * 100));
        setStatus({ type: 'loading', text: `Pushing… ${done}/${total}` });
      });
      setStatus(result.ok
        ? { type: 'success', text: `Pushed ${result.pushed} action item${result.pushed !== 1 ? 's' : ''} to Teamcenter. IDs: ${result.ids.slice(0, 3).join(', ')}${result.ids.length > 3 ? '…' : ''}` }
        : { type: 'error', text: `${result.pushed} pushed, ${result.errors.length} errors: ${result.errors[0] ?? ''}` }
      );
    } catch (err) {
      setStatus({ type: 'error', text: String(err) });
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-xl">⚙️</span>
        <div>
          <p className="text-sm font-bold text-gray-900">Teamcenter PLM</p>
          <p className="text-xs text-gray-500">Push ACTION items to Teamcenter as tasks or change notices via Active Workspace REST API.</p>
        </div>
      </div>
      <Input label="Base URL" value={cfg.baseUrl} onChange={e => setCfg(c => ({ ...c, baseUrl: e.target.value }))} placeholder="https://tc.company.com/awc" />
      <div className="grid grid-cols-2 gap-2">
        <Input label="Username" value={cfg.username} onChange={e => setCfg(c => ({ ...c, username: e.target.value }))} placeholder="infodba" />
        <Input label="Password" type="password" value={cfg.password} onChange={e => setCfg(c => ({ ...c, password: e.target.value }))} placeholder="••••••••" />
      </div>
      <div>
        <p className="text-[10px] font-mono font-bold text-gray-400 uppercase tracking-widest mb-1.5">Push as</p>
        <div className="flex gap-2">
          {(['tasks', 'change_notices'] as const).map(m => (
            <button key={m} onClick={() => setMode(m)}
              className={clsx('flex-1 py-1.5 text-xs font-semibold rounded-lg border transition-colors', mode === m ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400')}>
              {m === 'tasks' ? 'Tasks' : 'Change Notices'}
            </button>
          ))}
        </div>
      </div>
      {status.type === 'loading' && progress > 0 && (
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-orange-400 transition-all" style={{ width: `${progress}%` }} />
        </div>
      )}
      <button onClick={handlePush} disabled={status.type === 'loading' || actionCount === 0}
        className="w-full bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold py-2 rounded-lg transition-colors disabled:opacity-50">
        Push {actionCount} ACTION Item{actionCount !== 1 ? 's' : ''} to Teamcenter
      </button>
      <StatusBanner status={status} />
      <p className="text-[10px] text-gray-400 leading-relaxed">
        Requires Teamcenter Active Workspace 5.x+ with REST API enabled. Only ACTION-type items are pushed.
      </p>
    </div>
  );
};

// ─── Main Panel ───────────────────────────────────────────────────────────────

type IntegrationTab = 'teams' | 'sharepoint' | 'teamcenter';

interface IntegrationsPanelProps {
  session: TrackerSession | null;
  items: TrackerItem[];
  onClose: () => void;
}

const IntegrationsPanel: React.FC<IntegrationsPanelProps> = ({ session, items, onClose }) => {
  const [tab, setTab] = useState<IntegrationTab>('teams');

  const tabs: { id: IntegrationTab; label: string; icon: string }[] = [
    { id: 'teams', label: 'Teams', icon: '💬' },
    { id: 'sharepoint', label: 'SharePoint', icon: '📋' },
    { id: 'teamcenter', label: 'Teamcenter', icon: '⚙️' },
  ];

  return (
    <>
      <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-screen w-[440px] bg-white z-50 flex flex-col shadow-2xl border-l border-gray-200 animate-in slide-in-from-right duration-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <p className="text-sm font-bold text-gray-900">Integrations</p>
            <p className="text-xs text-gray-500">{items.length} items in scope</p>
          </div>
          <button onClick={onClose} className="text-gray-300 hover:text-gray-700 text-xl transition-colors">✕</button>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-gray-100 flex-shrink-0">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={clsx('flex-1 flex flex-col items-center gap-0.5 py-3 text-xs font-semibold border-b-2 transition-colors', tab === t.id ? 'border-black text-black' : 'border-transparent text-gray-400 hover:text-gray-700')}>
              <span className="text-lg">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {tab === 'teams' && <TeamsSection session={session} items={items} />}
          {tab === 'sharepoint' && <SharePointSection items={items} />}
          {tab === 'teamcenter' && <TeamcenterSection items={items} />}
        </div>

        <div className="flex-shrink-0 px-6 py-3 border-t border-gray-100">
          <p className="text-[10px] text-gray-400 font-mono">
            Credentials stored locally in your browser. Never sent to Viewpoint servers.
          </p>
        </div>
      </div>
    </>
  );
};

export default IntegrationsPanel;
