import moment, { Moment } from 'moment';
import React from 'react';
import {
  Rx,
  DatabaseStore,
  AccountStore,
  Calendar,
  Account,
  Actions,
  localized,
  DestroyModelTask,
  Event,
  SyncbackEventTask,
} from 'mailspring-exports';
import {
  ScrollRegion,
  ResizableRegion,
  KeyCommandsRegion,
  MiniMonthView,
} from 'mailspring-component-kit';
import { WeekView } from './week-view';
import { MonthView } from './month-view';
import { CalendarSourceList } from './calendar-source-list';
import { CalendarDataSource, EventOccurrence, FocusedEventInfo } from './calendar-data-source';
import { CalendarView } from './calendar-constants';
import { setCalendarColors } from './calendar-helpers';
import { Disposable } from 'rx-core';
import { CalendarEventArgs } from './calendar-event-container';
import { CalendarEventPopover } from './calendar-event-popover';
import {
  DragState,
  HitZone,
  DEFAULT_DRAG_CONFIG,
  MONTH_VIEW_DRAG_CONFIG,
} from './calendar-drag-types';
import { createDragState, updateDragState } from './calendar-drag-utils';

const DISABLED_CALENDARS = 'mailspring.disabledCalendars';

const VIEWS = {
  [CalendarView.WEEK]: WeekView,
  [CalendarView.MONTH]: MonthView,
};

export interface EventRendererProps {
  focusedEvent: FocusedEventInfo | null;
  selectedEvents: EventOccurrence[];
  onEventClick: (e: React.MouseEvent<any>, event: EventOccurrence) => void;
  onEventDoubleClick: (event: EventOccurrence) => void;
  onEventFocused: (event: EventOccurrence) => void;
}

export interface MailspringCalendarViewProps extends EventRendererProps {
  dataSource: CalendarDataSource;
  disabledCalendars: string[];
  focusedMoment: Moment;
  onChangeView: (view: CalendarView) => void;
  onChangeFocusedMoment: (moment: Moment) => void;
  onCalendarMouseUp: (args: CalendarEventArgs) => void;
  onCalendarMouseDown: (args: CalendarEventArgs) => void;
  onCalendarMouseMove: (args: CalendarEventArgs) => void;

  // Drag-related props
  dragState: DragState | null;
  onEventDragStart: (
    event: EventOccurrence,
    mouseEvent: React.MouseEvent,
    hitZone: HitZone
  ) => void;
}

/*
 * Mailspring Calendar
 */
interface MailspringCalendarProps {}

interface MailspringCalendarState {
  view: CalendarView;
  selectedEvents: EventOccurrence[];
  focusedEvent: FocusedEventInfo | null;
  accounts?: Account[];
  calendars: Calendar[];
  focusedMoment: Moment;
  disabledCalendars: string[];
  dragState: DragState | null;
}

export class MailspringCalendar extends React.Component<
  MailspringCalendarProps,
  MailspringCalendarState
> {
  static displayName = 'MailspringCalendar';

  static WeekView = WeekView;

  static containerStyles = {
    height: '100%',
  };

  _disposable?: Disposable;
  _unlisten?: () => void;
  _dataSource = new CalendarDataSource();

  constructor(props) {
    super(props);
    this.state = {
      calendars: [],
      focusedEvent: null,
      selectedEvents: [],
      view: CalendarView.WEEK,
      focusedMoment: moment(),
      disabledCalendars: AppEnv.config.get(DISABLED_CALENDARS) || [],
      dragState: null,
    };
  }

  componentWillMount() {
    this._disposable = this._subscribeToCalendars();
    this._unlisten = Actions.focusCalendarEvent.listen(this._focusEvent);
  }

  componentWillUnmount() {
    this._disposable.dispose();
    if (this._unlisten) {
      this._unlisten();
    }
  }

  _subscribeToCalendars() {
    const calQuery = DatabaseStore.findAll<Calendar>(Calendar);
    const calQueryObs = Rx.Observable.fromQuery(calQuery);
    const accQueryObs = Rx.Observable.fromStore(AccountStore);
    const configObs = Rx.Observable.fromConfig<string[] | undefined>(DISABLED_CALENDARS);

    return Rx.Observable.combineLatest(calQueryObs, accQueryObs, configObs).subscribe(
      ([calendars, accountStore, disabledCalendars]) => {
        // Update the color cache with synced calendar colors from CalDAV
        setCalendarColors(calendars);

        this.setState({
          calendars: calendars,
          accounts: accountStore.accounts(),
          disabledCalendars: disabledCalendars || [],
        });
      }
    );
  }

  onChangeView = (view: CalendarView) => {
    this.setState({ view });
  };

  onChangeFocusedMoment = (focusedMoment: Moment) => {
    this.setState({ focusedMoment, focusedEvent: null });
  };

  _focusEvent = (event: FocusedEventInfo) => {
    this.setState({ focusedMoment: moment(event.start * 1000), focusedEvent: event });
  };

  _openEventPopover(eventModel: EventOccurrence) {
    const eventEl = document.getElementById(eventModel.id);
    if (!eventEl) {
      return;
    }
    Actions.openPopover(<CalendarEventPopover event={eventModel} />, {
      originRect: eventEl.getBoundingClientRect(),
      direction: 'right',
      fallbackDirection: 'left',
    });
  }

  _onEventClick = (e: React.MouseEvent, event: EventOccurrence) => {
    let next = [...this.state.selectedEvents];

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
      focusedEvent: null,
    });
  };

  _onEventDoubleClick = (occurrence: EventOccurrence) => {
    this._openEventPopover(occurrence);
  };

  _onEventFocused = (occurrence: EventOccurrence) => {
    this._openEventPopover(occurrence);
  };

  _onDeleteSelectedEvents = () => {
    if (this.state.selectedEvents.length === 0) {
      return;
    }
    const response = require('@electron/remote').dialog.showMessageBoxSync({
      type: 'warning',
      buttons: [localized('Delete'), localized('Cancel')],
      message: localized('Delete or decline these events?'),
      detail: localized(
        `Are you sure you want to delete or decline invitations for the selected event(s)?`
      ),
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

  /**
   * Get the drag configuration based on the current view
   */
  _getDragConfig() {
    return this.state.view === CalendarView.MONTH ? MONTH_VIEW_DRAG_CONFIG : DEFAULT_DRAG_CONFIG;
  }

  /**
   * Handle drag start from an event
   */
  _onEventDragStart = (event: EventOccurrence, mouseEvent: React.MouseEvent, hitZone: HitZone) => {
    const config = this._getDragConfig();

    // Get time from mouse position (approximation - views will provide accurate time)
    const mouseTime = event.start;

    const dragState = createDragState(
      event,
      hitZone,
      mouseTime,
      mouseEvent.clientX,
      mouseEvent.clientY,
      config
    );

    this.setState({ dragState });
  };

  /**
   * Handle mouse move during drag
   */
  _onCalendarMouseMove = (args: CalendarEventArgs) => {
    if (!this.state.dragState) {
      return;
    }

    const config = this._getDragConfig();
    const mouseTime = typeof args.time === 'number' ? args.time : args.time.unix();

    const newDragState = updateDragState(this.state.dragState, mouseTime, args.x, args.y, config);

    // Only update state if something changed
    if (newDragState !== this.state.dragState) {
      this.setState({ dragState: newDragState });
    }
  };

  /**
   * Handle mouse up to complete drag
   */
  _onCalendarMouseUp = (args: CalendarEventArgs) => {
    if (!this.state.dragState) {
      return;
    }

    const { dragState } = this.state;

    // Check if we actually dragged (threshold exceeded)
    if (!dragState.isDragging) {
      // Didn't drag far enough, treat as a click
      this.setState({ dragState: null });
      return;
    }

    // Check if times actually changed
    if (
      dragState.previewStart === dragState.originalStart &&
      dragState.previewEnd === dragState.originalEnd
    ) {
      // No change, just clear state
      this.setState({ dragState: null });
      return;
    }

    // Persist the change
    this._persistDragChange(dragState);
  };

  /**
   * Handle mouse down on calendar (for cancellation via escape or starting new drag)
   */
  _onCalendarMouseDown = (args: CalendarEventArgs) => {
    // If there's an active drag, this shouldn't happen (mouseUp should have cleared it)
    // But just in case, clear it
    if (this.state.dragState && !args.mouseIsDown) {
      this.setState({ dragState: null });
    }
  };

  /**
   * Persist the drag change to the database
   */
  async _persistDragChange(dragState: DragState) {
    // Clear the drag state immediately for responsive UI
    this.setState({ dragState: null });

    try {
      // Get the actual Event model from the database
      // The occurrence ID format is `${eventId}-e${idx}`, so we need to extract the event ID
      const eventId = dragState.event.id.replace(/-e\d+$/, '');
      const event = await DatabaseStore.find<Event>(Event, eventId);

      if (!event) {
        console.error('Could not find event to update:', eventId);
        return;
      }

      // Update the event times
      event.recurrenceStart = dragState.previewStart;
      event.recurrenceEnd = dragState.previewEnd;

      // Queue the syncback task
      const task = SyncbackEventTask.forUpdating({ event });
      Actions.queueTask(task);
    } catch (error) {
      console.error('Failed to persist drag change:', error);
    }
  }

  render() {
    const CurrentView = VIEWS[this.state.view];

    return (
      <KeyCommandsRegion
        className="mailspring-calendar"
        localHandlers={{
          'core:remove-from-view': this._onDeleteSelectedEvents,
        }}
      >
        <ResizableRegion
          className="calendar-source-list"
          initialWidth={200}
          minWidth={200}
          maxWidth={300}
          handle={ResizableRegion.Handle.Right}
          style={{ flexDirection: 'column' }}
        >
          <ScrollRegion style={{ flex: 1 }}>
            <CalendarSourceList
              accounts={this.state.accounts}
              calendars={this.state.calendars}
              disabledCalendars={this.state.disabledCalendars}
            />
          </ScrollRegion>
          <div style={{ width: '100%' }}>
            <MiniMonthView value={this.state.focusedMoment} onChange={this.onChangeFocusedMoment} />
          </div>
        </ResizableRegion>
        <CurrentView
          dataSource={this._dataSource}
          focusedMoment={this.state.focusedMoment}
          focusedEvent={this.state.focusedEvent}
          selectedEvents={this.state.selectedEvents}
          disabledCalendars={this.state.disabledCalendars}
          onChangeView={this.onChangeView}
          onChangeFocusedMoment={this.onChangeFocusedMoment}
          onCalendarMouseUp={this._onCalendarMouseUp}
          onCalendarMouseDown={this._onCalendarMouseDown}
          onCalendarMouseMove={this._onCalendarMouseMove}
          onEventClick={this._onEventClick}
          onEventDoubleClick={this._onEventDoubleClick}
          onEventFocused={this._onEventFocused}
          dragState={this.state.dragState}
          onEventDragStart={this._onEventDragStart}
        />
      </KeyCommandsRegion>
    );
  }
}
