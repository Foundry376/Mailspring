import React from 'react';
import ReactDOM from 'react-dom';
import classnames from 'classnames';
import { EventOccurrence } from './calendar-data-source';
import { calcEventColors } from './calendar-helpers';
import { HitZone } from './calendar-drag-types';
import { detectHitZone, canDragEvent, formatDragPreviewTime } from './calendar-drag-utils';

interface MonthViewEventProps {
  event: EventOccurrence;
  selected: boolean;
  focused: boolean;
  isDragging?: boolean;
  edgeZoneSize?: number;
  /** Whether the calendar containing this event is read-only */
  isCalendarReadOnly?: boolean;
  onClick: (e: React.MouseEvent<any>, event: EventOccurrence) => void;
  onDoubleClick: (event: EventOccurrence) => void;
  onFocused: (event: EventOccurrence) => void;
  onDragStart?: (
    event: EventOccurrence,
    mouseEvent: React.MouseEvent,
    hitZone: HitZone,
    mouseTime: number
  ) => void;
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
  };

  state: MonthViewEventState = {
    hitZone: null,
  };

  componentDidMount() {
    this._scrollFocusedEventIntoView();
  }

  componentDidUpdate() {
    this._scrollFocusedEventIntoView();
  }

  _scrollFocusedEventIntoView() {
    const { focused, event, onFocused } = this.props;
    if (!focused) {
      return;
    }
    const eventNode = ReactDOM.findDOMNode(this);
    if (!eventNode) {
      return;
    }
    (eventNode as any).scrollIntoViewIfNeeded?.(true);
    onFocused(event);
  }

  _onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    this.props.onClick(e, this.props.event);
  };

  _onDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    this.props.onDoubleClick(this.props.event);
  };

  /**
   * Check if this event can be dragged
   */
  _canDrag(): boolean {
    // Drag preview events are not interactive
    if (this.props.event.isDragPreview) {
      return false;
    }
    return (
      canDragEvent(this.props.event, this.props.isCalendarReadOnly) && !!this.props.onDragStart
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
    const hitZone = detectHitZone(
      e.clientX,
      e.clientY,
      bounds,
      this.props.edgeZoneSize,
      'horizontal'
    );

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

    // Prevent text selection during drag
    e.preventDefault();
    // Note: Don't call stopPropagation() - the event needs to bubble to
    // CalendarEventContainer so it can track _mouseIsDown state

    // For month view events, use the event's start time as the mouse time
    // since day-level snapping doesn't require precise time positioning
    const mouseTime = this.props.event.start;

    // Notify parent of drag start
    if (this.props.onDragStart) {
      this.props.onDragStart(this.props.event, e, this.state.hitZone, mouseTime);
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

  render() {
    const { event, selected, isDragging } = this.props;
    const colors = calcEventColors(event.calendarId);

    const className = classnames('month-view-event', {
      selected: selected,
      'is-all-day': event.isAllDay,
      pending: event.isPending,
      dragging: isDragging,
      draggable: this._canDrag(),
      'drag-preview': event.isDragPreview,
    });

    const style: React.CSSProperties & {
      '--event-band-color'?: string;
      '--event-text-color'?: string;
    } = {
      backgroundColor: event.isPending ? 'rgba(128, 128, 128, 0.15)' : colors.background,
      '--event-band-color': colors.band,
      '--event-text-color': colors.text,
      cursor: this._getCursorStyle(),
    };

    // Drag preview events render differently - non-interactive with time tooltip
    if (event.isDragPreview) {
      const timeString = formatDragPreviewTime(event.start, event.end, event.isAllDay);
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
        onMouseMove={this._onMouseMove}
        onMouseLeave={this._onMouseLeave}
        onMouseDown={this._onMouseDown}
        tabIndex={0}
      >
        <span className="month-view-event-title">{event.title}</span>
      </div>
    );
  }
}
