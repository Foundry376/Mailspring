import React, { CSSProperties } from 'react';
import ReactDOM from 'react-dom';
import { InjectedComponentSet } from 'mailspring-component-kit';
import { EventOccurrence } from './calendar-data-source';
import { calcEventColors, extractMeetingDomain, formatEventTimeRange } from './calendar-helpers';
import { HitZone, ViewDirection } from './calendar-drag-types';
import { detectHitZone, canDragEvent, formatDragPreviewTime } from './calendar-drag-utils';

interface CalendarEventProps {
  event: EventOccurrence;
  order: number;
  selected: boolean;
  scopeEnd: number;
  scopeStart: number;
  direction: 'horizontal' | 'vertical';
  fixedSize: number;
  focused: boolean;
  concurrentEvents: number;

  /** Whether this event is currently being dragged */
  isDragging?: boolean;

  /** Size of the edge zone for resize detection (in pixels) */
  edgeZoneSize?: number;

  /** Whether the calendar containing this event is read-only */
  isCalendarReadOnly?: boolean;

  onClick: (e: React.MouseEvent<any>, event: EventOccurrence) => void;
  onDoubleClick: (event: EventOccurrence) => void;
  onFocused: (event: EventOccurrence) => void;

  /** Called when a drag operation starts on this event */
  onDragStart?: (
    event: EventOccurrence,
    mouseEvent: React.MouseEvent,
    hitZone: HitZone,
    mouseTime: number
  ) => void;
}

interface CalendarEventState {
  hitZone: HitZone | null;
}

export class CalendarEvent extends React.Component<CalendarEventProps, CalendarEventState> {
  static displayName = 'CalendarEvent';

  static defaultProps = {
    order: 1,
    direction: 'vertical',
    fixedSize: -1,
    concurrentEvents: 1,
    isDragging: false,
    edgeZoneSize: 12,
    isCalendarReadOnly: false,
    onClick: () => {},
    onDoubleClick: () => {},
    onFocused: () => {},
  };

  state: CalendarEventState = {
    hitZone: null,
  };

  componentDidMount() {
    this._scrollFocusedEventIntoView();
  }

  componentDidUpdate() {
    this._scrollFocusedEventIntoView();
  }

  _scrollFocusedEventIntoView() {
    const { focused } = this.props;
    if (!focused) {
      return;
    }
    const eventNode = ReactDOM.findDOMNode(this);
    if (!eventNode) {
      return;
    }
    const { event, onFocused } = this.props;
    (eventNode as any).scrollIntoViewIfNeeded(true);
    onFocused(event);
  }

  _getDimensions() {
    const scopeLen = this.props.scopeEnd - this.props.scopeStart;
    const duration = this.props.event.end - this.props.event.start;

    let top: number | string = Math.max(
      (this.props.event.start - this.props.scopeStart) / scopeLen,
      0
    );
    let height: number | string = Math.min((duration - this._overflowBefore()) / scopeLen, 1);

    let width: number | string = 1;
    let left: number | string;
    if (this.props.fixedSize === -1) {
      width = 1 / this.props.concurrentEvents;
      left = width * (this.props.order - 1);
      width = `${width * 100}%`;
      left = `${left * 100}%`;
    } else {
      width = this.props.fixedSize;
      left = this.props.fixedSize * (this.props.order - 1);
    }

    top = `${top * 100}%`;
    height = `${height * 100}%`;

    return { left, width, height, top };
  }

  _getStyles() {
    let styles: CSSProperties & { '--event-band-color'?: string; '--event-text-color'?: string } =
      {};
    if (this.props.direction === 'vertical') {
      styles = this._getDimensions();
    } else if (this.props.direction === 'horizontal') {
      const d = this._getDimensions();
      styles = {
        left: d.top,
        width: d.height,
        height: d.width,
        top: d.left,
      };
    }
    const colors = calcEventColors(this.props.event.calendarId);
    // Set CSS custom property for the left band color
    styles['--event-band-color'] = colors.band;
    styles['--event-text-color'] = colors.text;

    if (this.props.event.isCancelled) {
      // Cancelled events get a transparent background with colored border
      styles.backgroundColor = 'transparent';
      styles.borderColor = colors.band;
    } else if (this.props.event.isPending) {
      // Pending events get a gray background with theme-colored left band
      styles.backgroundColor = 'rgba(128, 128, 128, 0.15)';
    } else {
      // Apple Calendar-style: light pastel background
      styles.backgroundColor = colors.background;
    }
    return styles;
  }

  _overflowBefore() {
    return Math.max(this.props.scopeStart - this.props.event.start, 0);
  }

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
      this.props.direction as ViewDirection
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
   * Calculate the time at the mouse position within this event's scope
   */
  _getMouseTime(e: React.MouseEvent<HTMLDivElement>): number {
    const bounds = e.currentTarget.getBoundingClientRect();
    const { scopeStart, scopeEnd, direction } = this.props;
    const scopeLen = scopeEnd - scopeStart;

    let percent: number;
    if (direction === 'vertical') {
      // Vertical layout: Y position determines time
      percent = (e.clientY - bounds.top) / bounds.height;
    } else {
      // Horizontal layout: X position determines time
      percent = (e.clientX - bounds.left) / bounds.width;
    }

    // Clamp to [0, 1] and calculate time
    percent = Math.max(0, Math.min(1, percent));
    const eventDuration = this.props.event.end - this.props.event.start;
    return this.props.event.start + percent * eventDuration;
  }

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

    // Calculate the time at the click position within this event
    const mouseTime = this._getMouseTime(e);

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

  _renderTimeTooltip() {
    const { event } = this.props;
    if (!event.isDragPreview) {
      return null;
    }
    const timeString = formatDragPreviewTime(event.start, event.end, event.isAllDay);
    return <div className="drag-preview-time-tooltip">{timeString}</div>;
  }

  /**
   * Render additional event details for vertical (week view) events:
   * - Meeting URL domain (e.g., "zoom.us")
   * - Time range for events >= 1 hour (e.g., "12 – 1PM")
   */
  _renderEventDetails() {
    const { event, direction } = this.props;

    // Only show details for vertical (week view) events
    if (direction !== 'vertical') {
      return null;
    }

    const meetingDomain = extractMeetingDomain(event.location, event.description);
    const timeRange = formatEventTimeRange(event.start, event.end, event.isAllDay);

    if (!meetingDomain && !timeRange) {
      return null;
    }

    return (
      <div className="event-details">
        {meetingDomain && (
          <span className="event-meeting-link">
            <span className="meeting-icon">▢</span> {meetingDomain}
          </span>
        )}
        {timeRange && (
          <span className="event-time-range">
            <span className="time-icon">◷</span> {timeRange}
          </span>
        )}
      </div>
    );
  }

  render() {
    const { direction, event, onClick, onDoubleClick, selected, isDragging } = this.props;

    const classNames = [
      'calendar-event',
      direction,
      selected && 'selected',
      event.isCancelled && 'cancelled',
      event.isPending && 'pending',
      event.isException && 'exception',
      isDragging && 'dragging',
      this._canDrag() && 'draggable',
      event.isDragPreview && 'drag-preview',
    ]
      .filter(Boolean)
      .join(' ');

    const styles = {
      ...this._getStyles(),
      cursor: this._getCursorStyle(),
    };

    // Drag preview events are not interactive
    if (event.isDragPreview) {
      return (
        <div style={styles} className={classNames}>
          <span className="default-header" style={{ order: 0 }}>
            {event.title}
          </span>
          {this._renderTimeTooltip()}
        </div>
      );
    }

    return (
      <div
        id={event.id}
        tabIndex={0}
        style={styles}
        className={classNames}
        onClick={e => onClick(e, event)}
        onDoubleClick={() => onDoubleClick(event)}
        onMouseMove={this._onMouseMove}
        onMouseLeave={this._onMouseLeave}
        onMouseDown={this._onMouseDown}
      >
        <span className="default-header" style={{ order: 0 }}>
          {event.isCancelled ? <s>{event.title}</s> : event.title}
        </span>
        {this._renderEventDetails()}
        {event.isException && <span className="exception-tag">Modified</span>}
        <InjectedComponentSet
          className="event-injected-components"
          style={{ position: 'absolute' }}
          matching={{ role: 'Calendar:Event' }}
          exposedProps={{ event: event }}
          direction="row"
        />
      </div>
    );
  }
}
