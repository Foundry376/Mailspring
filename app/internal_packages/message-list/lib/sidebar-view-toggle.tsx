import React from 'react';
import { localized } from 'mailspring-exports';

export type SidebarView = 'contacts' | 'calendar';

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
          className={`toggle-btn ${selectedView === 'contacts' ? 'active' : ''}`}
          onClick={() => onSelectView('contacts')}
        >
          {localized('Contacts')}
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
