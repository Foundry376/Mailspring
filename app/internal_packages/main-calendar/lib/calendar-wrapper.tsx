import { Actions, DestroyModelTask, Event } from 'mailspring-exports';
import React from 'react';
import { remote } from 'electron';

import { KeyCommandsRegion } from 'mailspring-component-kit';
import CalendarDataSource from './core/calendar-data-source';
import CalendarEventPopover from './core/calendar-event-popover';
import NylasCalendar from './core/nylas-calendar';

export default class CalendarWrapper extends React.Component<{}, { selectedEvents: Event[] }> {
  static displayName = 'CalendarWrapper';
  static containerRequired = false;

  _dataSource = new CalendarDataSource();

  constructor(props) {
    super(props);
    this.state = { selectedEvents: [] };
  }

  _openEventPopover(eventModel: Event) {
    const eventEl = document.getElementById(eventModel.id);
    if (!eventEl) {
      return;
    }
    const eventRect = eventEl.getBoundingClientRect();

    Actions.openPopover(<CalendarEventPopover event={eventModel} />, {
      originRect: eventRect,
      direction: 'right',
      fallbackDirection: 'left',
    });
  }

  _onEventClick = (e: React.MouseEvent, event: Event) => {
    let next = [].concat(this.state.selectedEvents);

    if (e.shiftKey || e.metaKey) {
      const idx = next.findIndex(({ id }) => event.id === id);
      if (idx === -1) {
        next.push(event);
      } else {
        next.splice(idx, 1);
      }
    } else {
      next = [event];
    }

    this.setState({
      selectedEvents: next,
    });
  };

  _onEventDoubleClick = (eventModel: Event) => {
    this._openEventPopover(eventModel);
  };

  _onEventFocused = (eventModel: Event) => {
    this._openEventPopover(eventModel);
  };

  _onDeleteSelectedEvents = () => {
    if (this.state.selectedEvents.length === 0) {
      return;
    }
    const response = remote.dialog.showMessageBox(remote.getCurrentWindow(), {
      type: 'warning',
      buttons: ['Delete', 'Cancel'],
      message: 'Delete or decline these events?',
      detail: `Are you sure you want to delete or decline invitations for the selected event(s)?`,
    });
    if (response === 0) {
      // response is button array index
      for (const event of this.state.selectedEvents) {
        const task = new DestroyModelTask({
          modelId: event.id,
          modelName: event.constructor.name,
          endpoint: '/events',
          accountId: event.accountId,
        });
        Actions.queueTask(task);
      }
    }
  };

  render() {
    return (
      <KeyCommandsRegion
        className="main-calendar"
        localHandlers={{
          'core:remove-from-view': this._onDeleteSelectedEvents,
        }}
      >
        <NylasCalendar
          dataSource={this._dataSource}
          onEventClick={this._onEventClick}
          onEventDoubleClick={this._onEventDoubleClick}
          onEventFocused={this._onEventFocused}
          selectedEvents={this.state.selectedEvents}
        />
      </KeyCommandsRegion>
    );
  }
}
