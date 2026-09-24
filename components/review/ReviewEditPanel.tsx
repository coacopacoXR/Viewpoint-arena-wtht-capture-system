// The room's Edit panel: the curation tabs, in the side panel where Capture ·
// Comments · Chat usually is.
//
// docs/plan/14-rooms-models-admin-ai.md batch BH. This is what "prepare the review
// inside its room" looks like once the separate curate page is gone — the same
// tabs, the same components, rendering against the review the room is holding
// rather than against a draft only this browser had.
//
// Two deliberate choices:
//
//   • DARK, unlike the panel it replaces. The tabs were written for the curate
//     page's #111 sidebar and are one copy, not two re-themed ones; giving the
//     Edit panel the same surface is cheaper than a theme prop on six components,
//     and it makes "the meeting is paused, you are editing" obvious at a glance
//     from anywhere in the room. The amber strip above says the same thing in
//     words.
//   • The tab order is Agenda · Views · Pins · Requirements · Labels · People,
//     which is the order the user approved in the sketch and NOT the curate page's
//     (Asset first). The Asset tab has no equivalent here: its model picker is the
//     model tree's job, its transform is the amber strip's, and its "+ Revision"
//     is BB's import flow.
//
// There is no Asset tab and no People tab on a deployment without accounts.

import React, { useMemo, useState } from 'react';
import { Camera, ListOrdered, MapPin, Scale, Tags, Users } from 'lucide-react';
import { clsx } from 'clsx';
import { useActiveReviewStore } from '../../lib/activeReviewStore';
import { identityRequired, publicIdentityOf } from '../../lib/auth/authRules';
import { useConnectorConfig } from '../../lib/config/ConfigContext';
import { AgendaTab } from './AgendaTab';
import { LabelsTab } from './LabelsTab';
import PeopleTab from './PeopleTab';
import { PinsTab } from './PinsTab';
import { RequirementsTab } from './RequirementsTab';
import { ViewsTab } from './ViewsTab';
import { useActiveReviewActions } from './useActiveReviewActions';

type EditTabId = 'agenda' | 'views' | 'pins' | 'requirements' | 'labels' | 'people';

/**
 * The tabs, in the order they are shown.
 *
 * `accountsOnly` is what makes the People tab disappear on the default install
 * rather than appear and fail: with identity.mode 'none' there are no accounts, so
 * there is no roster to list and no email address that could resolve to one.
 */
const TABS: Array<{ id: EditTabId; label: string; ariaLabel: string; icon: React.ReactNode; accountsOnly?: boolean }> = [
  { id: 'agenda',       label: 'Agenda', ariaLabel: 'Agenda',       icon: <ListOrdered size={12} /> },
  { id: 'views',        label: 'Views',  ariaLabel: 'Viewpoints',   icon: <Camera size={12} /> },
  { id: 'pins',         label: 'Pins',   ariaLabel: 'Pins',         icon: <MapPin size={12} /> },
  { id: 'requirements', label: 'Reqs',   ariaLabel: 'Requirements', icon: <Scale size={12} /> },
  { id: 'labels',       label: 'Labels', ariaLabel: 'Labels',       icon: <Tags size={12} /> },
  { id: 'people',       label: 'People', ariaLabel: 'People',       icon: <Users size={12} />, accountsOnly: true },
];

const ReviewEditPanel: React.FC<{
  reviewId: string;
  /** Called after a People write, so the room can re-read its own role. */
  onRosterChanged?: () => void;
}> = ({ reviewId, onRosterChanged }) => {
  const config = useActiveReviewStore((s) => s.config);
  const jumpToViewpoint = useActiveReviewStore((s) => s.jumpToViewpoint);
  const actions = useActiveReviewActions();
  const { config: connectorConfig } = useConnectorConfig();

  const accountsOn = useMemo(
    () => identityRequired(publicIdentityOf(connectorConfig)),
    [connectorConfig],
  );
  const tabs = useMemo(
    () => TABS.filter((tab) => accountsOn || !tab.accountsOnly),
    [accountsOn],
  );

  const [tab, setTab] = useState<EditTabId>('agenda');
  // Which pin's notes are open. Local to the panel and not to the review: it is
  // where this person's eye is, not a fact anybody else needs.
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);

  // The panel is only rendered while Edit is on, and the tabs cannot exist without
  // it. Losing the review mid-edit — a delete from another screen, a load that
  // failed — is worth a sentence rather than six empty tabs.
  if (!config) {
    return (
      <div className="flex-1 min-h-0 bg-[#111] rounded-lg border border-white/10 p-5">
        <p className="text-[11px] text-gray-400 leading-relaxed">
          This room has no design review to edit yet.
        </p>
      </div>
    );
  }

  // A tab that only exists with accounts, selected before accounts were known
  // about (a config that arrived late), falls back rather than rendering nothing.
  const visible = tabs.some((t) => t.id === tab) ? tab : 'agenda';

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-2">
      <div
        role="tablist"
        aria-label="Review sections"
        className="shrink-0 grid grid-cols-3 gap-1 rounded-lg border border-white/10 bg-[#111] p-1"
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={visible === t.id}
            aria-label={t.ariaLabel}
            onClick={() => setTab(t.id)}
            className={clsx(
              'flex items-center justify-center gap-1 py-1.5 rounded text-[10px] font-bold uppercase tracking-wide transition-colors',
              visible === t.id
                ? 'bg-white text-black'
                : 'text-gray-500 hover:text-gray-300 hover:bg-white/5',
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        aria-label={TABS.find((t) => t.id === visible)?.ariaLabel}
        className="flex-1 min-h-0 overflow-y-auto rounded-lg border border-white/10 bg-[#111] custom-scrollbar"
      >
        {visible === 'agenda' && (
          <AgendaTab
            agenda={config.agenda}
            viewpoints={config.viewpoints}
            pins={config.pins}
            onJumpViewpoint={(vp) => jumpToViewpoint(vp.id)}
            onSelectPin={(id) => { setSelectedPinId(id); setTab('pins'); }}
            actions={actions}
          />
        )}
        {visible === 'views' && (
          <ViewsTab
            viewpoints={config.viewpoints}
            onJump={(vp) => jumpToViewpoint(vp.id)}
            actions={actions}
          />
        )}
        {visible === 'pins' && (
          <PinsTab
            pins={config.pins}
            selectedId={selectedPinId}
            onSelect={setSelectedPinId}
            actions={actions}
          />
        )}
        {visible === 'requirements' && (
          <RequirementsTab requirements={config.requirements} actions={actions} />
        )}
        {visible === 'labels' && <LabelsTab labels={config.labels} actions={actions} />}
        {visible === 'people' && <PeopleTab reviewId={reviewId} onRosterChanged={onRosterChanged} />}
      </div>
    </div>
  );
};

export default ReviewEditPanel;
