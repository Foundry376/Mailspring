import React from 'react';
import ReactDOM from 'react-dom';
import classnames from 'classnames';
import { localized } from 'mailspring-exports';
import {
  EventOccurrence,
  isTimed,
  occurrenceStartUnix,
  occurrenceEndUnix,
} from './calendar-data-source';
import { calcEventColors, formatShortTime } from './calendar-helpers';
import { HitZone } from './calendar-drag-types';
import { detectHitZone, canAttemptMove, formatDragPreviewTime } from './calendar-drag-utils';

interface MonthViewEventProps {
  event: EventOccurrence;
  selected: boolean;
  focused: boolean;
  /** Whether the event began in an earlier week row, so this bar's start edge is a cut. */
  continuesBefore?: boolean;
  /** Whether the event goes on into a later week row. */
  continuesAfter?: boolean;
  /**
   * Whether this is the event's first bar on screen. Only it is a Tab stop and announces focus,
   * so an event drawn across two rows is visited and opened once.
   */
  isFirstBar?: boolean;
  isDragging?: boolean;
  edgeZoneSize?: number;
  /** Whether the calendar containing this event is read-only */
  isCalendarReadOnly?: boolean;
  onClick: (e: React.MouseEvent<any>, event: EventOccurrence) => void;
  onDoubleClick: (event: EventOccurrence) => void;
  onContextMenu?: (event: EventOccurrence) => void;
  onFocused: (event: EventOccurrence) => void;
  onDragStart?: (event: EventOccurrence, mouseEvent: React.MouseEvent, hitZone: HitZone) => void;
}

interface MonthViewEventState {
  hitZone: HitZone | null;
}

export class MonthViewEvent extends React.Component<MonthViewEventProps, MonthViewEventState> {
  static displayName = 'MonthViewEvent';

  static defaultProps = {
    isDragging: false,
    edgeZoneSize: 12,
    isCalendarReadOnly: false,
    continuesBefore: false,
    continuesAfter: false,
    isFirstBar: true,
  };

  state: MonthViewEventState = {
    hitZone: null,
  };

  componentDidMount() {
    this._revealOnFocusGained(false);
    this._takeFocusIfSelected();
  }

  componentDidUpdate(prevProps: MonthViewEventProps) {
    this._revealOnFocusGained(prevProps.focused);
    this._takeFocusIfSelected();
  }

  // See CalendarEvent._takeFocusIfSelected.
  _takeFocusIfSelected() {
    if (
      !this.props.selected ||
      !this.props.isFirstBar ||
      document.activeElement !== document.body
    ) {
      return;
    }
    (ReactDOM.findDOMNode(this) as HTMLElement | null)?.focus({ preventScroll: true });
  }

  // Announce focus only as it arrives: onFocused opens the card and the reveal scrolls to it, so
  // doing both on every update reopens the card and jumps the grid on any re-render.
  _revealOnFocusGained(wasFocused: boolean) {
    const { focused, event, onFocused, isFirstBar } = this.props;
    if (!focused || wasFocused || !isFirstBar) {
      return;
    }
    const eventNode = ReactDOM.findDOMNode(this);
    if (!eventNode) {
      return;
    }
    // centerIfNeeded false: scroll the minimum distance to reveal it, not to the middle.
    (eventNode as any).scrollIntoViewIfNeeded?.(false);
    onFocused(event);
  }

  _onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    this.props.onClick(e, this.props.event);
  };

  _onContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.preventDefault();
    if (this.props.onContextMenu) {
      this.props.onContextMenu(this.props.event);
    }
  };

  _onDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    this.props.onDoubleClick(this.props.event);
  };

  /**
   * Check if this event can be dragged
   */
  _canDrag(): boolean {
    return (
      canAttemptMove(this.props.event, this.props.isCalendarReadOnly) && !!this.props.onDragStart
    );
  }

  /**
   * Handle mouse move to detect hit zones for resize handles
   */
  _onMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!this._canDrag() || !this.props.edgeZoneSize) {
      return;
    }

    const bounds = e.currentTarget.getBoundingClientRect();
    let hitZone = detectHitZone(
      e.clientX,
      e.clientY,
      bounds,
      this.props.edgeZoneSize,
      'horizontal'
    );
    // A cut edge at the end of a week row is not one of the event's ends, so it only moves it.
    if (
      (hitZone.mode === 'resize-start' && this.props.continuesBefore) ||
      (hitZone.mode === 'resize-end' && this.props.continuesAfter)
    ) {
      hitZone = { mode: 'move', cursor: 'grab' };
    }

    // Only update state if hit zone changed
    if (!this.state.hitZone || this.state.hitZone.mode !== hitZone.mode) {
      this.setState({ hitZone });
    }
  };

  /**
   * Clear hit zone on mouse leave
   */
  _onMouseLeave = () => {
    if (this.state.hitZone) {
      this.setState({ hitZone: null });
    }
  };

  /**
   * Initiate drag on mouse down
   */
  _onMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!this._canDrag() || !this.state.hitZone) {
      return;
    }

    // Only handle left mouse button
    if (e.button !== 0) {
      return;
    }

    // Prevent text selection during drag. That also stops the browser focusing the event, so take
    // focus here; preventScroll keeps a half-hidden event under the pointer for the drag.
    e.preventDefault();
    e.currentTarget.focus({ preventScroll: true });
    // Note: Don't call stopPropagation() - the event needs to bubble to
    // CalendarEventContainer so it can track _mouseIsDown state

    // Notify parent of drag start
    if (this.props.onDragStart) {
      this.props.onDragStart(this.props.event, e, this.state.hitZone);
    }
  };

  /**
   * Get cursor style based on current hit zone
   */
  _getCursorStyle(): string {
    if (!this._canDrag()) {
      return 'default';
    }
    if (this.state.hitZone) {
      return this.state.hitZone.cursor;
    }
    return 'default';
  }

  // One-day timed chips go bare, as in Apple and Notion Calendar; all-day chips and anything
  // spanning days keep the tint so they read as a bar. Selection fills either through CSS.
  _backgroundColor(tint: string) {
    const { event } = this.props;
    if (event.isPending) {
      return 'rgba(128, 128, 128, 0.15)';
    }
    return event.isAllDay || event.endDate > event.startDate ? tint : 'transparent';
  }

  render() {
    const { event, selected, isDragging, continuesBefore, continuesAfter } = this.props;
    const colors = calcEventColors(event.calendarId);

    const className = classnames('month-view-event', {
      selected: selected,
      'is-all-day': event.isAllDay,
      pending: event.isPending,
      dragging: isDragging,
      draggable: this._canDrag(),
      'drag-preview': event.isDragPreview,
      'continues-before': continuesBefore,
      'continues-after': continuesAfter,
    });

    const style: React.CSSProperties & {
      '--event-band-color'?: string;
      '--event-text-color'?: string;
      '--event-selected-text-color'?: string;
    } = {
      backgroundColor: this._backgroundColor(colors.background),
      '--event-band-color': colors.band,
      '--event-text-color': colors.text,
      '--event-selected-text-color': colors.selectedText,
      cursor: this._getCursorStyle(),
    };

    // Drag preview events render differently - non-interactive with time tooltip
    if (event.isDragPreview) {
      const timeString = formatDragPreviewTime(
        occurrenceStartUnix(event),
        occurrenceEndUnix(event),
        event.isAllDay
      );
      return (
        <div className={className} style={style}>
          <span className="month-view-event-title">{event.title}</span>
          <span className="drag-preview-time-tooltip">{timeString}</span>
        </div>
      );
    }

    return (
      <div
        id={event.id}
        className={className}
        style={style}
        onClick={this._onClick}
        onDoubleClick={this._onDoubleClick}
        onContextMenu={this._onContextMenu}
        onMouseMove={this._onMouseMove}
        onMouseLeave={this._onMouseLeave}
        onMouseDown={this._onMouseDown}
        tabIndex={this.props.isFirstBar ? 0 : -1}
      >
        <span className="month-view-event-title">
          {!continuesBefore && isTimed(event) && (
            <span className="month-view-event-time">{formatShortTime(event.start)} </span>
          )}
          {event.title}
        </span>
        {!continuesAfter && isTimed(event) && event.endDate > event.startDate && (
          <span className="month-view-event-end-time">
            {localized('ends %@', formatShortTime(event.end))}
          </span>
        )}
      </div>
    );
  }
}
