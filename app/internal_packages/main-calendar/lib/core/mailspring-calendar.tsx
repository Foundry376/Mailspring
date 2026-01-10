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
  UndoRedoStore,
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
import {
  createDragState,
  updateDragState,
  parseEventIdFromOccurrence,
  snapAllDayTimes,
} from './calendar-drag-utils';

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
    // Week view: up/down changes time, left/right changes day
    // Month view: left/right changes day
    const isWeekView = this.state.view === CalendarView.WEEK;
    let timeDelta = 0;

    if (isWeekView) {
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
   * Apply a keyboard-initiated event change
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

      // Store original values for undo
      const originalStart = event.recurrenceStart;
      const originalEnd = event.recurrenceEnd;

      // Calculate new times
      let newStart: number;
      let newEnd: number;

      if (isResize) {
        // Shift+Arrow: resize the event (change end time only)
        newStart = originalStart;
        newEnd = Math.max(originalEnd + timeDelta, originalStart + 900); // Min 15 min duration
      } else {
        // Arrow: move the event (change both start and end)
        newStart = originalStart + timeDelta;
        newEnd = originalEnd + timeDelta;
      }

      // Update and persist
      event.recurrenceStart = newStart;
      event.recurrenceEnd = newEnd;

      const task = SyncbackEventTask.forUpdating({ event });
      Actions.queueTask(task);

      // Register undo action
      this._registerUndoAction(event, originalStart, originalEnd, newStart, newEnd);
    } catch (error) {
      console.error('Failed to apply keyboard event change:', error);
    }
  }

  /**
   * Register an undo action for an event time change
   */
  _registerUndoAction(
    event: Event,
    originalStart: number,
    originalEnd: number,
    newStart: number,
    newEnd: number
  ) {
    const undoBlock = {
      description: localized('Move event'),
      do: () => {
        // No-op, already done
      },
      undo: async () => {
        const ev = await DatabaseStore.find<Event>(Event, event.id);
        if (ev) {
          ev.recurrenceStart = originalStart;
          ev.recurrenceEnd = originalEnd;
          const task = SyncbackEventTask.forUpdating({ event: ev });
          Actions.queueTask(task);
        }
      },
      redo: async () => {
        const ev = await DatabaseStore.find<Event>(Event, event.id);
        if (ev) {
          ev.recurrenceStart = newStart;
          ev.recurrenceEnd = newEnd;
          const task = SyncbackEventTask.forUpdating({ event: ev });
          Actions.queueTask(task);
        }
      },
    };

    // Manually push to undo stack since SyncbackEventTask doesn't support undo natively
    (UndoRedoStore as any)._onQueueBlock(undoBlock);
  }

  /**
   * Persist the drag change to the database
   */
  async _persistDragChange(dragState: DragState) {
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
      const calendar = this.state.calendars.find(c => c.id === event.calendarId);
      if (calendar?.readOnly) {
        console.warn('Cannot modify event in read-only calendar');
        return;
      }

      // Store original values for undo
      const originalStart = event.recurrenceStart;
      const originalEnd = event.recurrenceEnd;

      // Handle all-day events - snap times to day boundaries
      let newStart = dragState.previewStart;
      let newEnd = dragState.previewEnd;

      if (dragState.event.isAllDay) {
        const snapped = snapAllDayTimes(newStart, newEnd);
        newStart = snapped.start;
        newEnd = snapped.end;
      }

      // Update the event times
      event.recurrenceStart = newStart;
      event.recurrenceEnd = newEnd;

      // Queue the syncback task
      const task = SyncbackEventTask.forUpdating({ event });
      Actions.queueTask(task);

      // Register undo action
      this._registerUndoAction(event, originalStart, originalEnd, newStart, newEnd);
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
