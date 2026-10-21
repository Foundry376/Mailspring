import React from 'react';
import { localized } from 'mailspring-exports';
import { AgendaContainer } from './core/agenda-container';

/** The calendar's agenda as a choice in the thread sidebar's panel switcher. */
export class SidebarAgendaPanel extends React.Component<{ active: boolean }> {
  static displayName = 'SidebarAgendaPanel';
  static sidebarPanel = { id: 'calendar', title: localized('Calendar') };

  render() {
    // Panels stay mounted while hidden; skip the agenda's event query until it's shown.
    if (!this.props.active) return null;
    return <AgendaContainer className="sidebar-agenda-panel" />;
  }
}
