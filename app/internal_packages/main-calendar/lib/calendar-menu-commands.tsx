import React from 'react';
import moment from 'moment';
import { BindGlobalCommands } from 'mailspring-component-kit';
import { PopoverStore } from 'mailspring-exports';
import { CalendarView } from './core/calendar-constants';

interface CalendarMenuCommandsProps {
  onChangeView: (view: CalendarView) => void;
  onChangeFocusedMoment: (m: moment.Moment) => void;
  onNavigateNext: () => void;
  onNavigatePrevious: () => void;
  onDeleteEvent: () => void;
  onRefreshCalendars: () => void;
  hasSelectedEvents: boolean;
  view: CalendarView;
}

export class CalendarMenuCommands extends React.Component<CalendarMenuCommandsProps> {
  static displayName = 'CalendarMenuCommands';

  render() {
    const commands: { [command: string]: () => void } = {
      'calendar:view-day': () => this.props.onChangeView(CalendarView.DAY),
      'calendar:view-week': () => this.props.onChangeView(CalendarView.WEEK),
      'calendar:view-month': () => this.props.onChangeView(CalendarView.MONTH),
      'calendar:go-to-today': () => this.props.onChangeFocusedMoment(moment()),
      'calendar:navigate-next': this.props.onNavigateNext,
      'calendar:navigate-previous': this.props.onNavigatePrevious,
      'calendar:refresh-calendars': this.props.onRefreshCalendars,
    };

    if (this.props.hasSelectedEvents) {
      commands['core:delete-item'] = this.props.onDeleteEvent;
    } else {
      // With nothing selected, the keys that move an event step through time instead.
      commands['calendar:move-event-left'] = () => {
        if (!PopoverStore.isOpen) this.props.onNavigatePrevious();
      };
      commands['calendar:move-event-right'] = () => {
        if (!PopoverStore.isOpen) this.props.onNavigateNext();
      };
      // Month view steps vertically; Day and Week leave up/down to scroll the hours.
      if (this.props.view === CalendarView.MONTH) {
        commands['calendar:move-event-up'] = () => {
          if (!PopoverStore.isOpen) this.props.onNavigatePrevious();
        };
        commands['calendar:move-event-down'] = () => {
          if (!PopoverStore.isOpen) this.props.onNavigateNext();
        };
      }
    }

    // No `key` here on purpose: this wraps the whole calendar view, so a key that changes
    // with the selection makes React rebuild the entire grid on every click.
    // BindGlobalCommands re-registers when the set of command names changes.
    return <BindGlobalCommands commands={commands}>{this.props.children}</BindGlobalCommands>;
  }
}
