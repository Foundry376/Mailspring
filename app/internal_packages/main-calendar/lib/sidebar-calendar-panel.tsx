import React from 'react';
import classnames from 'classnames';
import { ipcRenderer } from 'electron';
import { Disposable } from 'rx-core';
import {
  Rx,
  Calendar,
  DatabaseStore,
  DatabaseChangeRecord,
  DOMUtils,
  Event,
  WorkspaceStore,
  CalendarUtils,
  localized,
} from 'mailspring-exports';
import { RetinaImg } from 'mailspring-component-kit';
import { AgendaContainer } from './core/agenda-container';
import { EventPanel } from './core/event-panel';
import {
  EventOccurrence,
  currentOccurrence,
  movedOccurrenceId,
  occurrenceSlot,
  panelKey,
} from './core/calendar-data-source';
import { proposeNewEventTime } from './core/calendar-rsvp';
import { ChangeScope, deleteEvent, updateEvent } from './core/recurring-event-actions';
import { UnsentChange, isUnsentChangeFor } from './core/unsent-change';
import { showUnsentChangeDialog } from './core/unsent-change-dialog';

interface SidebarCalendarPanelState {
  shown: EventOccurrence | null;
  unsentChange: UnsentChange | null;
  calendars: Calendar[];
  calendarsLoaded: boolean;
}

/**
 * The calendar as a choice in the thread sidebar's panel switcher: the agenda, with the event
 * panel over it for the event picked there. One event at a time, so the change held for Send
 * update is always the shown event's.
 */
export class SidebarCalendarPanel extends React.Component<
  { active: boolean },
  SidebarCalendarPanelState
> {
  static displayName = 'SidebarCalendarPanel';
  static sidebarPanel = { id: 'calendar', title: localized('Calendar') };

  state: SidebarCalendarPanelState = {
    shown: null,
    unsentChange: null,
    calendars: [],
    calendarsLoaded: false,
  };

  _eventPanel = React.createRef<EventPanel>();
  _pendingMoves = new Map<string, { start: number; staleIcs: string }>();
  _sending: { change: UnsentChange; done: Promise<void> } | null = null;
  _calendarsSubscription?: Disposable;
  _unlistenDatabase?: () => void;

  componentDidMount() {
    this._calendarsSubscription = Rx.Observable.fromQuery(
      DatabaseStore.findAll<Calendar>(Calendar)
    ).subscribe((calendars: Calendar[]) => this.setState({ calendars, calendarsLoaded: true }));
    this._unlistenDatabase = DatabaseStore.listen(this._onDatabaseChange);
    // Captured, so it runs before the window's own undo handler on <body>.
    document.addEventListener('core:undo', this._ignoreUndoWhileHeld, true);
    WorkspaceStore.setSectionLeaveGuard(() => this._mayLeave(null));
    AppEnv.onBeforeUnload(this._onBeforeUnload);
  }

  componentWillUnmount() {
    // Closing the thread or the sidebar can't be stopped, so a held change is sent or dropped.
    this._settleUnsentChange();
    this._calendarsSubscription?.dispose();
    this._unlistenDatabase?.();
    document.removeEventListener('core:undo', this._ignoreUndoWhileHeld, true);
    WorkspaceStore.setSectionLeaveGuard(null);
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

  _onAgendaEventClick = (_e: React.MouseEvent, occurrence: EventOccurrence) => {
    this._show(occurrence);
  };

  _onBack = () => {
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
    this.setState({ shown: { ...occurrence, id } });
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
  };

  /** The shown occurrence's times and exception flags go stale when its row changes. */
  async _refreshShown(shown: EventOccurrence) {
    const next = await currentOccurrence(shown, this._pendingMoves, this.state.calendars);
    if (this.state.shown !== shown || next === shown) return;
    if (!next || panelKey([next]) !== panelKey([shown])) this._eventPanel.current?.commitEdits();
    // Deleted here or elsewhere, its event has nothing left to send the change to.
    const gone = this._leavesUnsentChange(next) && !this._leavesUnsentChange(shown);
    this.setState({ shown: next, ...(gone && { unsentChange: null }) });
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
