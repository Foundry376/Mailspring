import React from 'react';
import { DragState, ViewDirection } from './calendar-drag-types';
import { calcColor } from './calendar-helpers';
import { formatDragPreviewTime } from './calendar-drag-utils';

interface CalendarEventDragPreviewProps {
  /** Current drag state */
  dragState: DragState;

  /** Direction of the view (vertical for week, horizontal for month) */
  direction: ViewDirection;

  /** Start of the visible scope (unix timestamp) */
  scopeStart: number;

  /** End of the visible scope (unix timestamp) */
  scopeEnd: number;

  /** Whether to show the time tooltip */
  showTimeTooltip?: boolean;
}

/**
 * Renders a ghost preview of the event during drag operations.
 * This shows where the event will end up when the user releases the mouse.
 */
export class CalendarEventDragPreview extends React.Component<CalendarEventDragPreviewProps> {
  static displayName = 'CalendarEventDragPreview';

  static defaultProps = {
    showTimeTooltip: true,
  };

  _getDimensions() {
    const { dragState, scopeStart, scopeEnd } = this.props;
    const scopeLen = scopeEnd - scopeStart;
    const duration = dragState.previewEnd - dragState.previewStart;

    // Calculate position as percentage of scope
    let top: number | string = Math.max((dragState.previewStart - scopeStart) / scopeLen, 0);
    let height: number | string = Math.min(duration / scopeLen, 1);

    // Handle overflow (event starts before scope)
    const overflowBefore = Math.max(scopeStart - dragState.previewStart, 0);
    if (overflowBefore > 0) {
      height = Math.min((duration - overflowBefore) / scopeLen, 1);
    }

    top = `${top * 100}%`;
    height = `${height * 100}%`;

    return { top, height };
  }

  _getStyles(): React.CSSProperties {
    const { direction, dragState } = this.props;
    const dims = this._getDimensions();
    const color = calcColor(dragState.event.calendarId);

    let styles: React.CSSProperties = {
      position: 'absolute',
      pointerEvents: 'none',
      zIndex: 1000,
      opacity: 0.7,
      border: `2px dashed ${color}`,
      backgroundColor: color,
      borderRadius: 3,
      overflow: 'hidden',
    };

    if (direction === 'vertical') {
      styles.top = dims.top;
      styles.height = dims.height;
      styles.left = 0;
      styles.right = 0;
    } else {
      // Horizontal: swap dimensions
      styles.left = dims.top;
      styles.width = dims.height;
      styles.top = 0;
      styles.bottom = 0;
    }

    return styles;
  }

  _renderTimeTooltip() {
    const { dragState, showTimeTooltip } = this.props;

    if (!showTimeTooltip) {
      return null;
    }

    const timeString = formatDragPreviewTime(
      dragState.previewStart,
      dragState.previewEnd,
      dragState.event.isAllDay
    );

    return <div className="drag-preview-time-tooltip">{timeString}</div>;
  }

  render() {
    const { dragState } = this.props;

    // Don't render if not actively dragging
    if (!dragState.isDragging) {
      return null;
    }

    return (
      <div className="calendar-event-drag-preview" style={this._getStyles()}>
        <span className="drag-preview-title">{dragState.event.title}</span>
        {this._renderTimeTooltip()}
      </div>
    );
  }
}
