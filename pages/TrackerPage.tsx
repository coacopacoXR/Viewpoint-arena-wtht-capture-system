import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import {
  supabase,
  TrackerSession,
  TrackerItem,
  TrackerComment,
  StatusHistoryEntry,
} from '../lib/supabase';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtShort(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}
function isOverdue(due: string | null) {
  if (!due) return false;
  return new Date(due) < new Date();
}

function exportToCSV(items: TrackerItem[], filename = 'viewpoint-tracker') {
  const headers = ['Type','Priority','Status','Title','Description','Assignee','Due Date','Component Ref','Department','Session'];
  const q = (s: string) => `"${(s ?? '').replace(/"/g, '""')}"`;
  const rows = items.map(i => [
    i.type, i.priority, i.status, q(i.title), q(i.description),
    q(i.assignee ?? ''), i.due_date ?? '', q(i.component_reference ?? ''),
    q(i.department ?? ''), i.session ? fmt(i.session.ended_at) : '',
  ].join(','));
  const csv = [headers.join(','), ...rows].join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  Object.assign(document.createElement('a'), {
    href: url, download: `${filename}-${new Date().toISOString().split('T')[0]}.csv`,
  }).click();
  URL.revokeObjectURL(url);
}

interface Stats { total: number; openRisks: number; openActions: number; overdue: number; approvedThisWeek: number; }
function computeStats(items: TrackerItem[]): Stats {
  const today = new Date().toISOString().split('T')[0];
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  return {
    total: items.length,
    openRisks: items.filter(i => i.type === 'RISK' && i.status !== 'Approved' && i.status !== 'Rejected').length,
    openActions: items.filter(i => i.type === 'ACTION' && i.status !== 'Approved' && i.status !== 'Rejected').length,
    overdue: items.filter(i => i.due_date && i.due_date < today && i.status !== 'Approved' && i.status !== 'Rejected').length,
    approvedThisWeek: items.filter(i => i.status === 'Approved' && i.updated_at >= weekAgo).length,
  };
}

// ─── Seed Demo Data ───────────────────────────────────────────────────────────

async function seedDemoData() {
  const now = Date.now();
  const ago = (d: number) => new Date(now - d * 86400000).toISOString();
  const ahead = (d: number) => new Date(now + d * 86400000).toISOString().split('T')[0];

  const { data: sessions, error } = await supabase.from('tracker_sessions').insert([
    { room_id: 'demo-hmi', title: 'Cockpit HMI Design Review', ended_at: ago(30), participant_count: 4, model_name: 'GPT-4o' },
    { room_id: 'demo-brk', title: 'Brake System Structural Review', ended_at: ago(14), participant_count: 3, model_name: 'GPT-4o' },
    { room_id: 'demo-dash', title: 'Dashboard Assembly Gate Review', ended_at: ago(7), participant_count: 5, model_name: 'claude-opus-4' },
  ]).select();

  if (error || !sessions || sessions.length < 3) { console.error('[seed]', error); return; }
  const [s1, s2, s3] = sessions;

  await supabase.from('tracker_items').insert([
    // ── HMI Session ──
    { session_id: s1.id, type: 'RISK', priority: 'Critical', status: 'Open', title: 'Touch panel latency 180ms under thermal soak — exceeds 150ms REQ-U-305 threshold', description: 'Thermal cycling to 85°C shows latency increase from 95ms baseline to 180ms sustained.', impact: 'Driver may miss critical warning acknowledgment at speed. Non-compliant REQ-U-305.', mitigation_strategy: 'Investigate TCON firmware update; evaluate alternative controller ICs with lower thermal coefficient.', component_reference: 'HMI-TCH-003', agent_id: 'SYS.OP' },
    { session_id: s1.id, type: 'RISK', priority: 'High', status: 'In Review', title: 'HMI backlight contrast ratio 2.8:1 at 80,000 lux — minimum requirement 4.5:1', description: 'Photometric test under direct sunlight simulation shows display unreadable at 90° sun angle.', impact: 'Display unreadable in direct sunlight. Non-compliant REQ-U-201.', mitigation_strategy: 'Evaluate transreflective LCD variants; increase LED current 15% as interim measure.', component_reference: 'HMI-DISP-001', agent_id: 'ENG.UNIT' },
    { session_id: s1.id, type: 'ACTION', priority: 'High', status: 'Open', title: 'Conduct HALT testing on capacitive overlay with 5G RF profile — Band n78, 3.5GHz', description: 'Previous EMC testing did not include 5G bands. Required for 5G-equipped vehicle variants.', assignee: 'ENG.UNIT', due_date: ahead(12), component_reference: 'HMI-TCH-003', agent_id: 'SYS.OP' },
    { session_id: s1.id, type: 'ACTION', priority: 'Medium', status: 'Approved', title: 'Update DWG-HMI-042 — revise bezel tolerance ±0.3mm → ±0.2mm', description: 'Tolerance revision ensures consistent optical bonding adhesive gap across production variance.', assignee: 'DES.LEAD', agent_id: 'DES.LEAD' },
    { session_id: s1.id, type: 'RATIONALE', priority: 'Medium', status: 'Approved', title: 'Resistive touch selected over capacitive — 100% glove-compatible per REQ-U-305', description: 'Technology selection rationale for HMI touch interface.', design_driver: 'REQ-U-305: Primary controls operable by 95th %ile gloved hand.', tradeoff_analysis: 'Resistive: 100% glove-compatible, 2mm resolution, 50k cycle durability. Capacitive: 0.5mm resolution, fails with standard work gloves (12/12 test failures). Selected resistive per safety requirement.', agent_id: 'DES.LEAD' },
    { session_id: s1.id, type: 'RATIONALE', priority: 'Low', status: 'Approved', title: 'Matte surface finish Ra 0.8μm — 78% glare reduction vs gloss at 60° sun incidence', description: 'Display surface treatment for ambient light performance.', design_driver: 'Ambient lighting analysis report L-2026-011.', tradeoff_analysis: 'Matte Ra 0.8μm: sRGB 85%, glare reduction 78%. Gloss: sRGB 95%, glare reduction 0%. Color gamut delta acceptable for industrial cockpit. Selected matte.', agent_id: 'ENG.UNIT' },
    // ── Brake Session ──
    { session_id: s2.id, type: 'RISK', priority: 'Critical', status: 'In Review', title: 'Weld joint BRK-MT-07 stress concentration Kt=3.2 at 1.5g lateral — yield margin < 5%', description: 'FEA rev C identifies critical stress riser at fillet transition. Current r=1mm radius insufficient.', impact: 'Structural failure risk during emergency lateral maneuver. Exceeds allowable stress REQ-S-112.', mitigation_strategy: 'Redesign fillet radius r=1mm → r≥4mm. Re-run FEA with revised geometry and updated weld properties from ML-2026-089.', component_reference: 'BRK-MT-07', department: 'Structures', agent_id: 'SYS.OP' },
    { session_id: s2.id, type: 'RISK', priority: 'High', status: 'Open', title: 'Brake line BRK-LINE-A3 sustained 240°C exposure — exceeds 180°C DOT4 fluid rating', description: 'Thermal survey shows 240°C sustained at line routing position during track duty cycle.', impact: 'Vapor lock risk; brake performance degradation; accelerated fluid degradation.', mitigation_strategy: 'Option A: Reroute via B-pillar tunnel (+280mm). Option B: Add heat shield HX-BRK-02 at current routing.', component_reference: 'BRK-LINE-A3', agent_id: 'ENG.UNIT' },
    { session_id: s2.id, type: 'ACTION', priority: 'Critical', status: 'Open', title: 'Re-run FEA on BRK-MT-07 with revised weld properties from metallurgy report ML-2026-089', description: 'Current FEA uses generic weld properties. Lab report shows actual yield strength 15% lower than assumed.', assignee: 'SYS.OP', due_date: ahead(7), component_reference: 'BRK-MT-07', agent_id: 'SYS.OP' },
    { session_id: s2.id, type: 'ACTION', priority: 'High', status: 'In Review', title: 'CFD thermal analysis — brake duct Variant B heat rejection at 0.8 m/s airflow', description: 'Variant B duct geometry shows 23% improved flow path in preliminary analysis. Requires CFD validation before tooling sign-off.', assignee: 'ENG.UNIT', due_date: ahead(17), agent_id: 'ENG.UNIT' },
    { session_id: s2.id, type: 'RATIONALE', priority: 'Medium', status: 'Approved', title: '19mm master cylinder selected — improved pedal feel at cost of 8% higher peak effort', description: 'Master cylinder bore selection based on driver simulator evaluation.', design_driver: 'Driver feedback study SIM-2026-004 (n=8 test drivers).', tradeoff_analysis: '19mm bore: 85N peak pedal effort, 0.8mm/bar resolution, 7/8 driver preference. 22mm bore: 74N peak, 1.1mm/bar resolution, 1/8 driver preference. Selected 19mm. Peak effort within REQ-U-305 ergonomic envelope.', agent_id: 'DES.LEAD' },
    // ── Dashboard Session ──
    { session_id: s3.id, type: 'RISK', priority: 'Medium', status: 'Open', title: 'Cluster clip DASH-CLK-09 fatigue life 180k cycles — target 200k, 10% shortfall', description: 'Accelerated vibration testing per IEC 60068-2-64 shows clip fracture at 180k cycles mean.', impact: 'Potential in-field failure at high-vibration duty cycle. Warranty exposure.', mitigation_strategy: 'Option A: Change material PA66-GF30 → PA66-GF50. Option B: Increase cross-section 15%. Evaluate via FEA before physical re-test.', component_reference: 'DASH-CLK-09', agent_id: 'ENG.UNIT' },
    { session_id: s3.id, type: 'ACTION', priority: 'High', status: 'Open', title: 'Radiated emissions test — ICU PCB rev R3 to CISPR 25 Class 5', description: 'Rev R3 introduces new power supply topology. Previous approval (Rev R2) does not carry forward per EMC protocol.', assignee: 'ENG.UNIT', due_date: ahead(25), component_reference: 'DASH-ICU-PCB-R3', agent_id: 'SYS.OP' },
    { session_id: s3.id, type: 'ACTION', priority: 'Medium', status: 'Open', title: 'Source M6×1.0 Grade 12.9 fasteners from approved vendor list — current supplier on Q3 allocation', description: 'Procurement flagged supply risk. Alternative approved source needed to avoid line-stop.', assignee: 'DES.LEAD', due_date: ahead(29), agent_id: 'DES.LEAD' },
    { session_id: s3.id, type: 'RATIONALE', priority: 'High', status: 'Approved', title: 'CAN bus routed via B-pillar cavity — eliminates 3 chafe points at cost of 340mm cable', description: 'Harness routing decision for primary 500 kbps CAN powertrain bus.', design_driver: 'Harness routing conflict matrix HRM-2026-007. Zero chafe tolerance on safety-critical network.', tradeoff_analysis: 'B-pillar: +340mm cable (+$0.85 BOM), 0 chafe points, shield continuous. Direct: 0 added cable, 3 chafe points, requires 3 guards ($1.20 ea). B-pillar saves $2.75 BOM and eliminates failure mode.', agent_id: 'SYS.OP' },
    { session_id: s3.id, type: 'RISK', priority: 'Low', status: 'Open', title: 'Piano black trim DASH-TRIM-PB-01 scratch rate 12% in trial build — target <5%', description: 'Trial assembly (n=50 units) shows cosmetic scratching during panel sub-assembly.', impact: 'Assembly scrap cost ~$180/unit; customer quality perception risk at launch.', mitigation_strategy: 'Evaluate peel-film during sub-assembly; redesign in-station handling fixture to eliminate trim contact points.', component_reference: 'DASH-TRIM-PB-01', agent_id: 'DES.LEAD' },
  ]);
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ALL_STATUSES: TrackerItem['status'][] = ['Open', 'In Review', 'Approved', 'Rejected'];
const ALL_TYPES: TrackerItem['type'][] = ['RISK', 'ACTION', 'RATIONALE'];
const ALL_PRIORITIES: TrackerItem['priority'][] = ['Critical', 'High', 'Medium', 'Low'];

const typeColor: Record<TrackerItem['type'], string> = {
  RISK: 'bg-red-100 text-red-700 border border-red-200',
  ACTION: 'bg-blue-100 text-blue-700 border border-blue-200',
  RATIONALE: 'bg-amber-100 text-amber-700 border border-amber-200',
};
const priorityColor: Record<TrackerItem['priority'], string> = {
  Critical: 'bg-red-500 text-white',
  High: 'bg-orange-400 text-white',
  Medium: 'bg-yellow-400 text-gray-900',
  Low: 'bg-gray-200 text-gray-600',
};
const statusColor: Record<TrackerItem['status'], string> = {
  Open: 'bg-gray-100 text-gray-600',
  'In Review': 'bg-blue-100 text-blue-700',
  Approved: 'bg-emerald-100 text-emerald-700',
  Rejected: 'bg-red-100 text-red-600',
};
const statusDot: Record<TrackerItem['status'], string> = {
  Open: 'bg-gray-400',
  'In Review': 'bg-blue-500',
  Approved: 'bg-emerald-500',
  Rejected: 'bg-red-500',
};

// ─── Badges ───────────────────────────────────────────────────────────────────

const TypeBadge: React.FC<{ type: TrackerItem['type'] }> = ({ type }) => (
  <span className={clsx('inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold font-mono tracking-widest', typeColor[type])}>
    {type}
  </span>
);
const PriorityBadge: React.FC<{ priority: TrackerItem['priority'] }> = ({ priority }) => (
  <span className={clsx('inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold', priorityColor[priority])}>
    {priority.toUpperCase()}
  </span>
);
const StatusBadge: React.FC<{ status: TrackerItem['status'] }> = ({ status }) => (
  <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium', statusColor[status])}>
    <span className={clsx('w-1.5 h-1.5 rounded-full', statusDot[status])} />
    {status}
  </span>
);

// ─── Stats Bar ────────────────────────────────────────────────────────────────

const StatTile: React.FC<{ label: string; value: number; accent: string; sub?: string }> = ({ label, value, accent, sub }) => (
  <div className={clsx('flex-1 min-w-[100px] bg-white border rounded-xl px-4 py-3 flex flex-col gap-0.5', accent)}>
    <span className="text-2xl font-bold text-gray-900 tabular-nums leading-none">{value}</span>
    <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{label}</span>
    {sub && <span className="text-[10px] text-gray-400 mt-0.5">{sub}</span>}
  </div>
);

const StatsBar: React.FC<{ stats: Stats }> = ({ stats }) => (
  <div className="flex-shrink-0 flex gap-3 px-6 py-3 bg-gray-50 border-b border-gray-200 overflow-x-auto">
    <StatTile label="Total Items" value={stats.total} accent="border-gray-200" />
    <StatTile label="Open Risks" value={stats.openRisks} accent={stats.openRisks > 0 ? 'border-red-200 !bg-red-50' : 'border-gray-200'} />
    <StatTile label="Pending Actions" value={stats.openActions} accent={stats.openActions > 0 ? 'border-blue-200 !bg-blue-50' : 'border-gray-200'} />
    <StatTile label="Overdue" value={stats.overdue} accent={stats.overdue > 0 ? 'border-orange-200 !bg-orange-50' : 'border-gray-200'} sub={stats.overdue > 0 ? 'requires attention' : undefined} />
    <StatTile label="Approved / Week" value={stats.approvedThisWeek} accent="border-emerald-200" />
  </div>
);

// ─── Inline Field ─────────────────────────────────────────────────────────────

interface InlineFieldProps {
  label: string;
  value: string | null;
  onSave: (val: string | null) => Promise<void>;
  type?: 'text' | 'textarea' | 'date' | 'select';
  options?: string[];
  placeholder?: string;
  mono?: boolean;
}

const InlineField: React.FC<InlineFieldProps> = ({ label, value, onSave, type = 'text', options, placeholder = 'Click to edit…', mono }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => { setDraft(value ?? ''); }, [value]);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  async function commit() {
    const trimmed = draft.trim();
    const next = trimmed || null;
    if (next === (value ?? null)) { setEditing(false); return; }
    setSaving(true);
    try { await onSave(next); } catch { setDraft(value ?? ''); }
    setSaving(false);
    setEditing(false);
  }

  function cancel() { setDraft(value ?? ''); setEditing(false); }

  const baseInput = 'w-full border border-blue-400 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-blue-50/30';

  return (
    <div className="group/field">
      <p className="font-mono text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1">{label}</p>
      {editing ? (
        type === 'textarea' ? (
          <textarea
            ref={inputRef as React.RefObject<HTMLTextAreaElement>}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={e => { if (e.key === 'Escape') cancel(); if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) commit(); }}
            className={clsx(baseInput, 'resize-none min-h-[80px]', mono && 'font-mono text-xs')}
            rows={4}
          />
        ) : type === 'select' && options ? (
          <select
            autoFocus
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={commit}
            className={clsx(baseInput, 'cursor-pointer')}
          >
            <option value="">— unset —</option>
            {options.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        ) : (
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            type={type === 'date' ? 'date' : 'text'}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') cancel(); }}
            className={clsx(baseInput, mono && 'font-mono text-xs')}
          />
        )
      ) : (
        <div
          onClick={() => setEditing(true)}
          className={clsx(
            'cursor-text rounded-lg px-2.5 py-1.5 min-h-[34px] flex items-start justify-between gap-2 transition-colors',
            'group-hover/field:bg-gray-50 hover:ring-1 hover:ring-gray-200',
            saving && 'opacity-50 pointer-events-none'
          )}
        >
          <span className={clsx(
            'text-sm flex-1 leading-relaxed',
            mono ? 'font-mono text-xs' : '',
            value ? 'text-gray-800' : 'text-gray-300 italic text-xs'
          )}>
            {value ?? placeholder}
          </span>
          <span className="opacity-0 group-hover/field:opacity-100 text-gray-300 text-xs flex-shrink-0 mt-0.5 select-none">✎</span>
        </div>
      )}
    </div>
  );
};

// ─── Board Card ───────────────────────────────────────────────────────────────

const BoardCard: React.FC<{ item: TrackerItem; onClick: () => void }> = ({ item, onClick }) => {
  const overdue = isOverdue(item.due_date);
  return (
    <div
      onClick={onClick}
      className="bg-white border border-gray-200 rounded-xl p-3.5 cursor-pointer hover:shadow-lg hover:border-gray-300 hover:-translate-y-0.5 transition-all duration-150 space-y-2.5 group"
    >
      <div className="flex items-center gap-1.5 flex-wrap">
        <TypeBadge type={item.type} />
        <PriorityBadge priority={item.priority} />
      </div>
      <p className="text-sm font-semibold text-gray-900 leading-snug line-clamp-2 group-hover:text-black">{item.title}</p>
      {item.description && (
        <p className="text-[11px] text-gray-400 leading-snug line-clamp-2">{item.description}</p>
      )}
      {item.component_reference && (
        <p className="font-mono text-[10px] text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded w-fit">{item.component_reference}</p>
      )}
      <div className="flex items-center justify-between pt-1 border-t border-gray-100">
        <span className="font-mono text-[10px] text-gray-400">{item.assignee ?? '—'}</span>
        {item.due_date && (
          <span className={clsx('font-mono text-[10px]', overdue ? 'text-red-600 font-bold' : 'text-gray-400')}>
            {fmtShort(item.due_date)}{overdue ? ' ⚠' : ''}
          </span>
        )}
      </div>
      {item.session && (
        <p className="font-mono text-[9px] text-gray-300">{fmtShort(item.session.ended_at)}</p>
      )}
    </div>
  );
};

// ─── Board View ───────────────────────────────────────────────────────────────

const BoardView: React.FC<{ items: TrackerItem[]; onItemClick: (i: TrackerItem) => void }> = ({ items, onItemClick }) => (
  <div className="flex gap-4 h-full overflow-x-auto pb-4">
    {ALL_STATUSES.map(status => {
      const col = items.filter(i => i.status === status);
      return (
        <div key={status} className="flex-shrink-0 w-64 flex flex-col">
          <div className="flex items-center gap-2 mb-3 px-0.5">
            <StatusBadge status={status} />
            <span className="text-xs font-mono text-gray-400 ml-auto">{col.length}</span>
          </div>
          <div className="flex-1 overflow-y-auto space-y-2 pr-0.5">
            {col.length === 0 ? (
              <div className="border-2 border-dashed border-gray-100 rounded-xl h-24 flex items-center justify-center text-[11px] text-gray-300 font-mono">
                empty
              </div>
            ) : col.map(item => (
              <BoardCard key={item.id} item={item} onClick={() => onItemClick(item)} />
            ))}
          </div>
        </div>
      );
    })}
  </div>
);

// ─── List View ────────────────────────────────────────────────────────────────

type SortKey = 'type' | 'priority' | 'title' | 'assignee' | 'due_date' | 'status' | 'session' | 'updated_at';

const ListView: React.FC<{ items: TrackerItem[]; onItemClick: (i: TrackerItem) => void }> = ({ items, onItemClick }) => {
  const [sortKey, setSortKey] = useState<SortKey>('updated_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  function handleSort(k: SortKey) {
    setSortKey(k);
    setSortDir(prev => (sortKey === k ? (prev === 'asc' ? 'desc' : 'asc') : 'asc'));
  }

  const sorted = [...items].sort((a, b) => {
    if (sortKey === 'priority') {
      const o = { Critical: 0, High: 1, Medium: 2, Low: 3 };
      return sortDir === 'asc' ? o[a.priority] - o[b.priority] : o[b.priority] - o[a.priority];
    }
    const av = sortKey === 'session' ? (a.session?.ended_at ?? a.created_at) : (a[sortKey] as string) ?? '';
    const bv = sortKey === 'session' ? (b.session?.ended_at ?? b.created_at) : (b[sortKey] as string) ?? '';
    if (av < bv) return sortDir === 'asc' ? -1 : 1;
    if (av > bv) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  const Th: React.FC<{ col: SortKey; label: string; className?: string }> = ({ col, label, className }) => (
    <th
      onClick={() => handleSort(col)}
      className={clsx('px-3 py-2.5 text-left text-[10px] font-mono font-bold text-gray-400 uppercase tracking-widest cursor-pointer select-none whitespace-nowrap hover:text-gray-700 transition-colors', className)}
    >
      {label}{sortKey === col && <span className="ml-1 opacity-60">{sortDir === 'asc' ? '↑' : '↓'}</span>}
    </th>
  );

  return (
    <div className="overflow-auto h-full rounded-xl border border-gray-200 bg-white">
      <table className="w-full text-sm border-collapse">
        <thead className="sticky top-0 bg-white border-b border-gray-100 z-10">
          <tr>
            <Th col="type" label="Type" />
            <Th col="priority" label="Priority" />
            <Th col="title" label="Title" className="min-w-[260px]" />
            <Th col="assignee" label="Assignee" />
            <Th col="due_date" label="Due" />
            <Th col="status" label="Status" />
            <Th col="session" label="Session" />
            <Th col="updated_at" label="Updated" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((item, idx) => {
            const overdue = isOverdue(item.due_date);
            return (
              <tr
                key={item.id}
                onClick={() => onItemClick(item)}
                className={clsx('border-b border-gray-50 cursor-pointer hover:bg-blue-50/30 transition-colors', idx % 2 === 1 ? 'bg-gray-50/40' : '')}
              >
                <td className="px-3 py-2.5"><TypeBadge type={item.type} /></td>
                <td className="px-3 py-2.5"><PriorityBadge priority={item.priority} /></td>
                <td className="px-3 py-2.5 max-w-xs">
                  <span className="font-medium text-gray-900 line-clamp-1 text-sm">{item.title}</span>
                  {item.component_reference && <span className="font-mono text-[10px] text-gray-400 ml-2">{item.component_reference}</span>}
                </td>
                <td className="px-3 py-2.5 font-mono text-xs text-gray-500">{item.assignee ?? '—'}</td>
                <td className={clsx('px-3 py-2.5 font-mono text-xs whitespace-nowrap', overdue ? 'text-red-600 font-semibold' : 'text-gray-500')}>
                  {item.due_date ? fmtShort(item.due_date) : '—'}{overdue ? ' ⚠' : ''}
                </td>
                <td className="px-3 py-2.5"><StatusBadge status={item.status} /></td>
                <td className="px-3 py-2.5 font-mono text-xs text-gray-400 whitespace-nowrap">{item.session ? fmtShort(item.session.ended_at) : '—'}</td>
                <td className="px-3 py-2.5 font-mono text-xs text-gray-400 whitespace-nowrap">{fmtShort(item.updated_at)}</td>
              </tr>
            );
          })}
          {sorted.length === 0 && (
            <tr><td colSpan={8} className="px-3 py-16 text-center text-sm text-gray-400 font-mono">No items match the current filters.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

// ─── Item Drawer ──────────────────────────────────────────────────────────────

type DrawerTab = 'details' | 'comments' | 'history';

interface ItemDrawerProps {
  item: TrackerItem;
  onClose: () => void;
  onUpdate: (id: string, updates: Partial<TrackerItem>) => Promise<void>;
}

const ItemDrawer: React.FC<ItemDrawerProps> = ({ item, onClose, onUpdate }) => {
  const [tab, setTab] = useState<DrawerTab>('details');
  const [comments, setComments] = useState<TrackerComment[]>([]);
  const [history, setHistory] = useState<StatusHistoryEntry[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchComments = useCallback(async () => {
    setLoadingComments(true);
    const { data } = await supabase.from('tracker_comments').select('*').eq('item_id', item.id).order('created_at');
    setComments((data as TrackerComment[]) ?? []);
    setLoadingComments(false);
  }, [item.id]);

  const fetchHistory = useCallback(async () => {
    setLoadingHistory(true);
    const { data } = await supabase.from('tracker_status_history').select('*').eq('item_id', item.id).order('created_at', { ascending: false });
    setHistory((data as StatusHistoryEntry[]) ?? []);
    setLoadingHistory(false);
  }, [item.id]);

  useEffect(() => { fetchComments(); }, [fetchComments]);
  useEffect(() => { if (tab === 'history') fetchHistory(); }, [tab, fetchHistory]);

  async function handleAddComment() {
    const text = newComment.trim();
    if (!text) return;
    setSubmitting(true);
    await supabase.from('tracker_comments').insert({ item_id: item.id, author_name: 'You', text });
    setNewComment('');
    await fetchComments();
    setSubmitting(false);
  }

  function field(key: keyof TrackerItem) {
    return async (val: string | null) => {
      await onUpdate(item.id, { [key]: val } as Partial<TrackerItem>);
    };
  }

  const TabBtn: React.FC<{ id: DrawerTab; label: string; badge?: number }> = ({ id, label, badge }) => (
    <button
      onClick={() => setTab(id)}
      className={clsx('px-3 py-2 text-xs font-semibold transition-colors border-b-2 -mb-px', tab === id ? 'border-black text-black' : 'border-transparent text-gray-400 hover:text-gray-700')}
    >
      {label}{badge !== undefined && badge > 0 && <span className="ml-1.5 bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full text-[10px]">{badge}</span>}
    </button>
  );

  return (
    <>
      <div className="fixed inset-0 bg-black/20 backdrop-blur-[2px] z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-screen w-[520px] bg-white z-50 flex flex-col shadow-2xl border-l border-gray-200">
        {/* Drawer header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2 flex-wrap pt-0.5">
            <TypeBadge type={item.type} />
            <PriorityBadge priority={item.priority} />
            {item.component_reference && (
              <span className="font-mono text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{item.component_reference}</span>
            )}
          </div>
          <button onClick={onClose} className="text-gray-300 hover:text-gray-700 transition-colors text-xl leading-none ml-4 flex-shrink-0">✕</button>
        </div>

        {/* Title (editable) */}
        <div className="px-6 pt-4 pb-3 border-b border-gray-100 flex-shrink-0">
          <div className="group/title">
            <InlineField label="" value={item.title} onSave={field('title')} placeholder="Item title…" />
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-0 px-6 border-b border-gray-100 flex-shrink-0">
          <TabBtn id="details" label="Details" />
          <TabBtn id="comments" label="Comments" badge={comments.length} />
          <TabBtn id="history" label="History" />
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {tab === 'details' && (
            <div className="px-6 py-5 space-y-5">
              {/* Status */}
              <div>
                <p className="font-mono text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-2">Status</p>
                <div className="flex gap-2 flex-wrap">
                  {ALL_STATUSES.map(s => (
                    <button
                      key={s}
                      onClick={() => onUpdate(item.id, { status: s })}
                      className={clsx('px-3 py-1.5 rounded-full text-xs font-semibold border transition-all', item.status === s ? statusColor[s] + ' border-transparent shadow-sm' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300')}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Description */}
              <InlineField label="Description" value={item.description} onSave={field('description')} type="textarea" placeholder="Add a description…" />

              {/* Meta grid */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-4">
                <InlineField label="Assignee" value={item.assignee} onSave={field('assignee')} placeholder="—" />
                <InlineField label="Due Date" value={item.due_date} onSave={field('due_date')} type="date" />
                <InlineField label="Priority" value={item.priority} onSave={field('priority')} type="select" options={[...ALL_PRIORITIES]} />
                <InlineField label="Department" value={item.department} onSave={field('department')} placeholder="—" />
                <div className="col-span-2">
                  <InlineField label="Component Reference" value={item.component_reference} onSave={field('component_reference')} placeholder="—" mono />
                </div>
              </div>

              {/* Type-specific fields */}
              {item.type === 'RISK' && (
                <div className="space-y-4 border-t border-gray-100 pt-4">
                  <p className="font-mono text-[9px] font-bold text-gray-400 uppercase tracking-widest">Risk Fields</p>
                  <InlineField label="Impact" value={item.impact} onSave={field('impact')} type="textarea" placeholder="Describe the potential impact…" />
                  <InlineField label="Mitigation Strategy" value={item.mitigation_strategy} onSave={field('mitigation_strategy')} type="textarea" placeholder="Describe the mitigation approach…" />
                </div>
              )}
              {item.type === 'RATIONALE' && (
                <div className="space-y-4 border-t border-gray-100 pt-4">
                  <p className="font-mono text-[9px] font-bold text-gray-400 uppercase tracking-widest">Rationale Fields</p>
                  <InlineField label="Design Driver" value={item.design_driver} onSave={field('design_driver')} type="textarea" placeholder="What drove this decision?" />
                  <InlineField label="Tradeoff Analysis" value={item.tradeoff_analysis} onSave={field('tradeoff_analysis')} type="textarea" placeholder="What alternatives were considered?" />
                </div>
              )}

              {/* Source session */}
              {item.session && (
                <div className="border-t border-gray-100 pt-4">
                  <p className="font-mono text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-2">Source Session</p>
                  <div className="bg-gray-50 rounded-lg px-3 py-2.5">
                    <p className="text-sm font-semibold text-gray-800">{item.session.title}</p>
                    <p className="font-mono text-xs text-gray-400 mt-0.5">
                      {fmt(item.session.ended_at)}
                      {item.session.model_name && <span className="ml-2">· {item.session.model_name}</span>}
                      <span className="ml-2">· {item.session.participant_count} participants</span>
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'comments' && (
            <div className="px-6 py-5 space-y-4">
              {loadingComments ? (
                <p className="text-xs text-gray-400 font-mono animate-pulse">Loading…</p>
              ) : comments.length === 0 ? (
                <p className="text-sm text-gray-400 italic text-center py-8">No comments yet. Start the discussion.</p>
              ) : (
                <div className="space-y-4">
                  {comments.map(c => (
                    <div key={c.id} className="flex gap-3">
                      <div className="w-7 h-7 rounded-full bg-gray-900 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
                        {c.author_name[0].toUpperCase()}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-baseline gap-2 mb-1">
                          <span className="text-sm font-semibold text-gray-900">{c.author_name}</span>
                          <span className="font-mono text-[10px] text-gray-400">{fmt(c.created_at)} · {fmtTime(c.created_at)}</span>
                        </div>
                        <p className="text-sm text-gray-700 leading-relaxed">{c.text}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2 pt-2 border-t border-gray-100">
                <input
                  type="text"
                  value={newComment}
                  onChange={e => setNewComment(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddComment(); } }}
                  placeholder="Add a comment…"
                  disabled={submitting}
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent placeholder:text-gray-300"
                />
                <button
                  onClick={handleAddComment}
                  disabled={submitting || !newComment.trim()}
                  className="px-4 py-2 bg-black text-white text-xs font-semibold rounded-lg hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Post
                </button>
              </div>
            </div>
          )}

          {tab === 'history' && (
            <div className="px-6 py-5 space-y-3">
              {loadingHistory ? (
                <p className="text-xs text-gray-400 font-mono animate-pulse">Loading…</p>
              ) : history.length === 0 ? (
                <p className="text-sm text-gray-400 italic text-center py-8">No status changes recorded.</p>
              ) : (
                <div className="relative">
                  <div className="absolute left-3 top-0 bottom-0 w-px bg-gray-100" />
                  <div className="space-y-4">
                    {history.map(h => (
                      <div key={h.id} className="flex gap-4 relative">
                        <div className={clsx('w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center z-10 border-2 border-white', statusDot[h.status as TrackerItem['status']] ?? 'bg-gray-400')} />
                        <div className="flex-1 pb-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <StatusBadge status={h.status as TrackerItem['status']} />
                            <span className="text-xs text-gray-500">by <span className="font-semibold">{h.changed_by}</span></span>
                          </div>
                          <p className="font-mono text-[10px] text-gray-400 mt-1">{fmt(h.created_at)} · {fmtTime(h.created_at)}</p>
                          {h.note && <p className="text-xs text-gray-600 mt-1 italic">{h.note}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Drawer footer */}
        <div className="flex-shrink-0 px-6 py-3 border-t border-gray-100 flex items-center justify-between">
          <span className="font-mono text-[10px] text-gray-300">Updated {fmtShort(item.updated_at)}</span>
          <button
            onClick={() => exportToCSV([item], `item-${item.id.slice(0, 8)}`)}
            className="text-xs font-medium text-gray-500 hover:text-gray-800 transition-colors flex items-center gap-1"
          >
            ↓ Export
          </button>
        </div>
      </div>
    </>
  );
};

// ─── Session Sidebar ──────────────────────────────────────────────────────────

const SessionSidebar: React.FC<{
  sessions: TrackerSession[];
  allItems: TrackerItem[];
  selectedSessionId: string | null;
  onSelect: (id: string | null) => void;
}> = ({ sessions, allItems, selectedSessionId, onSelect }) => {
  function counts(sessionId: string) {
    const items = allItems.filter(i => i.session_id === sessionId);
    return {
      R: items.filter(i => i.type === 'RISK').length,
      A: items.filter(i => i.type === 'ACTION').length,
      Ra: items.filter(i => i.type === 'RATIONALE').length,
      total: items.length,
    };
  }

  const allCount = allItems.length;
  const allActive = selectedSessionId === null;

  return (
    <aside className="w-56 flex-shrink-0 bg-[#111111] h-full overflow-y-auto flex flex-col">
      <div className="px-3 pt-5 pb-2">
        <p className="font-mono text-[9px] font-bold text-gray-500 uppercase tracking-widest px-2 mb-3">Sessions</p>

        <button
          onClick={() => onSelect(null)}
          className={clsx(
            'w-full text-left px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors mb-1',
            allActive ? 'bg-white text-gray-900' : 'text-gray-400 hover:bg-white/10 hover:text-white'
          )}
        >
          All Sessions
          <span className={clsx('ml-2 font-mono text-xs font-normal', allActive ? 'text-gray-500' : 'text-gray-600')}>
            {allCount}
          </span>
        </button>

        <div className="h-px bg-white/10 my-3 mx-2" />

        {sessions.map(session => {
          const { R, A, Ra, total } = counts(session.id);
          const active = selectedSessionId === session.id;
          return (
            <button
              key={session.id}
              onClick={() => onSelect(session.id)}
              className={clsx(
                'w-full text-left px-3 py-2.5 rounded-lg transition-colors mb-0.5',
                active ? 'bg-white' : 'hover:bg-white/10'
              )}
            >
              <p className={clsx('text-xs font-semibold leading-tight', active ? 'text-gray-900' : 'text-gray-300')}>
                {session.title}
              </p>
              <p className={clsx('font-mono text-[10px] mt-1', active ? 'text-gray-500' : 'text-gray-600')}>
                {fmtShort(session.ended_at)} · {total}
              </p>
              <div className={clsx('flex gap-2 mt-1.5 font-mono text-[10px]', active ? 'text-gray-500' : 'text-gray-600')}>
                <span className="text-red-400">{R}R</span>
                <span className="text-blue-400">{A}A</span>
                <span className="text-amber-400">{Ra}Ra</span>
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
};

// ─── Filter + Search Bar ──────────────────────────────────────────────────────

interface Filters {
  type: TrackerItem['type'] | 'All';
  priority: TrackerItem['priority'] | 'All';
  status: TrackerItem['status'] | 'All';
  assignee: string | 'All';
  search: string;
}

const FilterBar: React.FC<{
  filters: Filters;
  assignees: string[];
  onChange: (f: Filters) => void;
}> = ({ filters, assignees, onChange }) => {
  const sel = 'border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent cursor-pointer';
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="relative">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">🔍</span>
        <input
          type="text"
          value={filters.search}
          onChange={e => onChange({ ...filters, search: e.target.value })}
          placeholder="Search items…"
          className="pl-7 pr-3 py-1.5 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent w-44 placeholder:text-gray-300"
        />
      </div>
      <select value={filters.type} onChange={e => onChange({ ...filters, type: e.target.value as Filters['type'] })} className={sel}>
        <option value="All">All Types</option>
        {ALL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
      </select>
      <select value={filters.priority} onChange={e => onChange({ ...filters, priority: e.target.value as Filters['priority'] })} className={sel}>
        <option value="All">All Priorities</option>
        {ALL_PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
      </select>
      <select value={filters.status} onChange={e => onChange({ ...filters, status: e.target.value as Filters['status'] })} className={sel}>
        <option value="All">All Statuses</option>
        {ALL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
      {assignees.length > 0 && (
        <select value={filters.assignee} onChange={e => onChange({ ...filters, assignee: e.target.value })} className={sel}>
          <option value="All">All Assignees</option>
          {assignees.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      )}
    </div>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────

type ViewMode = 'board' | 'list';

const TrackerPage: React.FC = () => {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<TrackerSession[]>([]);
  const [allItems, setAllItems] = useState<TrackerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('board');
  const [selectedItem, setSelectedItem] = useState<TrackerItem | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [filters, setFilters] = useState<Filters>({ type: 'All', priority: 'All', status: 'All', assignee: 'All', search: '' });

  const fetchSessions = useCallback(async () => {
    const { data } = await supabase.from('tracker_sessions').select('*').order('ended_at', { ascending: false });
    setSessions((data as TrackerSession[]) ?? []);
  }, []);

  const fetchItems = useCallback(async () => {
    let q = supabase.from('tracker_items').select('*, session:tracker_sessions(*)').order('created_at', { ascending: false });
    if (selectedSessionId) q = q.eq('session_id', selectedSessionId);
    const { data } = await q;
    setAllItems((data as TrackerItem[]) ?? []);
  }, [selectedSessionId]);

  useEffect(() => {
    async function init() {
      setLoading(true);
      await Promise.all([fetchSessions(), fetchItems()]);
      setLoading(false);
    }
    init();
  }, [fetchSessions, fetchItems]);

  const updateItem = useCallback(async (id: string, updates: Partial<TrackerItem>) => {
    const now = new Date().toISOString();
    await supabase.from('tracker_items').update({ ...updates, updated_at: now }).eq('id', id);

    if (updates.status) {
      await supabase.from('tracker_status_history').insert({ item_id: id, status: updates.status, changed_by: 'You' });
    }

    const merged = { ...updates, updated_at: now };
    setAllItems(prev => prev.map(i => i.id === id ? { ...i, ...merged } : i));
    setSelectedItem(prev => prev?.id === id ? { ...prev, ...merged } : prev);
  }, []);

  async function handleSeed() {
    if (!confirm('This will insert demo data (3 sessions, 16 items). Continue?')) return;
    setSeeding(true);
    await seedDemoData();
    await Promise.all([fetchSessions(), fetchItems()]);
    setSeeding(false);
  }

  const assignees = Array.from(new Set(allItems.map(i => i.assignee).filter((a): a is string => !!a)));

  const filteredItems = allItems.filter(item => {
    if (filters.type !== 'All' && item.type !== filters.type) return false;
    if (filters.priority !== 'All' && item.priority !== filters.priority) return false;
    if (filters.status !== 'All' && item.status !== filters.status) return false;
    if (filters.assignee !== 'All' && item.assignee !== filters.assignee) return false;
    if (filters.search) {
      const q = filters.search.toLowerCase();
      const haystack = [item.title, item.description, item.assignee, item.component_reference].join(' ').toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  const stats = computeStats(allItems);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#111111]">
        <p className="font-mono text-sm text-gray-600 animate-pulse">Loading tracker…</p>
      </div>
    );
  }

  return (
    <div className="h-screen overflow-hidden flex flex-col bg-white" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* ── Header ── */}
      <header className="flex-shrink-0 bg-black text-white flex items-center justify-between px-6 h-12 z-30">
        <div className="flex items-center gap-3">
          <span className="font-mono text-sm font-bold tracking-widest uppercase select-none">Viewpoint Tracker</span>
          {sessions.length > 0 && (
            <span className="font-mono text-[10px] text-gray-500 border border-gray-700 rounded px-2 py-0.5">
              {sessions.length} session{sessions.length !== 1 ? 's' : ''} · {allItems.length} items
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleSeed}
            disabled={seeding}
            className="font-mono text-xs text-gray-500 hover:text-gray-300 transition-colors disabled:opacity-40"
          >
            {seeding ? 'Seeding…' : '+ Demo Data'}
          </button>
          <button
            onClick={() => exportToCSV(filteredItems)}
            disabled={filteredItems.length === 0}
            className="font-mono text-xs text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 rounded px-3 py-1 transition-colors disabled:opacity-30"
          >
            ↓ Export CSV
          </button>
          <button onClick={() => navigate('/')} className="font-mono text-xs text-gray-500 hover:text-white transition-colors">
            ← Arena
          </button>
        </div>
      </header>

      {/* ── Stats Bar ── */}
      {allItems.length > 0 && <StatsBar stats={stats} />}

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <SessionSidebar
          sessions={sessions}
          allItems={allItems}
          selectedSessionId={selectedSessionId}
          onSelect={id => { setSelectedSessionId(id); setSelectedItem(null); }}
        />

        {/* Main */}
        <main className="flex-1 flex flex-col overflow-hidden bg-gray-50">
          {/* Filter bar */}
          <div className="flex-shrink-0 flex items-center justify-between gap-3 px-6 py-3 bg-white border-b border-gray-200 flex-wrap">
            <FilterBar filters={filters} assignees={assignees} onChange={setFilters} />
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5 ml-auto">
              {(['board', 'list'] as ViewMode[]).map(m => (
                <button
                  key={m}
                  onClick={() => setViewMode(m)}
                  className={clsx('px-3 py-1 text-xs font-semibold rounded-md capitalize transition-colors', viewMode === m ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-700')}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Content */}
          {sessions.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-6">
              <div className="text-4xl">📋</div>
              <p className="text-gray-500 text-sm max-w-xs">No sessions yet. End a meeting to see items here, or load demo data to explore the tracker.</p>
              <button onClick={handleSeed} disabled={seeding} className="mt-2 px-4 py-2 bg-black text-white text-sm font-semibold rounded-lg hover:bg-gray-800 disabled:opacity-40 transition-colors">
                {seeding ? 'Loading…' : 'Load Demo Data'}
              </button>
            </div>
          ) : (
            <div className="flex-1 overflow-hidden p-6">
              {viewMode === 'board'
                ? <BoardView items={filteredItems} onItemClick={setSelectedItem} />
                : <ListView items={filteredItems} onItemClick={setSelectedItem} />
              }
            </div>
          )}
        </main>
      </div>

      {/* ── Item Drawer ── */}
      {selectedItem && (
        <ItemDrawer
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onUpdate={updateItem}
        />
      )}
    </div>
  );
};

export default TrackerPage;
