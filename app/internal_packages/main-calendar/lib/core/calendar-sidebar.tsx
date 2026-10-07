import React from 'react';
import { Moment } from 'moment';
import { Disposable } from 'rx-core';
import { Rx, DatabaseStore, AccountStore, Calendar, Account, DOMUtils } from 'mailspring-exports';
import { ScrollRegion, MiniMonthView } from 'mailspring-component-kit';
import { CalendarSourceList } from './calendar-source-list';
import { setCalendarColors } from './calendar-helpers';
import FocusedMomentStore from './focused-moment-store';

const DISABLED_CALENDARS = 'mailspring.disabledCalendars';

interface CalendarSidebarState {
  accounts: Account[];
  calendars: Calendar[];
  disabledCalendars: string[];
  focusedMoment: Moment;
}

/** The Calendar sheet's first column: the calendar list and the mini month. */
export class CalendarSidebar extends React.Component<
  Record<string, unknown>,
  CalendarSidebarState
> {
  static displayName = 'CalendarSidebar';

  // Matches the account sidebar, whose column width this one shares.
  static containerStyles = {
    minWidth: DOMUtils.getWorkspaceCssNumberProperty('account-sidebar-min-width', 165),
    maxWidth: DOMUtils.getWorkspaceCssNumberProperty('account-sidebar-max-width', 250),
  };

  _disposable?: Disposable;
  _unlisten?: () => void;

  state: CalendarSidebarState = {
    accounts: [],
    calendars: [],
    disabledCalendars: AppEnv.config.get(DISABLED_CALENDARS) || [],
    focusedMoment: FocusedMomentStore.focusedMoment(),
  };

  componentDidMount() {
    this._unlisten = FocusedMomentStore.listen(() =>
      this.setState({ focusedMoment: FocusedMomentStore.focusedMoment() })
    );
    this._disposable = Rx.Observable.combineLatest(
      Rx.Observable.fromQuery(DatabaseStore.findAll<Calendar>(Calendar)),
      Rx.Observable.fromStore(AccountStore),
      Rx.Observable.fromConfig<string[] | undefined>(DISABLED_CALENDARS)
    ).subscribe(([calendars, accountStore, disabledCalendars]) => {
      // The list's swatches read the synced colours, which the grid may not have cached yet.
      setCalendarColors(calendars);
      this.setState({
        calendars,
        accounts: accountStore.accounts(),
        disabledCalendars: disabledCalendars || [],
      });
    });
  }

  componentWillUnmount() {
    this._unlisten?.();
    this._disposable?.dispose();
  }

  render() {
    return (
      <div className="calendar-source-list">
        <ScrollRegion style={{ flex: 1 }}>
          <CalendarSourceList
            accounts={this.state.accounts}
            calendars={this.state.calendars}
            disabledCalendars={this.state.disabledCalendars}
          />
        </ScrollRegion>
        <div style={{ width: '100%' }}>
          <MiniMonthView
            value={this.state.focusedMoment}
            onChange={(m) => FocusedMomentStore.setFocusedMoment(m)}
          />
        </div>
      </div>
    );
  }
}
