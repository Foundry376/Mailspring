import React from 'react';
import classnames from 'classnames';
import { localized } from 'mailspring-exports';
import { DropdownMenu } from 'mailspring-component-kit';
import { eventCountLabel } from '../activity-events';
import { SegmentedControl } from '../segmented-control';

export type EventKind = 'all' | 'open' | 'click';
export type GroupBy = 'none' | 'recipient' | 'message';

export interface ActivityFeedFilters {
  search: string;
  kind: EventKind;
  collapseRepeats: boolean;
  groupBy: GroupBy;
}

interface ActivityFeedToolbarProps {
  filters: ActivityFeedFilters;
  eventCount: number;
  onChange: (patch: Partial<ActivityFeedFilters>) => void;
  onExport: () => void;
}

export function ActivityFeedToolbar({
  filters,
  eventCount,
  onChange,
  onExport,
}: ActivityFeedToolbarProps) {
  const { search, kind, collapseRepeats, groupBy } = filters;
  const groupByOptions: { id: GroupBy; name: string }[] = [
    { id: 'none', name: localized('None') },
    { id: 'recipient', name: localized('Recipient') },
    { id: 'message', name: localized('Message') },
  ];
  return (
    <div className="activity-toolbar">
      <input
        type="search"
        className="toolbar-search"
        placeholder={localized('Search by recipient, subject, or link…')}
        value={search}
        onChange={(e) => onChange({ search: e.target.value })}
      />
      <SegmentedControl<EventKind>
        value={kind}
        onChange={(id) => onChange({ kind: id })}
        options={[
          { id: 'all', label: localized('All') },
          { id: 'open', label: localized('Opens') },
          { id: 'click', label: localized('Clicks') },
        ]}
      />
      <div className="group-by">
        <span className="group-by-label">{localized('Group by')}</span>
        <DropdownMenu
          intitialSelectionItem={groupByOptions.find((o) => o.id === groupBy)}
          defaultSelectedIndex={groupByOptions.findIndex((o) => o.id === groupBy)}
          headerComponents={[]}
          footerComponents={[]}
          items={groupByOptions}
          itemKey={(item) => item.id}
          itemContent={(item) => item.name}
          onSelect={(item) => onChange({ groupBy: item.id })}
        />
      </div>
      <label className="toolbar-checkbox">
        <input
          type="checkbox"
          checked={collapseRepeats}
          onChange={(e) => onChange({ collapseRepeats: e.target.checked })}
        />
        {localized('Collapse repeated events')}
      </label>
      <div className="spacer" />
      <div className="event-count">{eventCountLabel(eventCount)}</div>
      <div
        className={classnames('btn', { 'btn-disabled': eventCount === 0 })}
        onClick={eventCount === 0 ? undefined : onExport}
      >
        {localized('Export CSV')}
      </div>
    </div>
  );
}
ActivityFeedToolbar.displayName = 'ActivityFeedToolbar';
