/* eslint jsx-a11y/label-has-for: 0 */
import _ from 'underscore';
import classnames from 'classnames';
import React from 'react';

import { calcColor } from './calendar-helpers';
import { Calendar, Account } from 'mailspring-exports';
import { OutlineView } from 'mailspring-component-kit';

const DISABLED_CALENDARS = 'mailspring.disabledCalendars';

function renderCalendarToggles(calendars: Calendar[], disabledCalendars: string[]) {
  return calendars.map((calendar) => {
    const calendarId = calendar.id;
    const onClick = () => {
      const cals = AppEnv.config.get(DISABLED_CALENDARS) || [];
      if (cals.includes(calendarId)) {
        cals.splice(cals.indexOf(calendarId), 1);
      } else {
        cals.push(calendarId);
      }
      AppEnv.config.set(DISABLED_CALENDARS, cals);
    };

    const checked = !disabledCalendars.includes(calendar.id);
    const checkboxClass = classnames({
      'colored-checkbox': true,
      checked: checked,
    });
    const bgColor = checked ? calcColor(calendar.id) : 'transparent';
    return (
      <div
        title={calendar.name}
        onClick={onClick}
        className="toggle-wrap"
        key={`check-${calendar.id}`}
      >
        <div className={checkboxClass}>
          <div className="bg-color" style={{ backgroundColor: bgColor }} />
        </div>
        <label>{calendar.name}</label>
      </div>
    );
  });
}

interface CalendarSourceListProps {
  accounts: Account[];
  calendars: Calendar[];
  disabledCalendars: string[];
}
export function CalendarSourceList(props: CalendarSourceListProps) {
  // Kept apart from mail's sidebarKeysCollapsed, so hiding an account's folders leaves its calendars.
  const [collapsedAccounts, setCollapsedAccounts] = React.useState<{
    [accountId: string]: boolean;
  }>(() => AppEnv.savedState.calendarAccountsCollapsed || {});
  const onCollapseToggled = (accountId: string) => {
    const next = { ...collapsedAccounts, [accountId]: !collapsedAccounts[accountId] };
    AppEnv.savedState.calendarAccountsCollapsed = next;
    setCollapsedAccounts(next);
  };

  const calsByAccountId = _.groupBy(props.calendars, 'accountId');
  const accountSections: { account: Account; calendars: Calendar[] }[] = [];
  for (const accountId of Object.keys(calsByAccountId)) {
    const calendars = calsByAccountId[accountId];
    const account = props.accounts.find((a) => a.id === accountId);
    if (!account) {
      continue;
    }
    accountSections.push({ account, calendars });
  }

  const collapsible = accountSections.length > 1;
  return (
    <div className="calendar-source-list-wrap">
      {accountSections.map(({ account, calendars }) => (
        <OutlineView
          key={account.id}
          title={account.label}
          collapsed={collapsible && !!collapsedAccounts[account.id]}
          onCollapseToggled={collapsible ? () => onCollapseToggled(account.id) : undefined}
        >
          {renderCalendarToggles(calendars, props.disabledCalendars)}
        </OutlineView>
      ))}
    </div>
  );
}
