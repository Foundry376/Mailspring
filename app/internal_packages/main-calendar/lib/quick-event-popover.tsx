import React from 'react';
import {
  Actions,
  Calendar,
  DatabaseStore,
  DateUtils,
  Event,
  ICSEventHelpers,
  localized,
  SyncbackEventTask,
  TaskQueue,
} from 'mailspring-exports';
import { Moment } from 'moment';

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

  onInputKeyDown = (event) => {
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

  onInputChange = (event) => {
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
    const editableCals = allCalendars.filter(
      (c) => !c.readOnly && !disabledCalendars.includes(c.id)
    );
    if (editableCals.length === 0) {
      AppEnv.showErrorDialog(
        localized(
          "This account has no editable calendars. We can't create an event for you. Please make sure you have an editable calendar with your account provider."
        )
      );
      return;
    }

    // Generate ICS data for the new event
    const icsuid = ICSEventHelpers.generateUID();
    const ics = ICSEventHelpers.createICSString({
      uid: icsuid,
      summary: leftoverText,
      start: start.toDate(),
      end: end.toDate(),
      isAllDay: false,
    });

    const event = new Event({
      calendarId: editableCals[0].id,
      accountId: editableCals[0].accountId,
      ics: ics,
      icsuid: icsuid,
      recurrenceStart: start.unix(),
      recurrenceEnd: end.unix(),
    });
    event.title = leftoverText;

    // Create and queue the task to save the event
    const task = SyncbackEventTask.forCreating({
      event,
      calendarId: editableCals[0].id,
      accountId: editableCals[0].accountId,
    });
    Actions.queueTask(task);

    // Wait for the task to complete (synced to server)
    await TaskQueue.waitForPerformRemote(task);

    // Focus the calendar on the newly created event
    Actions.focusCalendarEvent({ id: event.id, start: event.recurrenceStart });
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
