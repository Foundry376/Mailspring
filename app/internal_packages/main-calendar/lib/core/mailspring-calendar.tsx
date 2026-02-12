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
  ICSEventHelpers,
} from 'mailspring-exports';
import {
  ScrollRegion,
  ResizableRegion,
  KeyCommandsRegion,
  MiniMonthView,
} from 'mailspring-component-kit';
import { DayView } from './day-view';
import { WeekView } from './week-view';
import { MonthView } from './month-view';
import { AgendaView } from './agenda-view';
import { CalendarSourceList } from './calendar-source-list';
import { CalendarDataSource, EventOccurrence, FocusedEventInfo } from './calendar-data-source';
import { CalendarView } from './calendar-constants';
import { setCalendarColors, getColorCacheVersion } from './calendar-helpers';
import { Disposable } from 'rx-core';
import { CalendarEventArgs } from './calendar-event-container';
import { CalendarEventPopover } from './calendar-event-popover';
import {
  DragState,
  HitZone,
  DEFAULT_DRAG_CONFIG,
  MONTH_VIEW_DRAG_CONFIG,
} from './calendar-drag-types';
import {
  createDragState,
  updateDragState,
  parseEventIdFromOccurrence,
  snapAllDayTimes,
} from './calendar-drag-utils';
import { showRecurringEventDialog } from './recurring-event-dialog';
import { modifyEventWithRecurringSupport, EventTimeChangeOptions } from './recurring-event-actions';

const DISABLED_CALENDARS = 'mailspring.disabledCalendars';
const CALENDAR_VIEW = 'mailspring.calendarView';

const VIEWS = {
  [CalendarView.DAY]: DayView,
  [CalendarView.WEEK]: WeekView,
  [CalendarView.MONTH]: MonthView,
  [CalendarView.AGENDA]: AgendaView,
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
    hitZone: HitZone,
    mouseTime: number
  ) => void;

  /** Set of calendar IDs that are read-only (events in these calendars cannot be dragged) */
  readOnlyCalendarIds: Set<string>;
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

  static DayView = DayView;
  static WeekView = WeekView;

  static containerStyles = {
    height: '100%',
  };

  _disposable?: Disposable;
  _unlisten?: () => void;
  _dataSource = new CalendarDataSource();

  constructor(props: MailspringCalendarProps) {
    super(props);
    this.state = {
      calendars: [],
      focusedEvent: null,
      selectedEvents: [],
      view: AppEnv.config.get(CALENDAR_VIEW) || CalendarView.WEEK,
      focusedMoment: moment(),
      disabledCalendars: AppEnv.config.get(DISABLED_CALENDARS) || [],
      dragState: null,
    };
  }

  componentDidMount() {
    this._disposable = this._subscribeToCalendars();
    this._unlisten = Actions.focusCalendarEvent.listen(this._focusEvent);
  }

  componentWillUnmount() {
    // The component is unmounting, dispose subscriptions
    this._disposable.dispose();
    if (this._unlisten) {
      this._unlisten();
    }
  }

  /**
   * Get the set of read-only calendar IDs
   */
  _getReadOnlyCalendarIds(): Set<string> {
    const readOnlyIds = new Set<string>();
    for (const calendar of this.state.calendars) {
      if (calendar.readOnly) {
        readOnlyIds.add(calendar.id);
      }
    }
    return readOnlyIds;
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
    // Clear any active drag state when changing views
    this.setState({ view, dragState: null });
    AppEnv.config.set(CALENDAR_VIEW, view);
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

    // In day view, events span most of the horizontal width, so opening
    // the popover to the right/left causes horizontal scrolling. Use
    // down/up positioning instead for day view.
    const isDayView = this.state.view === CalendarView.DAY;
    const direction = isDayView ? 'down' : 'right';
    const fallbackDirection = isDayView ? 'up' : 'left';

    Actions.openPopover(<CalendarEventPopover event={eventModel} />, {
      originRect: eventEl.getBoundingClientRect(),
      direction,
      fallbackDirection,
      closeOnAppBlur: false,
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

  _onDeleteSelectedEvents = async () => {
    if (this.state.selectedEvents.length === 0) {
      return;
    }

    // Show initial confirmation dialog
    const response = require('@electron/remote').dialog.showMessageBoxSync({
      type: 'warning',
      buttons: [localized('Delete'), localized('Cancel')],
      message: localized('Delete or decline these events?'),
      detail: localized(
        `Are you sure you want to delete or decline invitations for the selected event(s)?`
      ),
    });

    if (response !== 0) {
      return; // User cancelled
    }

    // Process each selected event
    for (const occurrence of this.state.selectedEvents) {
      await this._deleteEvent(occurrence);
    }
  };

  /**
   * Delete a single event occurrence, handling recurring events appropriately
   */
  async _deleteEvent(occurrence: EventOccurrence) {
    try {
      // Parse the event ID from the occurrence ID (handles recurring instance IDs)
      const eventId = parseEventIdFromOccurrence(occurrence.id);

      // Fetch the full event from database to get ICS data
      const event = await DatabaseStore.find<Event>(Event, eventId);
      if (!event) {
        console.error('Could not find event to delete:', eventId);
        return;
      }

      // Check if this is a recurring event (and not already an exception)
      const isRecurring = ICSEventHelpers.isRecurringEvent(event.ics);

      if (isRecurring && !event.isRecurrenceException()) {
        // Show recurring event dialog
        const choice = await showRecurringEventDialog('delete', occurrence.title);

        if (choice === 'cancel') {
          return; // User cancelled this deletion
        }

        if (choice === 'this-occurrence') {
          // Delete only this occurrence by adding EXDATE to master
          await this._deleteOccurrence(event, occurrence);
        } else {
          // Delete entire series
          await this._deleteEntireEvent(event);
        }
      } else {
        // Non-recurring event or already an exception - delete normally
        await this._deleteEntireEvent(event);
      }
    } catch (error) {
      console.error('Failed to delete event:', error);
      AppEnv.showErrorDialog({
        title: localized('Delete Failed'),
        message: localized('Failed to delete the event. Please try again.'),
      });
    }
  }

  /**
   * Delete a single occurrence of a recurring event by adding EXDATE to master.
   * Supports undo - restores the original ICS without the EXDATE.
   */
  async _deleteOccurrence(masterEvent: Event, occurrence: EventOccurrence) {
    // Capture original state for undo BEFORE modifying
    const undoData = {
      ics: masterEvent.ics,
      recurrenceStart: masterEvent.recurrenceStart,
      recurrenceEnd: masterEvent.recurrenceEnd,
    };

    // Add EXDATE to exclude this occurrence
    masterEvent.ics = ICSEventHelpers.addExclusionDate(
      masterEvent.ics,
      occurrence.start,
      occurrence.isAllDay
    );

    // Queue syncback with undo support
    const task = SyncbackEventTask.forUpdating({
      event: masterEvent,
      undoData,
      description: localized('Delete occurrence'),
    });
    Actions.queueTask(task);
  }

  /**
   * Delete an entire event (or series)
   */
  async _deleteEntireEvent(event: Event) {
    const task = new DestroyModelTask({
      modelId: event.id,
      modelName: event.constructor.name,
      endpoint: '/events',
      accountId: event.accountId,
    });
    Actions.queueTask(task);
  }

  /**
   * Get the drag configuration based on the current view
   */
  _getDragConfig() {
    return this.state.view === CalendarView.MONTH ? MONTH_VIEW_DRAG_CONFIG : DEFAULT_DRAG_CONFIG;
  }

  /**
   * Handle drag start from an event
   */
  _onEventDragStart = (
    event: EventOccurrence,
    mouseEvent: React.MouseEvent,
    hitZone: HitZone,
    mouseTime: number
  ) => {
    const config = this._getDragConfig();

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

    // args.time can be null if mouse is not over a valid calendar area
    if (args.time === null || args.x === null || args.y === null) {
      return;
    }

    const config = this._getDragConfig();

    const newDragState = updateDragState(
      this.state.dragState,
      args.time,
      args.x,
      args.y,
      args.containerType,
      config
    );

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
   * Handle keyboard shortcuts for moving/resizing events
   */
  _onMoveSelectedEvent = (direction: 'up' | 'down' | 'left' | 'right', isResize: boolean) => {
    if (this.state.selectedEvents.length === 0) {
      return;
    }

    const occurrence = this.state.selectedEvents[0];

    // Check if event is in a read-only calendar
    const readOnlyCalendarIds = this._getReadOnlyCalendarIds();
    if (readOnlyCalendarIds.has(occurrence.calendarId)) {
      return;
    }

    // Calculate time delta based on view and direction
    // Day/Week view: up/down changes time, left/right changes day
    // Month view: left/right changes day
    const isDayOrWeekView =
      this.state.view === CalendarView.DAY || this.state.view === CalendarView.WEEK;
    let timeDelta = 0;

    if (isDayOrWeekView) {
      if (direction === 'up') {
        timeDelta = -900; // 15 minutes earlier
      } else if (direction === 'down') {
        timeDelta = 900; // 15 minutes later
      } else if (direction === 'left') {
        timeDelta = -86400; // 1 day earlier
      } else if (direction === 'right') {
        timeDelta = 86400; // 1 day later
      }
    } else {
      // Month view: left/right changes day
      if (direction === 'left') {
        timeDelta = -86400; // 1 day earlier
      } else if (direction === 'right') {
        timeDelta = 86400; // 1 day later
      }
    }

    if (timeDelta === 0) {
      return;
    }

    // Apply the change
    this._applyKeyboardEventChange(occurrence, timeDelta, isResize);
  };

  /**
   * Apply a keyboard-initiated event change.
   * Handles recurring events by showing the dialog to choose between
   * modifying this occurrence or all occurrences.
   */
  async _applyKeyboardEventChange(
    occurrence: EventOccurrence,
    timeDelta: number,
    isResize: boolean
  ) {
    try {
      const eventId = parseEventIdFromOccurrence(occurrence.id);
      const event = await DatabaseStore.find<Event>(Event, eventId);

      if (!event) {
        console.error('Could not find event to update:', eventId);
        return;
      }

      // Calculate new times
      let newStart: number;
      let newEnd: number;

      if (isResize) {
        // Shift+Arrow: resize the event (change end time only)
        newStart = occurrence.start;
        newEnd = Math.max(occurrence.end + timeDelta, occurrence.start + 900); // Min 15 min
      } else {
        // Arrow: move the event (change both start and end)
        newStart = occurrence.start + timeDelta;
        newEnd = occurrence.end + timeDelta;
      }

      // Use shared utility for recurring event support (shows dialog if needed)
      const options: EventTimeChangeOptions = {
        event,
        originalOccurrenceStart: occurrence.start,
        newStart,
        newEnd,
        isAllDay: occurrence.isAllDay,
        description: isResize ? localized('Resize event') : localized('Move event'),
      };

      await modifyEventWithRecurringSupport(
        options,
        isResize ? 'resize' : 'move',
        occurrence.title
      );
    } catch (error) {
      console.error('Failed to apply keyboard event change:', error);
      AppEnv.showErrorDialog({
        title: localized('Update Failed'),
        message: localized('Failed to update the event. Please try again.'),
      });
    }
  }

  /**
   * Persist the drag change to the database.
   * Undo support is automatically provided by SyncbackEventTask.
   */
  async _persistDragChange(dragState: DragState): Promise<void> {
    // Clear the drag state immediately for responsive UI
    this.setState({ dragState: null });

    try {
      // Parse the event ID from the occurrence ID
      const eventId = parseEventIdFromOccurrence(dragState.event.id);

      const event = await DatabaseStore.find<Event>(Event, eventId);
      if (!event) {
        console.error('Could not find event to update:', eventId);
        return;
      }

      // Check if calendar is read-only (safety check)
      const calendar = this.state.calendars.find((c) => c.id === event.calendarId);
      if (calendar?.readOnly) {
        console.warn('Cannot modify event in read-only calendar');
        return;
      }

      // Handle all-day events - snap times to day boundaries
      let newStart = dragState.previewStart;
      let newEnd = dragState.previewEnd;

      if (dragState.event.isAllDay) {
        const snapped = snapAllDayTimes(newStart, newEnd);
        newStart = snapped.start;
        newEnd = snapped.end;
      }

      // Use shared utility for the modification logic (includes undo support)
      const options: EventTimeChangeOptions = {
        event,
        originalOccurrenceStart: dragState.event.start,
        newStart,
        newEnd,
        isAllDay: dragState.event.isAllDay,
        description:
          dragState.mode === 'move' ? localized('Move event') : localized('Resize event'),
      };

      await modifyEventWithRecurringSupport(
        options,
        dragState.mode === 'move' ? 'move' : 'resize',
        dragState.event.title
      );
    } catch (error) {
      console.error('Failed to persist drag change:', error);
      AppEnv.showErrorDialog({
        title: localized('Update Failed'),
        message: localized('Failed to update the event. Please try again.'),
      });
    }
  }

  render() {
    const CurrentView = VIEWS[this.state.view];

    return (
      <KeyCommandsRegion
        className="mailspring-calendar"
        localHandlers={{
          'core:remove-from-view': this._onDeleteSelectedEvents,
          'calendar:move-event-up': () => this._onMoveSelectedEvent('up', false),
          'calendar:move-event-down': () => this._onMoveSelectedEvent('down', false),
          'calendar:move-event-left': () => this._onMoveSelectedEvent('left', false),
          'calendar:move-event-right': () => this._onMoveSelectedEvent('right', false),
          'calendar:resize-event-up': () => this._onMoveSelectedEvent('up', true),
          'calendar:resize-event-down': () => this._onMoveSelectedEvent('down', true),
          'calendar:resize-event-left': () => this._onMoveSelectedEvent('left', true),
          'calendar:resize-event-right': () => this._onMoveSelectedEvent('right', true),
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
          key={`view-colors-${getColorCacheVersion()}`}
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
          readOnlyCalendarIds={this._getReadOnlyCalendarIds()}
        />
      </KeyCommandsRegion>
    );
  }
}
