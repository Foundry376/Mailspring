import moment, { Moment } from 'moment';
import React from 'react';
import {
  Rx,
  DatabaseStore,
  Calendar,
  Actions,
  localized,
  CalendarDateUtils,
  CalendarUtils,
  Event,
  DatabaseChangeRecord,
  TaskQueue,
  DOMUtils,
  WorkspaceStore,
} from 'mailspring-exports';
import { KeyCommandsRegion, ResizableRegion } from 'mailspring-component-kit';
import { CalendarMenuCommands } from '../calendar-menu-commands';
import { TimeGridView } from './time-grid-view';
import { MonthView } from './month-view';
import { AgendaContainer } from './agenda-container';
import { openQuickEventPopover } from '../quick-event-popover';
import { EventPanel } from './event-panel';
import { ScrollBackArea } from './scroll-back-area';
import FocusedMomentStore from './focused-moment-store';
import CalendarHeaderStore from './calendar-header-store';
import {
  CalendarDataSource,
  EventOccurrence,
  inAllDayRow,
  movedOccurrenceId,
  panelKey,
  currentOccurrence,
  FocusedEventInfo,
  isEventSelected,
  occurrenceStartUnix,
  occurrenceEndUnix,
  occurrenceSlot,
  occurrenceTimes,
} from './calendar-data-source';
import { CalendarEventContextMenu } from './calendar-event-context-menu';
import {
  openProposeNewTimePopover,
  proposeNewEventTime,
  showOrganizerOnlyMoveDialog,
} from './calendar-rsvp';
import { CalendarView, DEFAULT_TIMED_EVENT_DURATION_SECONDS } from './calendar-constants';
import { CalendarEmptyState } from './calendar-empty-state';
import {
  setCalendarColors,
  getColorCacheVersion,
  defaultCalendarForNewEvent,
  showNoEditableCalendarsError,
  showReadOnlyCalendarError,
  invalidateThemeTextColorCache,
  shiftEndWithStart,
  clampEnd,
  newEventOccurrence,
  NewEventDraft,
  queueNewCalendarEvent,
  getEditableCalendars,
  editableFields,
  holdsEdits,
  proposesTime,
} from './calendar-helpers';
import { Disposable } from 'rx-core';
import { CalendarEventArgs } from './calendar-event-container';
import {
  DragState,
  HitZone,
  DEFAULT_DRAG_CONFIG,
  MONTH_VIEW_DRAG_CONFIG,
} from './calendar-drag-types';
import {
  createDragState,
  updateDragState,
  snapAllDayTimes,
  canAttemptMove,
  canMoveEvent,
  CreateDragState,
  createDragRange,
  createNewEventPreview,
  CREATE_DRAG_SNAP_SECONDS,
} from './calendar-drag-utils';
import {
  deleteEvent,
  modifyEventWithRecurringSupport,
  updateEvent,
  ChangeScope,
  EventTimeChangeOptions,
} from './recurring-event-actions';
import {
  UnsentChange,
  isUnsentChangeFor,
  keepsNewEvent,
  newEventOptions,
  showAsWaitsForScope,
  withEdit,
  withTimes,
  withUnsentChange,
} from './unsent-change';
import { showUnsentChangeDialog } from './unsent-change-dialog';

const DISABLED_CALENDARS = 'mailspring.disabledCalendars';
const CALENDAR_VIEW = 'mailspring.calendarView';
const AGENDA_OPEN = 'mailspring.calendarAgendaOpen';
const AGENDA_WIDTH = 'CalendarAgenda';
// Below 200px the longer time ranges ("11:30 AM–12:30 PM 1h 30m") no longer fit whole.
const AGENDA_WIDTHS = { min: 200, initial: 240, max: 300 };

const VISIBLE_DAYS: { [view: string]: 1 | 7 } = {
  [CalendarView.DAY]: 1,
  [CalendarView.WEEK]: 7,
};

export interface EventRendererProps {
  focusedEvent: FocusedEventInfo | null;
  selectedEvents: EventOccurrence[];
  onEventClick: (e: React.MouseEvent<any>, event: EventOccurrence) => void;
  onEventDoubleClick: (event: EventOccurrence) => void;
  onEventContextMenu: (event: EventOccurrence) => void;
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
  onCalendarClick: (args: CalendarEventArgs) => void;
  onCalendarDoubleClick: (args: CalendarEventArgs) => void;
  onCalendarContextMenu: (args: CalendarEventArgs) => void;
  /**
   * Changes whenever a calendar's colour or the theme does, so components that skip equal
   * props repaint; keying the view on it instead would remount the grid, re-centre its scroll
   * and re-run its subscription.
   */
  paintVersion: string;

  // Drag-related props
  dragState: DragState | null;
  /** The new event being drawn on empty grid space, or being filled in by the open editor. */
  newEventPreview: EventOccurrence | null;
  unsentChange: UnsentChange | null;
  onEventDragStart: (
    event: EventOccurrence,
    mouseEvent: React.MouseEvent,
    hitZone: HitZone
  ) => void;

  /** Set of calendar IDs that are read-only (events in these calendars cannot be dragged) */
  readOnlyCalendarIds: Set<string>;

  /** Fail-closed read-only check; prefer this over readOnlyCalendarIds for write decisions */
  isCalendarReadOnly: (calendarId: string) => boolean;

  /** An event just dragged in the grid past a day, kept there until the user moves on from it. */
  heldInGridEventId?: string | null;
}

/** A view an older version saved may no longer exist: 'Agenda' is now a panel. */
function savedView(): CalendarView {
  const saved = AppEnv.config.get(CALENDAR_VIEW);
  return Object.values(CalendarView).includes(saved) ? saved : CalendarView.WEEK;
}

/*
 * Mailspring Calendar
 */
interface MailspringCalendarProps {}

interface MailspringCalendarState {
  view: CalendarView;
  agendaOpen: boolean;
  selectedEvents: EventOccurrence[];
  focusedEvent: FocusedEventInfo | null;
  calendars: Calendar[];
  calendarsLoaded: boolean;
  focusedMoment: Moment;
  disabledCalendars: string[];
  dragState: DragState | null;
  createDrag: CreateDragState | null;
  newEvent: { draft: NewEventDraft; occurrence: EventOccurrence } | null;
  unsentChange: UnsentChange | null;
  readOnlyCalendarIds: Set<string>;
  themeVersion: number;
  heldInGridEventId: string | null;
}

export class MailspringCalendar extends React.Component<
  MailspringCalendarProps,
  MailspringCalendarState
> {
  /** Gives each event made in the panel its own id, so the panel remounts for the next one. */
  _newEventSerial = 0;
  static displayName = 'MailspringCalendar';

  static containerStyles = {
    height: '100%',
  };

  _disposable?: Disposable;
  _themeDisposable?: { dispose(): void };
  _unlisten?: () => void;
  _unlistenNewEvent?: () => void;
  _unlistenDatabase?: () => void;
  _unlistenFocusedMoment?: () => void;
  _removeLeaveGuard?: () => void;
  _dataSource = new CalendarDataSource();
  /**
   * The press that began drawing a new event, held until release. It reaches state only once
   * the pointer travels, because a setState on every press re-renders the grid.
   */
  _pendingCreateDrag: CreateDragState | null = null;
  /** The click that ends a create-drag is the drag's, not a click on the grid. */
  _suppressNextCalendarClick = false;
  /** Selected occurrences moved here but not yet synced back, by the id they will be drawn under. */
  _pendingMoves = new Map<string, { start: number; staleIcs: string }>();
  _timeGrid = React.createRef<TimeGridView>();
  _eventPanel = React.createRef<EventPanel>();

  constructor(props: MailspringCalendarProps) {
    super(props);
    this.state = {
      calendars: [],
      calendarsLoaded: false,
      focusedEvent: null,
      selectedEvents: [],
      view: savedView(),
      agendaOpen: AppEnv.config.get(AGENDA_OPEN) ?? true,
      focusedMoment: FocusedMomentStore.focusedMoment(),
      disabledCalendars: AppEnv.config.get(DISABLED_CALENDARS) || [],
      dragState: null,
      createDrag: null,
      newEvent: null,
      unsentChange: null,
      readOnlyCalendarIds: new Set<string>(),
      themeVersion: 0,
      heldInGridEventId: null,
    };
  }

  componentDidMount() {
    this._disposable = this._subscribeToCalendars();
    this._unlisten = Actions.focusCalendarEvent.listen(this._focusEvent);
    this._unlistenNewEvent = Actions.openNewCalendarEvent.listen(this._onOpenNewCalendarEvent);
    this._unlistenFocusedMoment = FocusedMomentStore.listen(() =>
      this.setState({
        focusedMoment: FocusedMomentStore.focusedMoment(),
        focusedEvent: FocusedMomentStore.focusedEvent(),
      })
    );
    this._unlistenDatabase = DatabaseStore.listen(this._onDatabaseChange);
    // Captured, so it runs before the window's own undo handler on <body>.
    document.addEventListener('core:undo', this._ignoreUndoWhileHeld, true);
    this._removeLeaveGuard = WorkspaceStore.setSectionLeaveGuard(() => this._mayLeave([]));
    AppEnv.onBeforeUnload(this._onBeforeUnload);
    AppEnv.mailsyncBridge.sendSyncCalendarNow();
    this._themeDisposable = AppEnv.themes.onDidChangeActiveThemes(() => {
      invalidateThemeTextColorCache();
      this.setState((s) => ({ themeVersion: s.themeVersion + 1 }));
    });
    this._publishCalendarOptions();
  }

  componentDidUpdate() {
    this._publishCalendarOptions();
  }

  _panelEvent(): EventOccurrence | null {
    const { selectedEvents, newEvent } = this.state;
    if (newEvent) return newEvent.occurrence;
    return selectedEvents.length === 1 ? selectedEvents[0] : null;
  }

  // A bar may draw an unsent change, but the panel compares edits to what's stored.
  _storedOccurrence(occurrence: EventOccurrence) {
    return this.state.selectedEvents.find((s) => s.id === occurrence.id) ?? occurrence;
  }

  // Saved like the toolbar button's toggle, so going back to the agenda leaves the panel open.
  // Moves and deletes change the selection without going through here.
  _select(clicked: EventOccurrence[]) {
    const selectedEvents = clicked.map((o) => this._storedOccurrence(o));
    if (!this._mayLeave(selectedEvents)) return false;
    this._releaseHeldUnless(selectedEvents);
    const opensPanel = selectedEvents.length === 1 && !this.state.agendaOpen;
    this.setState({ selectedEvents, focusedEvent: null, ...(opensPanel && { agendaOpen: true }) });
    if (opensPanel) AppEnv.config.set(AGENDA_OPEN, true);
    return true;
  }

  _onBackToAgenda = () => {
    if (!this._mayLeave([])) return;
    this._releaseHeldUnless([]);
    this.setState({ selectedEvents: [], focusedEvent: null });
  };

  _releaseHeldUnless(selected: EventOccurrence[]) {
    const held = this.state.heldInGridEventId;
    const stillShown = selected.some((o) => CalendarUtils.parseOccurrenceId(o.id).eventId === held);
    if (held && !stillShown) this.setState({ heldInGridEventId: null });
  }

  // Focus moving into the event panel is the user taking up the event they dropped.
  _onRightPanelFocus = (e: React.FocusEvent<HTMLElement>) => {
    if (this.state.heldInGridEventId && (e.target as HTMLElement).closest('.event-panel')) {
      this.setState({ heldInGridEventId: null });
    }
  };

  _onUnsentChange = (unsentChange: UnsentChange | null) => {
    this.setState({ unsentChange });
  };

  /** Holds a move of an event whose edits wait for Send update; false when the move should save. */
  _holdTimes(occurrence: EventOccurrence, times: ReturnType<typeof occurrenceTimes>) {
    const stored = this._storedOccurrence(occurrence);
    const { unsentChange } = this.state;
    // Another event's change was just sent or discarded, though state may not show it yet.
    const change = isUnsentChangeFor(unsentChange, stored) ? unsentChange : null;
    if (!holdsEdits(stored, this._isCalendarReadOnly(stored.calendarId), change)) return false;
    // A proposal keeps the event all-day or timed, so a guest's drag across the rows is dropped.
    if (this._proposes(stored) && times.isAllDay !== stored.isAllDay) return true;
    if (!this._select([stored])) return true;
    if (showAsWaitsForScope(change)) return true;
    this.setState({ unsentChange: withTimes(change, stored, times, occurrenceTimes(stored)) });
    return true;
  }

  // Held edits queue no task, so the last undoable action is an older one the user isn't looking at.
  _ignoreUndoWhileHeld = (e: CustomEvent) => {
    if (this.state.unsentChange && !DOMUtils.isTextInput(e.target)) e.stopPropagation();
  };

  _leavesUnsentChange(next: EventOccurrence[]) {
    const change = this.state.unsentChange;
    if (!change || this._sending?.change === change) return false;
    return !(next.length === 1 && isUnsentChangeFor(change, next[0]));
  }

  /** Saves a field being edited in the panel to its own event, before the panel shows another. */
  _commitPanelEdits(next: EventOccurrence[]) {
    if (this.state.newEvent || panelKey(next) !== panelKey(this.state.selectedEvents)) {
      this._eventPanel.current?.commitEdits();
    }
  }

  _mayLeave(next: EventOccurrence[]) {
    this._commitPanelEdits(next);
    if (this.state.newEvent) return this._leaveNewEvent() !== false;
    if (!this._leavesUnsentChange(next)) return true;
    const choice = showUnsentChangeDialog(this.state.unsentChange, this._unsentChangeEvent());
    if (choice === 'keep-editing') {
      this._eventPanel.current?.returnToField();
      return false;
    }
    if (choice === 'send') this._sendUnsentChange();
    else this.setState({ unsentChange: null });
    return true;
  }

  _unsentChangeEvent() {
    const { unsentChange, selectedEvents } = this.state;
    return selectedEvents.find((o) => isUnsentChangeFor(unsentChange, o));
  }

  // Quitting can't be stopped, and the sync engine is stopped once every callback is ready.
  _onBeforeUnload = (readyToUnload: () => void) => {
    // First, so a field being edited is saved or joins the held change the dialog offers.
    const saved = this._eventPanel.current?.commitEdits();
    let sent = this._sending?.done;
    let created: Promise<void> | undefined;
    if (this.state.newEvent) {
      created = this._leaveNewEvent({ canKeepEditing: false }) || undefined;
    } else if (!sent && this._leavesUnsentChange([])) {
      const choice = showUnsentChangeDialog(this.state.unsentChange, this._unsentChangeEvent(), {
        canKeepEditing: false,
      });
      if (choice === 'discard') {
        this.setState({ unsentChange: null });
      } else {
        sent = this._sendUnsentChange(choice === 'send' ? undefined : (choice as ChangeScope));
      }
    }
    if (!saved && !sent && !created) return true;
    Promise.race([
      Promise.all([saved, sent, created]),
      new Promise((r) => setTimeout(r, 700)),
    ]).then(readyToUnload, readyToUnload);
    return false;
  };

  _sending: { change: UnsentChange; done: Promise<void> } | null = null;

  _sendUnsentChange = (scope: ChangeScope = 'this-occurrence') => {
    const change = this.state.unsentChange;
    if (this.state.newEvent) {
      const { event, task } = queueNewCalendarEvent(
        newEventOptions(this.state.newEvent.draft, change)
      );
      this._dropNewEvent();
      TaskQueue.waitForPerformRemote(task).then(
        () => this._showOnceWritten(event),
        (error) => console.error('Failed to sync new event to server:', error)
      );
      return Promise.resolve();
    }
    if (!change) return Promise.resolve();
    if (this._sending?.change === change) return this._sending.done;
    const done = this._writeUnsentChange(change, scope).finally(() => {
      if (this._sending?.change === change) this._sending = null;
    });
    this._sending = { change, done };
    return done;
  };

  // Not over another event the user has moved on to since sending.
  _showOnceWritten(event: Event) {
    if (this.state.newEvent || this.state.selectedEvents.length) return;
    Actions.focusCalendarEvent({ id: event.id, start: event.recurrenceStart });
  }

  async _writeUnsentChange(change: UnsentChange, scope: ChangeScope) {
    if (change.proposal) await this._sendProposal(change);
    else await this._writeChange(change, scope);
    // Kept until it's written, so nothing draws the old values in between.
    this.setState((s) => (s.unsentChange === change ? { unsentChange: null } : null));
  }

  // Nothing is written to our copy: the event moves only if the organizer accepts.
  async _sendProposal(change: UnsentChange) {
    const { times, proposal } = change;
    const occurrence = this.state.selectedEvents.find((o) => isUnsentChangeFor(change, o));
    await proposeNewEventTime(occurrence, {
      start: new Date(times.start * 1000),
      end: new Date(times.end * 1000),
      comment: proposal.comment.trim(),
    });
  }

  /** Writes a change made in the panel, keeping its occurrence selected wherever it lands. */
  _writeChange = async (change: UnsentChange, scope?: ChangeScope) => {
    const shown = this.state.selectedEvents.find((o) => isUnsentChangeFor(change, o));
    await updateEvent(
      change,
      scope,
      shown && {
        shown,
        onMove: (row, start, staleIcs) => this._followMove(shown, row, start, staleIcs),
      }
    );
  };

  // The panel's date picker and switch use the same keys for themselves.
  _focusInEventPanel() {
    return !!document.activeElement?.closest('.event-panel');
  }

  _unlessFocusInEventPanel(handler: () => void) {
    return () => {
      if (!this._focusInEventPanel()) handler();
    };
  }

  _publishCalendarOptions() {
    CalendarHeaderStore.setCalendarOptions({
      view: this.state.view,
      onChangeView: this.onChangeView,
      agendaOpen: this.state.agendaOpen,
      onToggleAgenda: this.onToggleAgenda,
    });
  }

  componentWillUnmount() {
    CalendarHeaderStore.setCalendarOptions(null);
    // The component is unmounting, dispose subscriptions
    this._disposable?.dispose();
    this._themeDisposable?.dispose();
    if (this._unlisten) {
      this._unlisten();
    }
    this._unlistenNewEvent?.();
    this._unlistenDatabase?.();
    this._unlistenFocusedMoment?.();
    document.removeEventListener('core:undo', this._ignoreUndoWhileHeld, true);
    this._removeLeaveGuard?.();
    AppEnv.removeUnloadCallback(this._onBeforeUnload);
  }

  _onDatabaseChange = ({ objectClass }: DatabaseChangeRecord<Event>) => {
    if (objectClass !== Event.name) return;
    // Deselected, a moved occurrence is drawn from its row, so it needs no guard.
    for (const id of [...this._pendingMoves.keys()]) {
      if (!this.state.selectedEvents.some((o) => o.id === id)) this._pendingMoves.delete(id);
    }
    if (this.state.selectedEvents.length > 0) {
      this._refreshSelectedEvents();
    }
  };

  /** Selection holds occurrence objects, whose times and exception flags go stale on a change. */
  async _refreshSelectedEvents() {
    const selected = this.state.selectedEvents;
    const refreshed = await Promise.all(
      selected.map((o) => currentOccurrence(o, this._pendingMoves, this.state.calendars))
    );
    if (this.state.selectedEvents !== selected) return;
    const next = refreshed.filter(Boolean);
    if (next.length !== selected.length || next.some((o, i) => o !== selected[i])) {
      this._commitPanelEdits(next);
      // Deleted here or elsewhere, its event has nothing left to send the change to.
      const gone = this._leavesUnsentChange(next) && !this._leavesUnsentChange(selected);
      this.setState({ selectedEvents: next, ...(gone && { unsentChange: null }) });
    }
  }

  /** Keeps a moved occurrence selected, under its new id, until its row is rewritten. */
  _followMove(occurrence: EventOccurrence, event: Event, newStart: number, staleIcs: string) {
    if (!isEventSelected(this.state.selectedEvents, occurrence)) return;
    const id = movedOccurrenceId(occurrence, event, newStart);
    this._pendingMoves.set(id, { start: newStart, staleIcs });
    this.setState({
      selectedEvents: this.state.selectedEvents.map((o) =>
        o.id === occurrence.id ? { ...o, id } : o
      ),
    });
  }

  _subscribeToCalendars() {
    const calQuery = DatabaseStore.findAll<Calendar>(Calendar);
    const calQueryObs = Rx.Observable.fromQuery(calQuery);
    const configObs = Rx.Observable.fromConfig<string[] | undefined>(DISABLED_CALENDARS);

    return Rx.Observable.combineLatest(calQueryObs, configObs).subscribe(
      ([calendars, disabledCalendars]) => {
        // Update the color cache with synced calendar colors from CalDAV
        setCalendarColors(calendars);

        const readOnlyCalendarIds = new Set<string>();
        for (const calendar of calendars) {
          if (calendar.readOnly) {
            readOnlyCalendarIds.add(calendar.id);
          }
        }

        this.setState({
          calendars: calendars,
          calendarsLoaded: true,
          disabledCalendars: disabledCalendars || [],
          readOnlyCalendarIds,
        });
      }
    );
  }

  /**
   * Single source of truth for whether an event's calendar may be written to.
   * Fails closed until the calendar subscription first emits, since events render
   * from an independent subscription and can paint before calendars resolve.
   */
  _isCalendarReadOnly = (calendarId: string): boolean => {
    return !this.state.calendarsLoaded || this.state.readOnlyCalendarIds.has(calendarId);
  };

  onChangeView = (view: CalendarView) => {
    // If an event is selected, jump the new view to where it lives so it stays visible and
    // selected (matching Apple Calendar) — switching to a narrow view could otherwise leave the
    // selected event off-screen.
    const selected = this.state.selectedEvents[0];
    const focusedMoment = selected
      ? moment.unix(this._pendingMoves.get(selected.id)?.start ?? occurrenceStartUnix(selected))
      : this.state.focusedMoment;
    // Clear any active drag state when changing views
    this._pendingDragState = null;
    this.setState({ view, dragState: null });
    FocusedMomentStore.setFocusedMoment(focusedMoment, this.state.focusedEvent);
    AppEnv.config.set(CALENDAR_VIEW, view);
  };

  onToggleAgenda = () => {
    const agendaOpen = !this.state.agendaOpen;
    if (!agendaOpen && !this._mayLeave([])) return;
    this.setState({ agendaOpen });
    AppEnv.config.set(AGENDA_OPEN, agendaOpen);
  };

  onChangeFocusedMoment = (focusedMoment: Moment) => {
    FocusedMomentStore.setFocusedMoment(focusedMoment);
  };

  _focusEvent = (event: FocusedEventInfo) => {
    FocusedMomentStore.setFocusedMoment(moment(event.start * 1000), event);
  };

  _onOpenNewCalendarEvent = ({
    title,
    start,
    end,
  }: {
    title: string;
    start: number;
    end: number;
  }) => {
    if (this._openNewEvent({ startUnix: start, endUnix: end, isAllDay: false, title })) {
      FocusedMomentStore.setFocusedMoment(moment(start * 1000));
    }
  };

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

    // Close any open popover when clicking an event (e.g., if another event's
    // popover was open, it should close when selecting a different event)
    Actions.closePopover();

    this._select(next);
  };

  /**
   * Handle single click on the calendar background (not on an event).
   * Deselects all events and closes any open popover.
   */
  _onCalendarClick = (_args: CalendarEventArgs) => {
    if (this._suppressNextCalendarClick) {
      this._suppressNextCalendarClick = false;
      return;
    }
    const { selectedEvents, newEvent } = this.state;
    if ((selectedEvents.length > 0 || newEvent) && this._mayLeave([])) {
      this.setState({ selectedEvents: [], focusedEvent: null });
    }
    Actions.closePopover();
  };

  // A writable calendar and a meeting we organize (RFC 5546 section 2.1), as canMoveEvent asks.
  _isEditable(occurrence: EventOccurrence) {
    return editableFields(occurrence, this._isCalendarReadOnly(occurrence.calendarId)).has('title');
  }

  _proposes(occurrence: EventOccurrence) {
    return proposesTime(occurrence, this._isCalendarReadOnly(occurrence.calendarId));
  }

  _isMovable(occurrence: EventOccurrence) {
    return (
      canMoveEvent(occurrence, this._isCalendarReadOnly(occurrence.calendarId)) ||
      this._proposes(occurrence)
    );
  }

  _proposeNewTime(occurrence: EventOccurrence) {
    // A counter only sends mail, so a read-only calendar's guest still gets one.
    if (!occurrence.isMine && !this._proposes(occurrence)) {
      openProposeNewTimePopover(occurrence);
      return;
    }
    if (!this._select([occurrence])) return;
    window.requestAnimationFrame(() => this._eventPanel.current?.focusTimes());
  }

  _editEvent(occurrence: EventOccurrence) {
    if (!this._isEditable(occurrence)) return;
    this._select([occurrence]);
    // The panel may only mount with this render.
    window.requestAnimationFrame(() => this._eventPanel.current?.focusTitle());
  }

  // The click before it already shows the event in the panel.
  _onEventDoubleClick = (occurrence: EventOccurrence) => {
    this._editEvent(occurrence);
  };

  _onEditSelectedEvent = () => {
    const { selectedEvents } = this.state;
    if (selectedEvents.length === 1) this._editEvent(selectedEvents[0]);
  };

  _onEventContextMenu = (occurrence: EventOccurrence) => {
    // Right-clicking an event that isn't selected selects it first, so the menu acts on what
    // is highlighted - and so pressing Delete afterwards means the same thing.
    if (!isEventSelected(this.state.selectedEvents, occurrence)) {
      this._select([occurrence]);
    }

    const readOnly = this._isCalendarReadOnly(occurrence.calendarId);
    new CalendarEventContextMenu({
      occurrence,
      readOnly,
      onOpen: () =>
        this._isEditable(occurrence) ? this._editEvent(occurrence) : this._select([occurrence]),
      onDelete: () => deleteEvent(occurrence),
      onProposeNewTime: () => this._proposeNewTime(occurrence),
    }).displayMenu();
  };

  _onCalendarDoubleClick = (args: CalendarEventArgs) => {
    this._createEventAt(args);
  };

  /**
   * Right-clicking empty grid offers to create an event there: the double-click that also
   * does is not discoverable, and a right-click is where users look for "New".
   */
  _onCalendarContextMenu = (args: CalendarEventArgs) => {
    if (args.time === null) {
      return;
    }
    this._showGridMenu([{ label: localized('New Event'), click: () => this._createEventAt(args) }]);
  };

  _showGridMenu(template: Electron.MenuItemConstructorOptions[]) {
    require('@electron/remote').Menu.buildFromTemplate(template).popup({});
  }

  /**
   * Opens the editor for a new event at the slot under the pointer: the time at the click
   * position, snapped to the half hour on the hour grid, a whole day on the all-day row and
   * in a month cell.
   */
  _createEventAt(args: CalendarEventArgs) {
    if (args.time === null) {
      return;
    }

    // Snap start time to 30-minute intervals for day/week view,
    // or use 9 AM for month view / all-day area
    let startUnix: number;
    const isAllDay = args.containerType === 'all-day-area' || args.containerType === 'month-cell';

    if (isAllDay) {
      // For month/all-day, start at beginning of the day
      const dayStart = moment(args.time * 1000)
        .startOf('day')
        .unix();
      startUnix = dayStart;
    } else {
      // Snap to nearest 30-minute interval
      const thirtyMinutes = 30 * 60;
      startUnix = Math.round(args.time / thirtyMinutes) * thirtyMinutes;
    }

    const endUnix = isAllDay
      ? CalendarDateUtils.nextDayStartUnix(CalendarDateUtils.calendarDateFromUnix(startUnix))
      : startUnix + DEFAULT_TIMED_EVENT_DURATION_SECONDS;

    this._openNewEvent({ startUnix, endUnix, isAllDay });
  }

  /** A title starts as an unsent edit, so leaving creates the event as if it had been typed. */
  _openNewEvent({
    startUnix,
    endUnix,
    isAllDay,
    title = '',
  }: {
    startUnix: number;
    endUnix: number;
    isAllDay: boolean;
    title?: string;
  }) {
    const calendar = defaultCalendarForNewEvent(
      this.state.calendars,
      this.state.disabledCalendars || []
    );
    if (!calendar) {
      showNoEditableCalendarsError();
      return false;
    }
    if (!this._mayLeave([])) return false;
    Actions.closePopover();

    const draft: NewEventDraft = {
      start: startUnix,
      end: endUnix,
      isAllDay,
      calendarId: calendar.id,
      accountId: calendar.accountId,
    };
    const id = `__new_event_${++this._newEventSerial}`;
    const occurrence = newEventOccurrence(id, draft);
    this.setState({
      selectedEvents: [],
      focusedEvent: null,
      unsentChange: withEdit(null, occurrence, { property: 'summary', value: title }, ''),
      newEvent: { draft, occurrence },
      agendaOpen: true,
    });
    AppEnv.config.set(AGENDA_OPEN, true);
    // The panel may only mount with this render.
    window.requestAnimationFrame(() => this._eventPanel.current?.focusTitle());
    return true;
  }

  _newEventCalendarChoices() {
    const editable = getEditableCalendars(this.state.calendars, this.state.disabledCalendars);
    return editable.length > 1 ? editable : undefined;
  }

  _onNewEventCalendarChange = (calendar: Calendar) => {
    const { newEvent } = this.state;
    if (!newEvent) return;
    const draft = { ...newEvent.draft, calendarId: calendar.id, accountId: calendar.accountId };
    this.setState({
      newEvent: { draft, occurrence: newEventOccurrence(newEvent.occurrence.id, draft) },
    });
  };

  /**
   * Creates the panel's new event once it has a title or an invitee (with invitees, only after
   * Send invitations), else drops it. False keeps it open; a creation resolves once written.
   */
  _leaveNewEvent({ canKeepEditing = true } = {}): Promise<void> | null | false {
    const { newEvent, unsentChange } = this.state;
    let created: Promise<void> | null = null;
    if (keepsNewEvent(unsentChange)) {
      const choice = unsentChange.attendees?.added.length
        ? showUnsentChangeDialog(unsentChange, newEvent.occurrence, {
            canKeepEditing,
            invitations: true,
          })
        : 'send';
      if (choice === 'keep-editing') {
        this._eventPanel.current?.returnToField();
        return false;
      }
      if (choice === 'send') {
        const { task } = queueNewCalendarEvent(newEventOptions(newEvent.draft, unsentChange));
        created = TaskQueue.waitForPerformLocal(task).then(() => undefined);
      }
    }
    this._dropNewEvent();
    return created;
  }

  _dropNewEvent = () => {
    this.setState({ newEvent: null, unsentChange: null });
  };

  _newEventPreview(): EventOccurrence | null {
    const { createDrag, newEvent, unsentChange } = this.state;
    if (createDrag) return createNewEventPreview(createDrag);
    if (!newEvent) return null;
    const drawn = this._drawnNewEvent;
    if (drawn?.occurrence !== newEvent.occurrence || drawn.change !== unsentChange) {
      const [preview] = withUnsentChange([newEvent.occurrence], unsentChange);
      this._drawnNewEvent = {
        occurrence: newEvent.occurrence,
        change: unsentChange,
        preview: { ...preview, isDragPreview: true },
      };
    }
    return this._drawnNewEvent.preview;
  }

  // Kept, so the grid isn't handed a new preview on every render.
  _drawnNewEvent: {
    occurrence: EventOccurrence;
    change: UnsentChange | null;
    preview: EventOccurrence;
  } | null = null;

  // Fires once the focused event has scrolled itself into view, and selects it, which shows it in
  // the panel. Clearing the flag here keeps a later unrelated re-render from re-running that scroll.
  _onEventFocused = (occurrence: EventOccurrence) => {
    const { selectedEvents } = this.state;
    // An agenda row Cmd-clicked into the selection is already in it.
    this._select(isEventSelected(selectedEvents, occurrence) ? selectedEvents : [occurrence]);
  };

  _onDeleteSelectedEvents = async () => {
    if (this.state.selectedEvents.length === 0) {
      return;
    }

    const selected = this.state.selectedEvents;
    if (selected.some((o) => this._pendingMoves.has(o.id))) {
      return;
    }

    // Partition before prompting so the dialog can disclose a partial delete
    const deletable = selected.filter((o) => !this._isCalendarReadOnly(o.calendarId));
    if (deletable.length === 0) {
      showReadOnlyCalendarError();
      return;
    }
    const skipped = selected.length - deletable.length;
    // Deleting an invitation declines it; nothing here is one when every event is ours.
    const ours = deletable.every((o) => o.isMine);
    let message: string;
    if (!ours) {
      message = localized('Delete or decline these events?');
    } else if (deletable.length === 1) {
      message = localized('Delete this event?');
    } else {
      message = localized('Delete these events?');
    }

    // Show initial confirmation dialog
    const response = require('@electron/remote').dialog.showMessageBoxSync({
      type: 'warning',
      buttons: [localized('Delete'), localized('Cancel')],
      message,
      detail: skipped
        ? localized(
            "%1$@ of the %2$@ selected events will be deleted. The rest are on read-only calendars and can't be changed.",
            deletable.length,
            selected.length
          )
        : ours
          ? localized('Are you sure you want to delete the selected event(s)?')
          : localized(
              `Are you sure you want to delete or decline invitations for the selected event(s)?`
            ),
    });

    if (response !== 0) {
      return; // User cancelled
    }

    for (const occurrence of deletable) {
      await deleteEvent(occurrence);
    }
  };

  /**
   * Get the drag configuration based on the current view
   */
  _getDragConfig() {
    return this.state.view === CalendarView.MONTH ? MONTH_VIEW_DRAG_CONFIG : DEFAULT_DRAG_CONFIG;
  }

  /**
   * A grab waiting for its position: the event's mousedown lands here first, then bubbles to
   * the CalendarEventContainer, whose hit-test hands _onCalendarMouseDown the grid time and
   * container coordinates under the cursor — the same frame every later drag target uses.
   */
  _pendingDrag: { event: EventOccurrence; hitZone: HitZone } | null = null;

  /**
   * A grab that has its position but has not travelled past the drag threshold. Held here
   * rather than in state, like _pendingCreateDrag: a setState on every press re-renders the
   * grid for a click. _onCalendarMouseMove moves it into state once it is a drag.
   */
  _pendingDragState: DragState | null = null;

  _onEventDragStart = (event: EventOccurrence, _mouseEvent: React.MouseEvent, hitZone: HitZone) => {
    this._pendingDrag = { event, hitZone };
  };

  /**
   * Handle mouse move during drag
   */
  _onCalendarMouseMove = (args: CalendarEventArgs) => {
    const createDrag = this.state.createDrag || this._pendingCreateDrag;
    if (createDrag) {
      if (args.time === null) {
        return;
      }
      // Nothing is drawn until the pointer has travelled a snap interval: until then the
      // press is a click, which must deselect rather than create.
      const travelled =
        createDrag.isDragging ||
        Math.abs(args.time - createDrag.anchorTime) >= CREATE_DRAG_SNAP_SECONDS;
      if (!travelled) {
        return;
      }
      this.setState({ createDrag: { ...createDrag, currentTime: args.time, isDragging: true } });
      return;
    }

    const active = this.state.dragState || this._pendingDragState;
    if (!active) {
      return;
    }

    // args.time can be null if mouse is not over a valid calendar area
    if (args.time === null || args.x === null || args.y === null) {
      return;
    }

    const config = this._getDragConfig();

    const newDragState = updateDragState(
      active,
      args.time,
      args.mouseEvent.clientX,
      args.mouseEvent.clientY,
      args.containerType,
      config
    );

    // A drag of an event we neither organize nor can propose for starts so the attempt can be
    // seen; once it is one, explain instead.
    if (newDragState.isDragging && !this._isMovable(newDragState.event)) {
      this._pendingDragState = null;
      this.setState({ dragState: null });
      showOrganizerOnlyMoveDialog(newDragState.event);
      return;
    }

    // Below the threshold updateDragState hands back the same object, so a grab that has not
    // travelled stays out of state.
    if (newDragState !== active) {
      this._pendingDragState = null;
      this.setState({ dragState: newDragState });
    }
  };

  /**
   * Handle mouse up to complete drag
   */
  _onCalendarMouseUp = (args: CalendarEventArgs) => {
    // A grab that never travelled was a click on the event, which the event handles itself.
    this._pendingDragState = null;
    // An untravelled press was a click on the grid; the click event that follows is its own.
    this._pendingCreateDrag = null;
    const { createDrag } = this.state;
    if (createDrag) {
      this.setState({ createDrag: null });
      this._suppressNextCalendarClick = true;
      const { start, end } = createDragRange(createDrag);
      this._openNewEvent({
        startUnix: start,
        endUnix: createDrag.isAllDay
          ? CalendarDateUtils.nextDayStartUnix(CalendarDateUtils.calendarDateFromUnix(end))
          : end,
        isAllDay: createDrag.isAllDay,
      });
      return;
    }

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

    // Check if the times OR the kind actually changed. A timed event dropped on the all-day
    // row can convert with identical instants (e.g. a midnight-to-midnight event), so a
    // times-only check would silently drop the conversion.
    if (
      dragState.previewStart === dragState.originalStart &&
      dragState.previewEnd === dragState.originalEnd &&
      dragState.previewIsAllDay === dragState.event.isAllDay
    ) {
      // No change, just clear state
      this.setState({ dragState: null });
      return;
    }

    // Persist the change
    this._persistDragChange(dragState);
  };

  /**
   * A press on an event arrives as a pending grab and becomes a drag of that event. Any other
   * left press over grid time begins drawing a new event, held until the pointer travels.
   */
  _onCalendarMouseDown = (args: CalendarEventArgs) => {
    // A drag released outside the calendar is followed by no click, so the flag lives one press.
    this._suppressNextCalendarClick = false;
    const pending = this._pendingDrag;
    this._pendingDrag = null;
    if (args.time === null) {
      return;
    }
    if (!pending) {
      this._beginCreateDrag(args);
      return;
    }
    // The threshold is measured in window coordinates: args.x/y restart at each container, and a
    // month bar and the cell under it are different containers.
    this._pendingDragState = createDragState(
      pending.event,
      pending.hitZone,
      args.time,
      args.mouseEvent.clientX,
      args.mouseEvent.clientY,
      this._getDragConfig()
    );
  };

  _beginCreateDrag(args: CalendarEventArgs) {
    if (args.mouseEvent.button !== 0) {
      return;
    }
    // A press on an event that cannot be dragged sets no pending grab but still bubbles here;
    // the DOM says where it landed, and a new event is never drawn over an existing one.
    const target = args.mouseEvent.target as HTMLElement;
    if (target.closest('.calendar-event, .month-view-event')) {
      return;
    }
    const calendar = defaultCalendarForNewEvent(
      this.state.calendars,
      this.state.disabledCalendars || []
    );
    if (!calendar) {
      return;
    }
    this._pendingCreateDrag = {
      anchorTime: args.time,
      currentTime: args.time,
      isAllDay: args.containerType === 'all-day-area' || args.containerType === 'month-cell',
      isDragging: false,
      calendarId: calendar.id,
      accountId: calendar.accountId,
    };
  }

  /**
   * Handle keyboard shortcuts for moving/resizing events
   */
  _onMoveSelectedEvent = (direction: 'up' | 'down' | 'left' | 'right', isResize: boolean) => {
    // An event selected from the agenda panel may be off the grid, so the keys don't move it.
    if (
      this.state.selectedEvents.length === 0 ||
      document.activeElement?.closest('.agenda-panel') ||
      this._focusInEventPanel()
    ) {
      return;
    }

    // From where it's drawn, which a held move changes.
    const [occurrence] = withUnsentChange(
      this.state.selectedEvents.slice(0, 1),
      this.state.unsentChange
    );
    // The selection keeps the old times and flags until the move syncs back.
    if (this._pendingMoves.has(occurrence.id)) {
      return;
    }

    if (!this._isMovable(occurrence)) {
      if (canAttemptMove(occurrence, this._isCalendarReadOnly(occurrence.calendarId))) {
        showOrganizerOnlyMoveDialog(occurrence);
      }
      return;
    }

    // All-day events have no time of day, so up/down has nothing to move
    if (occurrence.isAllDay && (direction === 'up' || direction === 'down')) {
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
      // The keyboard pipeline is unix, so derive instants for all-day occurrences (dates only).
      const occStart = occurrenceStartUnix(occurrence);
      const occEnd = occurrenceEndUnix(occurrence);
      let newStart: number;
      let newEnd: number;

      if (occurrence.isAllDay) {
        // Only left/right reaches here, so the delta is a day in either direction. Shifting
        // by calendar days rather than 86400 seconds keeps the times on midnight across a
        // DST transition, where a seconds shift overshoots and snaps up an extra day.
        const days = Math.sign(timeDelta);
        newStart = isResize ? occStart : CalendarDateUtils.shiftedDayStartUnix(occStart, days);
        newEnd = isResize
          ? clampEnd(newStart, CalendarDateUtils.shiftedDayStartUnix(occEnd, days), true)
          : shiftEndWithStart(occStart, occEnd, newStart, true);
        const snapped = snapAllDayTimes(newStart, newEnd);
        newStart = snapped.start;
        newEnd = snapped.end;
      } else if (isResize) {
        // Shift+Arrow: resize the event (change end time only)
        newStart = occStart;
        newEnd = clampEnd(newStart, occEnd + timeDelta, false);
      } else {
        // Arrow: move the event (change both start and end)
        newStart = occStart + timeDelta;
        newEnd = occEnd + timeDelta;
      }

      // Resizing at the minimum duration clamps back to the current end, so the change can
      // be a no-op. Bail like the mouse-up path does, rather than queueing a syncback and an
      // undo toast for an identical event — or prompting for a recurring series that won't move.
      if (newStart === occStart && newEnd === occEnd) {
        return;
      }

      if (
        this._holdTimes(occurrence, { start: newStart, end: newEnd, isAllDay: occurrence.isAllDay })
      ) {
        return;
      }

      const eventId = CalendarUtils.parseOccurrenceId(occurrence.id).eventId;
      const event = await DatabaseStore.find<Event>(Event, eventId);
      if (!event) {
        console.error('Could not find event to update:', eventId);
        return;
      }

      // Use shared utility for recurring event support (shows dialog if needed)
      const options: EventTimeChangeOptions = {
        event,
        originalOccurrenceStart: occurrenceSlot(occurrence),
        newStart,
        newEnd,
        isAllDay: occurrence.isAllDay,
        isException: occurrence.isException,
        description: isResize ? localized('Resize event') : localized('Move event'),
      };

      // The change is written onto `event` before it is queued.
      const staleIcs = event.ics;
      const result = await modifyEventWithRecurringSupport(
        options,
        isResize ? 'resize' : 'move',
        occurrence.title
      );
      if (result.success) {
        this._followMove(occurrence, event, newStart, staleIcs);
      }
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

    // Handle all-day events - snap times to day boundaries
    let newStart = dragState.previewStart;
    let newEnd = dragState.previewEnd;
    if (dragState.previewIsAllDay) {
      const snapped = snapAllDayTimes(newStart, newEnd);
      newStart = snapped.start;
      newEnd = snapped.end;
    }
    const isAllDay = dragState.previewIsAllDay;
    // Parse the event ID from the occurrence ID
    const eventId = CalendarUtils.parseOccurrenceId(dragState.event.id).eventId;
    // Stretched past a day in the grid, it stays there rather than jump to the all-day row
    // under the pointer, until the user moves on to its panel or to something else.
    if (!isAllDay && !inAllDayRow(dragState.event)) this.setState({ heldInGridEventId: eventId });
    if (this._holdTimes(dragState.event, { start: newStart, end: newEnd, isAllDay })) {
      return;
    }

    try {
      const event = await DatabaseStore.find<Event>(Event, eventId);
      if (!event) {
        console.error('Could not find event to update:', eventId);
        return;
      }

      if (this._isCalendarReadOnly(event.calendarId)) {
        console.warn('Cannot modify event in read-only calendar');
        return;
      }

      // Use shared utility for the modification logic (includes undo support)
      const options: EventTimeChangeOptions = {
        event,
        originalOccurrenceStart: occurrenceSlot(dragState.event),
        newStart,
        newEnd,
        isAllDay,
        isException: dragState.event.isException,
        description:
          dragState.mode === 'move' ? localized('Move event') : localized('Resize event'),
      };

      const staleIcs = event.ics;
      const result = await modifyEventWithRecurringSupport(
        options,
        dragState.mode === 'move' ? 'move' : 'resize',
        dragState.event.title
      );
      if (result.success) {
        this._followMove(dragState.event, event, newStart, staleIcs);
      }
    } catch (error) {
      console.error('Failed to persist drag change:', error);
      AppEnv.showErrorDialog({
        title: localized('Update Failed'),
        message: localized('Failed to update the event. Please try again.'),
      });
    }
  }

  /**
   * Navigate to the next period based on the current view.
   */
  _onNavigateNext = () => {
    const { view, focusedMoment } = this.state;
    let newMoment: Moment;
    switch (view) {
      case CalendarView.DAY:
      case CalendarView.WEEK:
        this._timeGrid.current?.navigate(1);
        return;
      case CalendarView.MONTH:
        newMoment = moment(focusedMoment).add(1, 'month');
        break;
      default:
        return;
    }
    this.onChangeFocusedMoment(newMoment);
  };

  /**
   * Navigate to the previous period based on the current view.
   */
  _onNavigatePrevious = () => {
    const { view, focusedMoment } = this.state;
    let newMoment: Moment;
    switch (view) {
      case CalendarView.DAY:
      case CalendarView.WEEK:
        this._timeGrid.current?.navigate(-1);
        return;
      case CalendarView.MONTH:
        newMoment = moment(focusedMoment).subtract(1, 'month');
        break;
      default:
        return;
    }
    this.onChangeFocusedMoment(newMoment);
  };

  _onRefreshCalendars = () => {
    AppEnv.mailsyncBridge.sendSyncCalendarNow();
  };

  _shouldShowEmptyState() {
    return this.state.calendarsLoaded && this.state.calendars.length === 0;
  }

  _viewProps(): MailspringCalendarViewProps {
    return {
      paintVersion: `${getColorCacheVersion()}-${this.state.themeVersion}`,
      dataSource: this._dataSource,
      focusedMoment: this.state.focusedMoment,
      focusedEvent: this.state.focusedEvent,
      selectedEvents: this.state.selectedEvents,
      disabledCalendars: this.state.disabledCalendars,
      onChangeView: this.onChangeView,
      onChangeFocusedMoment: this.onChangeFocusedMoment,
      onCalendarMouseUp: this._onCalendarMouseUp,
      onCalendarMouseDown: this._onCalendarMouseDown,
      onCalendarMouseMove: this._onCalendarMouseMove,
      onCalendarClick: this._onCalendarClick,
      onCalendarDoubleClick: this._onCalendarDoubleClick,
      onCalendarContextMenu: this._onCalendarContextMenu,
      onEventClick: this._onEventClick,
      onEventDoubleClick: this._onEventDoubleClick,
      onEventContextMenu: this._onEventContextMenu,
      onEventFocused: this._onEventFocused,
      dragState: this.state.dragState,
      newEventPreview: this._newEventPreview(),
      unsentChange: this.state.unsentChange,
      onEventDragStart: this._onEventDragStart,
      readOnlyCalendarIds: this.state.readOnlyCalendarIds,
      isCalendarReadOnly: this._isCalendarReadOnly,
      heldInGridEventId: this.state.heldInGridEventId,
    };
  }

  _renderMainContent() {
    if (this._shouldShowEmptyState()) {
      return <CalendarEmptyState />;
    }
    const { view } = this.state;
    if (view === CalendarView.MONTH) {
      return <MonthView {...this._viewProps()} />;
    }
    return (
      <TimeGridView
        ref={this._timeGrid}
        key={view}
        {...this._viewProps()}
        visibleDays={VISIBLE_DAYS[view]}
      />
    );
  }

  _onAgendaEventClick = (e: React.MouseEvent, occurrence: EventOccurrence) => {
    const deselecting =
      (e.shiftKey || e.metaKey) && isEventSelected(this.state.selectedEvents, occurrence);
    this._onEventClick(e, occurrence);
    if (!deselecting) this._revealEvent(occurrence);
  };

  _revealEvent = (occurrence: EventOccurrence) => {
    Actions.focusCalendarEvent({ id: occurrence.id, start: occurrenceStartUnix(occurrence) });
  };

  _renderGridArea() {
    const panelEvent = this.state.agendaOpen ? this._panelEvent() : null;
    return (
      <ScrollBackArea
        event={panelEvent}
        dayAxis={this.state.view === CalendarView.MONTH ? 'vertical' : 'horizontal'}
        onReveal={this._revealEvent}
      >
        {this._renderMainContent()}
      </ScrollBackArea>
    );
  }

  // The agenda stays mounted under an open event, so going back keeps its scroll position.
  _renderAgendaPanel() {
    if (!this.state.agendaOpen || this._shouldShowEmptyState()) {
      return null;
    }
    const event = this._panelEvent();
    const { unsentChange, newEvent } = this.state;
    return (
      <ResizableRegion
        handle={ResizableRegion.Handle.Left}
        style={{ height: '100%', flexShrink: 0 }}
        initialWidth={AppEnv.getColumnWidth(AGENDA_WIDTH) || AGENDA_WIDTHS.initial}
        minWidth={AGENDA_WIDTHS.min}
        maxWidth={AGENDA_WIDTHS.max}
        onResize={(width) => AppEnv.storeColumnWidth({ id: AGENDA_WIDTH, width })}
      >
        <div className="calendar-right-panel" onFocus={this._onRightPanelFocus}>
          <AgendaContainer
            className={event ? 'is-covered' : undefined}
            selectedEvents={this.state.selectedEvents}
            onEventClick={this._onAgendaEventClick}
            onEventDoubleClick={this._onEventDoubleClick}
            onNewEvent={openQuickEventPopover}
          />
          {event && (
            <EventPanel
              ref={this._eventPanel}
              key={panelKey(newEvent ? [event] : this.state.selectedEvents)}
              event={event}
              isNewEvent={!!newEvent}
              unsentChange={isUnsentChangeFor(unsentChange, event) ? unsentChange : null}
              onUnsentChange={this._onUnsentChange}
              onSendUnsentChange={this._sendUnsentChange}
              onSaveChange={this._writeChange}
              calendar={this.state.calendars.find((c) => c.id === event.calendarId)}
              isCalendarReadOnly={this._isCalendarReadOnly(event.calendarId)}
              onBack={this._onBackToAgenda}
              onDelete={
                newEvent
                  ? this._dropNewEvent
                  : this._isCalendarReadOnly(event.calendarId)
                    ? undefined
                    : () => deleteEvent(event)
              }
              onDiscard={newEvent ? this._dropNewEvent : undefined}
              calendarChoices={newEvent ? this._newEventCalendarChoices() : undefined}
              onCalendarChange={this._onNewEventCalendarChange}
            />
          )}
        </div>
      </ResizableRegion>
    );
  }

  render() {
    return (
      <CalendarMenuCommands
        onChangeView={this.onChangeView}
        onChangeFocusedMoment={this.onChangeFocusedMoment}
        onNavigateNext={this._onNavigateNext}
        onNavigatePrevious={this._onNavigatePrevious}
        onDeleteEvent={this._onDeleteSelectedEvents}
        onRefreshCalendars={this._onRefreshCalendars}
        hasSelectedEvents={this.state.selectedEvents.length > 0}
        view={this.state.view}
      >
        <KeyCommandsRegion
          className="mailspring-calendar"
          localHandlers={{
            'core:pop-sheet': this._onBackToAgenda,
            'core:focus-item': this._unlessFocusInEventPanel(this._onEditSelectedEvent),
            'core:remove-from-view': this._unlessFocusInEventPanel(this._onDeleteSelectedEvents),
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
          {this._renderGridArea()}
          {this._renderAgendaPanel()}
        </KeyCommandsRegion>
      </CalendarMenuCommands>
    );
  }
}
