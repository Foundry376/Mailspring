import React from 'react';
import classnames from 'classnames';
import { ipcRenderer } from 'electron';
import { Disposable } from 'rx-core';
import {
  Rx,
  AccountStore,
  Calendar,
  CalendarConflict,
  DatabaseStore,
  DatabaseChangeRecord,
  DOMUtils,
  Event,
  MessageStore,
  WorkspaceStore,
  CalendarUtils,
  localized,
} from 'mailspring-exports';
import { RetinaImg } from 'mailspring-component-kit';
import { AgendaContainer } from './core/agenda-container';
import { EventPanel } from './core/event-panel';
import {
  EventOccurrence,
  EventRef,
  occurrenceEndUnix,
  occurrenceStartUnix,
  currentOccurrence,
  focusedOccurrenceForIcsuid,
  movedOccurrenceId,
  occurrenceSlot,
  panelKey,
} from './core/calendar-data-source';
import { emailedEventIn } from '../../events/lib/invitation-versions';
import { findEventConflicts } from '../../events/lib/rsvp-target';
import { canRespondToEvent } from './core/calendar-rsvp';
import { proposeNewEventTime } from './core/calendar-rsvp';
import { ChangeScope, deleteEvent, updateEvent } from './core/recurring-event-actions';
import { UnsentChange, isUnsentChangeFor } from './core/unsent-change';
import { showUnsentChangeDialog } from './core/unsent-change-dialog';

interface SidebarCalendarPanelState {
  shown: EventOccurrence | null;
  // Keyed by panelKey, so one event's conflicts never show on the next before they're read.
  conflicts: { key: string; list: CalendarConflict[] } | null;
  inThisEmail: EventOccurrence | null;
  unsentChange: UnsentChange | null;
  calendars: Calendar[];
  calendarsLoaded: boolean;
}

interface SidebarCalendarPanelProps {
  active: boolean;
  claimActive: (claim: boolean) => void;
}

/**
 * The calendar as a choice in the thread sidebar's panel switcher: the agenda, with the event
 * panel over it for the event picked there. One event at a time, so the change held for Send
 * update is always the shown event's.
 *
 * Opening an email whose event is on our calendar shows that event and claims the sidebar for
 * it; an email without one goes back to the agenda. Within one email the last click wins.
 */
export class SidebarCalendarPanel extends React.Component<
  SidebarCalendarPanelProps,
  SidebarCalendarPanelState
> {
  static displayName = 'SidebarCalendarPanel';
  static sidebarPanel = { id: 'calendar', title: localized('Calendar') };

  state: SidebarCalendarPanelState = {
    shown: null,
    conflicts: null,
    inThisEmail: null,
    unsentChange: null,
    calendars: [],
    calendarsLoaded: false,
  };

  _eventPanel = React.createRef<EventPanel>();
  _pendingMoves = new Map<string, { start: number; staleIcs: string }>();
  _sending: { change: UnsentChange; done: Promise<void> } | null = null;
  _calendarsSubscription?: Disposable;
  _unlistenDatabase?: () => void;
  _unlistenMessages?: () => void;
  _removeLeaveGuard?: () => void;
  _threadId: string | null = null;
  _followedEmail = false;
  _clickedInEmail = false;
  _emailedRef: EventRef | null = null;

  componentDidMount() {
    this._calendarsSubscription = Rx.Observable.fromQuery(
      DatabaseStore.findAll<Calendar>(Calendar)
    ).subscribe((calendars: Calendar[]) => this.setState({ calendars, calendarsLoaded: true }));
    this._unlistenDatabase = DatabaseStore.listen(this._onDatabaseChange);
    // Captured, so it runs before the window's own undo handler on <body>.
    document.addEventListener('core:undo', this._ignoreUndoWhileHeld, true);
    this._removeLeaveGuard = WorkspaceStore.setSectionLeaveGuard(() => this._mayLeave(null));
    AppEnv.onBeforeUnload(this._onBeforeUnload);
    this._unlistenMessages = MessageStore.listen(this._onMessagesChange);
    this._onMessagesChange();
  }

  componentDidUpdate(_: SidebarCalendarPanelProps, prevState: SidebarCalendarPanelState) {
    if (prevState.shown !== this.state.shown) this._refreshConflicts(this.state.shown);
  }

  async _refreshConflicts(shown: EventOccurrence | null) {
    let list: CalendarConflict[] = [];
    if (shown && canRespondToEvent(shown)) {
      const { accountId } = shown;
      const window = { start: occurrenceStartUnix(shown), end: occurrenceEndUnix(shown) };
      const [row, nearby] = await Promise.all([
        DatabaseStore.find<Event>(Event, CalendarUtils.parseOccurrenceId(shown.id).eventId),
        DatabaseStore.findAll<Event>(Event).where([
          Event.attributes.accountId.equal(accountId),
          Event.attributes.recurrenceStart.lessThan(window.end),
          Event.attributes.recurrenceEnd.greaterThan(window.start),
        ]),
      ]);
      if (row) {
        list = findEventConflicts({
          nearby,
          calendars: this.state.calendars,
          window,
          addresses: AccountStore.aliasesFor([accountId]).map((a) => a.email),
          icsuid: row.icsuid,
        });
      }
    }
    if (this.state.shown === shown) {
      this.setState({ conflicts: shown && { key: panelKey([shown]), list } });
    }
  }

  componentWillUnmount() {
    // Closing the thread or the sidebar can't be stopped, so a held change is sent or dropped.
    this._settleUnsentChange();
    this._calendarsSubscription?.dispose();
    this._unlistenDatabase?.();
    this._unlistenMessages?.();
    document.removeEventListener('core:undo', this._ignoreUndoWhileHeld, true);
    this._removeLeaveGuard?.();
    AppEnv.removeUnloadCallback(this._onBeforeUnload);
  }

  // Fails closed until calendars load, matching MailspringCalendar._isCalendarReadOnly.
  _isCalendarReadOnly(calendarId: string) {
    const { calendars, calendarsLoaded } = this.state;
    return !calendarsLoaded || !!calendars.find((c) => c.id === calendarId)?.readOnly;
  }

  _show(next: EventOccurrence | null) {
    if (!this._mayLeave(next)) return false;
    this.setState({ shown: next });
    return true;
  }

  // The invitation's attachment can land after the email opens, so each change is checked
  // until this email's event is found.
  _onMessagesChange = async () => {
    // A thread switch empties the messages before loading them; deciding then would let go.
    if (MessageStore.itemsLoading()) return;
    const threadId = MessageStore.threadId();
    const newEmail = threadId !== this._threadId;
    if (!newEmail && this._followedEmail) return;
    if (newEmail) {
      this._threadId = threadId;
      this._followedEmail = false;
      this._clickedInEmail = false;
      this._emailedRef = null;
    }
    const followed = () => MessageStore.threadId() === threadId && !this._followedEmail;

    const emailed = await emailedEventIn(MessageStore.items());
    if (!followed()) return;
    const calendars = this.state.calendarsLoaded
      ? this.state.calendars
      : await DatabaseStore.findAll<Calendar>(Calendar);
    const occurrence = emailed && (await focusedOccurrenceForIcsuid(emailed, calendars));
    if (!followed()) return;
    if (occurrence) {
      this._followedEmail = true;
      this._emailedRef = emailed;
      this.setState({ inThisEmail: occurrence });
      // Found after the user picked something else in this email: their pick stays.
      if (!this._clickedInEmail && this._show(occurrence)) this.props.claimActive(true);
    } else if (newEmail) {
      this.setState({ inThisEmail: null });
      if (!this._clickedInEmail && this._show(null)) this.props.claimActive(false);
    }
  };

  _onAgendaEventClick = (_e: React.MouseEvent, occurrence: EventOccurrence) => {
    this._clickedInEmail = true;
    this._show(occurrence);
  };

  _onBack = () => {
    this._clickedInEmail = true;
    this._show(null);
  };

  _leavesUnsentChange(next: EventOccurrence | null) {
    const change = this.state.unsentChange;
    if (!change || this._sending?.change === change) return false;
    return !(next && isUnsentChangeFor(change, next));
  }

  _mayLeave(next: EventOccurrence | null) {
    const { shown } = this.state;
    if (shown && panelKey(next ? [next] : []) !== panelKey([shown])) {
      this._eventPanel.current?.commitEdits();
    }
    if (!this._leavesUnsentChange(next)) return true;
    const choice = showUnsentChangeDialog(this.state.unsentChange, shown ?? undefined);
    if (choice === 'keep-editing') {
      this._eventPanel.current?.returnToField();
      return false;
    }
    if (choice === 'discard') this.setState({ unsentChange: null });
    else this._sendUnsentChange(choice === 'send' ? undefined : (choice as ChangeScope));
    return true;
  }

  /** Sends or drops a held change where leaving can't be stopped; resolves once it's written. */
  _settleUnsentChange(): Promise<void> | undefined {
    const saved = this._eventPanel.current?.commitEdits();
    let sent = this._sending?.done;
    if (!sent && this._leavesUnsentChange(null)) {
      const choice = showUnsentChangeDialog(
        this.state.unsentChange,
        this.state.shown ?? undefined,
        { canKeepEditing: false }
      );
      if (choice === 'discard') {
        this.setState({ unsentChange: null });
      } else {
        sent = this._sendUnsentChange(choice === 'send' ? undefined : (choice as ChangeScope));
      }
    }
    if (!saved && !sent) return undefined;
    return Promise.all([saved, sent]).then(() => undefined);
  }

  // Quitting can't be stopped, and the sync engine is stopped once every callback is ready.
  _onBeforeUnload = (readyToUnload: () => void) => {
    const settled = this._settleUnsentChange();
    if (!settled) return true;
    Promise.race([settled, new Promise((r) => setTimeout(r, 700))]).then(
      readyToUnload,
      readyToUnload
    );
    return false;
  };

  // Held edits queue no task, so the last undoable action is an older one the user isn't looking at.
  _ignoreUndoWhileHeld = (e: CustomEvent) => {
    if (this.state.unsentChange && !DOMUtils.isTextInput(e.target)) e.stopPropagation();
  };

  _onUnsentChange = (unsentChange: UnsentChange | null) => {
    this.setState({ unsentChange });
  };

  _sendUnsentChange = (scope: ChangeScope = 'this-occurrence') => {
    const change = this.state.unsentChange;
    if (!change) return Promise.resolve();
    if (this._sending?.change === change) return this._sending.done;
    const done = this._writeUnsentChange(change, scope).finally(() => {
      if (this._sending?.change === change) this._sending = null;
    });
    this._sending = { change, done };
    return done;
  };

  async _writeUnsentChange(change: UnsentChange, scope: ChangeScope) {
    if (change.proposal) {
      // Nothing is written to our copy: the event moves only if the organizer accepts.
      const { times, proposal } = change;
      await proposeNewEventTime(this.state.shown, {
        start: new Date(times.start * 1000),
        end: new Date(times.end * 1000),
        comment: proposal.comment.trim(),
      });
    } else {
      await this._writeChange(change, scope);
    }
    // Kept until it's written, so nothing draws the old values in between.
    this.setState((s) => (s.unsentChange === change ? { unsentChange: null } : null));
  }

  /** Writes a change made in the panel, keeping its occurrence shown wherever it lands. */
  _writeChange = async (change: UnsentChange, scope?: ChangeScope) => {
    const { shown } = this.state;
    await updateEvent(
      change,
      scope,
      shown &&
        isUnsentChangeFor(change, shown) && {
          shown,
          onMove: (row, start, staleIcs) => this._followMove(shown, row, start, staleIcs),
        }
    );
  };

  _followMove(occurrence: EventOccurrence, event: Event, newStart: number, staleIcs: string) {
    if (this.state.shown?.id !== occurrence.id) return;
    const id = movedOccurrenceId(occurrence, event, newStart);
    this._pendingMoves.set(id, { start: newStart, staleIcs });
    const moved = { ...occurrence, id };
    this.setState({ shown: moved, ...(this._isInThisEmail(occurrence) && { inThisEmail: moved }) });
  }

  _isInThisEmail(occurrence: EventOccurrence) {
    const { inThisEmail } = this.state;
    return !!inThisEmail && panelKey([inThisEmail]) === panelKey([occurrence]);
  }

  // The calendar opens it the way an invitation's View in Calendar link does.
  _onViewInCalendar = async () => {
    const { shown } = this.state;
    const row = await DatabaseStore.find<Event>(
      Event,
      CalendarUtils.parseOccurrenceId(shown.id).eventId
    );
    if (!row) return;
    ipcRenderer.send('command', 'application:show-calendar', {
      icsuid: row.icsuid,
      accountId: row.accountId,
      calendarId: row.calendarId,
      recurrenceIdStart: shown.isRecurring ? occurrenceSlot(shown) : undefined,
    });
  };

  _onDatabaseChange = ({ objectClass }: DatabaseChangeRecord<Event>) => {
    if (objectClass !== Event.name) return;
    const { shown } = this.state;
    for (const id of [...this._pendingMoves.keys()]) {
      if (id !== shown?.id) this._pendingMoves.delete(id);
    }
    if (shown) this._refreshShown(shown);
    const { inThisEmail } = this.state;
    if (inThisEmail && !(shown && this._isInThisEmail(shown))) {
      this._refreshInThisEmail(inThisEmail);
    }
  };

  async _refreshInThisEmail(pinned: EventOccurrence) {
    const { calendars } = this.state;
    // A series retimed elsewhere gives its occurrences new ids, so it is found again by UID.
    const next =
      (await currentOccurrence(pinned, this._pendingMoves, calendars)) ??
      (this._emailedRef && (await focusedOccurrenceForIcsuid(this._emailedRef, calendars)));
    if (this.state.inThisEmail === pinned) this.setState({ inThisEmail: next });
  }

  /** The shown occurrence's times and exception flags go stale when its row changes. */
  async _refreshShown(shown: EventOccurrence) {
    const next = await currentOccurrence(shown, this._pendingMoves, this.state.calendars);
    if (this.state.shown !== shown || next === shown) return;
    if (!next || panelKey([next]) !== panelKey([shown])) this._eventPanel.current?.commitEdits();
    // Deleted here or elsewhere, its event has nothing left to send the change to.
    const gone = this._leavesUnsentChange(next) && !this._leavesUnsentChange(shown);
    const pinned = this._isInThisEmail(shown) && this.state.inThisEmail;
    this.setState({
      shown: next,
      ...(gone && { unsentChange: null }),
      ...(pinned && next && { inThisEmail: next }),
    });
    if (pinned && !next) this._refreshInThisEmail(pinned);
  }

  render() {
    const { shown, unsentChange } = this.state;
    // Panels stay mounted while hidden; skip the agenda's event query until it's shown.
    if (!this.props.active && !shown) return null;
    const readOnly = shown && this._isCalendarReadOnly(shown.calendarId);
    return (
      <div className="sidebar-calendar-panel">
        <AgendaContainer
          className={classnames('sidebar-agenda-panel', { 'is-covered': !!shown })}
          onEventClick={this._onAgendaEventClick}
          inThisEmail={this.state.inThisEmail}
        />
        {shown && (
          <EventPanel
            ref={this._eventPanel}
            key={panelKey([shown])}
            event={shown}
            unsentChange={isUnsentChangeFor(unsentChange, shown) ? unsentChange : null}
            onUnsentChange={this._onUnsentChange}
            onSendUnsentChange={this._sendUnsentChange}
            onSaveChange={this._writeChange}
            calendar={this.state.calendars.find((c) => c.id === shown.calendarId)}
            isCalendarReadOnly={readOnly}
            onBack={this._onBack}
            onDelete={readOnly ? undefined : () => deleteEvent(shown)}
            conflicts={
              this.state.conflicts?.key === panelKey([shown])
                ? this.state.conflicts.list
                : undefined
            }
            headerActions={
              <button
                className="btn-bare event-panel-view"
                title={localized('View in Calendar')}
                aria-label={localized('View in Calendar')}
                onClick={this._onViewInCalendar}
              >
                <RetinaImg name="ic-calendar-month.png" mode={RetinaImg.Mode.ContentIsMask} />
              </button>
            }
          />
        )}
      </div>
    );
  }
}
