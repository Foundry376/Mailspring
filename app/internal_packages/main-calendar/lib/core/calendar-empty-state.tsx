import React from 'react';
import { Actions, localized } from 'mailspring-exports';
import { RetinaImg } from 'mailspring-component-kit';

export function CalendarEmptyState() {
  const onOpenAccountPreferences = () => {
    Actions.switchPreferencesTab('Accounts');
    Actions.openPreferences();
  };

  return (
    <div className="calendar-empty-state">
      <div className="calendar-empty-state-content">
        <RetinaImg
          name="ic-calendar-month@2x.png"
          mode={RetinaImg.Mode.ContentIsMask}
          className="calendar-empty-state-icon"
        />
        <h2 className="calendar-empty-state-title">{localized('No Calendars')}</h2>
        <p className="calendar-empty-state-message">
          {localized(
            'None of your connected accounts provide calendars. Mailspring supports calendars from Gmail and other providers with CalDAV support.'
          )}
        </p>
        <button className="btn btn-large btn-emphasis" onClick={onOpenAccountPreferences}>
          {localized('Add a Calendar Account')}
        </button>
      </div>
    </div>
  );
}
