import React from 'react';
import moment from 'moment';
import { BindGlobalCommands } from 'mailspring-component-kit';
import { CalendarView } from './core/calendar-constants';

interface CalendarMenuCommandsProps {
  onChangeView: (view: CalendarView) => void;
  onChangeFocusedMoment: (m: moment.Moment) => void;
  onNavigateNext: () => void;
  onNavigatePrevious: () => void;
  onDeleteEvent: () => void;
  onRefreshCalendars: () => void;
  hasSelectedEvents: boolean;
}

export class CalendarMenuCommands extends React.Component<CalendarMenuCommandsProps> {
  static displayName = 'CalendarMenuCommands';

  render() {
    const commands: { [command: string]: () => void } = {
      'calendar:view-day': () => this.props.onChangeView(CalendarView.DAY),
      'calendar:view-week': () => this.props.onChangeView(CalendarView.WEEK),
      'calendar:view-month': () => this.props.onChangeView(CalendarView.MONTH),
      'calendar:view-agenda': () => this.props.onChangeView(CalendarView.AGENDA),
      'calendar:go-to-today': () => this.props.onChangeFocusedMoment(moment()),
      'calendar:navigate-next': this.props.onNavigateNext,
      'calendar:navigate-previous': this.props.onNavigatePrevious,
      'calendar:refresh-calendars': this.props.onRefreshCalendars,
    };

    if (this.props.hasSelectedEvents) {
      commands['core:delete-item'] = this.props.onDeleteEvent;
    }

    const key = `calendar-menu-${this.props.hasSelectedEvents}`;

    return (
      <BindGlobalCommands key={key} commands={commands}>
        {this.props.children}
      </BindGlobalCommands>
    );
  }
}
