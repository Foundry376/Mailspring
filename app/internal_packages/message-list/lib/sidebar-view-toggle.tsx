import React from 'react';
import { localized } from 'mailspring-exports';

export type SidebarView = 'participants' | 'calendar';

interface SidebarViewToggleProps {
  selectedView: SidebarView;
  onSelectView: (view: SidebarView) => void;
}

export class SidebarViewToggle extends React.Component<SidebarViewToggleProps> {
  static displayName = 'SidebarViewToggle';

  render() {
    const { selectedView, onSelectView } = this.props;
    return (
      <div className="sidebar-view-toggle">
        <button
          className={`toggle-btn ${selectedView === 'participants' ? 'active' : ''}`}
          onClick={() => onSelectView('participants')}
        >
          {localized('Participants')}
        </button>
        <button
          className={`toggle-btn ${selectedView === 'calendar' ? 'active' : ''}`}
          onClick={() => onSelectView('calendar')}
        >
          {localized('Calendar')}
        </button>
      </div>
    );
  }
}
