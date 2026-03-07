import React from 'react';
import { Actions, Calendar, DatabaseStore, DateUtils, localized } from 'mailspring-exports';
import { Moment } from 'moment';
import {
  getEditableCalendars,
  showNoEditableCalendarsError,
  createCalendarEvent,
} from './core/calendar-helpers';

interface QuickEventPopoverState {
  start: Moment | null;
  end: Moment | null;
  leftoverText: string | null;
}

export class QuickEventPopover extends React.Component<
  Record<string, unknown>,
  QuickEventPopoverState
> {
  constructor(props) {
    super(props);
    this.state = {
      start: null,
      end: null,
      leftoverText: null,
    };
  }

  onInputKeyDown = event => {
    const {
      key,
      target: { value },
    } = event;
    if (value.length > 0 && ['Enter', 'Return'].includes(key)) {
      // This prevents onInputChange from being fired
      event.stopPropagation();
      this.createEvent(DateUtils.parseDateString(value));
      Actions.closePopover();
    }
  };

  onInputChange = event => {
    this.setState(DateUtils.parseDateString(event.target.value));
  };

  createEvent = async ({
    leftoverText,
    start,
    end,
  }: {
    leftoverText: string;
    start: Moment;
    end: Moment;
  }) => {
    const allCalendars = await DatabaseStore.findAll<Calendar>(Calendar);
    const disabledCalendars: string[] = AppEnv.config.get('mailspring.disabledCalendars') || [];
    const editableCals = getEditableCalendars(allCalendars, disabledCalendars);
    if (editableCals.length === 0) {
      showNoEditableCalendarsError();
      return;
    }

    await createCalendarEvent({
      summary: leftoverText,
      start: start.toDate(),
      end: end.toDate(),
      isAllDay: false,
      calendarId: editableCals[0].id,
      accountId: editableCals[0].accountId,
    });
  };

  render() {
    let dateInterpretation;
    if (this.state.start) {
      dateInterpretation = (
        <span className="date-interpretation">
          Title: {this.state.leftoverText} <br />
          Start: {DateUtils.format(this.state.start, DateUtils.DATE_FORMAT_SHORT)} <br />
          End: {DateUtils.format(this.state.end, DateUtils.DATE_FORMAT_SHORT)}
        </span>
      );
    }

    return (
      <div className="quick-event-popover nylas-date-input">
        <input
          tabIndex={0}
          type="text"
          placeholder={localized("Coffee next Monday at 9AM'")}
          onKeyDown={this.onInputKeyDown}
          onChange={this.onInputChange}
        />
        {dateInterpretation}
      </div>
    );
  }
}
