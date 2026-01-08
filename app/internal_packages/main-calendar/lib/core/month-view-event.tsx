import React from 'react';
import ReactDOM from 'react-dom';
import classnames from 'classnames';
import { EventOccurrence } from './calendar-data-source';
import { calcColor } from './calendar-helpers';
import { HitZone, DragState } from './calendar-drag-types';
import { detectHitZone, canDragEvent } from './calendar-drag-utils';

interface MonthViewEventProps {
  event: EventOccurrence;
  selected: boolean;
  focused: boolean;
  isDragging?: boolean;
  edgeZoneSize?: number;
  onClick: (e: React.MouseEvent<any>, event: EventOccurrence) => void;
  onDoubleClick: (event: EventOccurrence) => void;
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
    edgeZoneSize: 8,
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
  _canDrag() {
    return canDragEvent(this.props.event) && !!this.props.onDragStart;
  }

  /**
   * Handle mouse move to detect hit zones for resize handles
   */
  _onMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!this._canDrag()) {
      return;
    }

    const bounds = e.currentTarget.getBoundingClientRect();
    const hitZone = detectHitZone(
      e.clientX,
      e.clientY,
      bounds,
      this.props.edgeZoneSize!,
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
    e.stopPropagation();

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

  render() {
    const { event, selected, isDragging } = this.props;
    const backgroundColor = calcColor(event.calendarId);

    const className = classnames('month-view-event', {
      selected: selected,
      'is-all-day': event.isAllDay,
      dragging: isDragging,
      draggable: this._canDrag(),
    });

    const style: React.CSSProperties = {
      backgroundColor,
      cursor: this._getCursorStyle(),
    };

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
