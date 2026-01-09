import moment from 'moment';
import React from 'react';
import ReactDOM from 'react-dom';

import { EventOccurrence } from './calendar-data-source';

export interface CalendarEventArgs {
  event?: EventOccurrence;
  time: number;
  x: number;
  y: number;
  width: number;
  height: number;
  mouseIsDown: boolean;
}

interface CalendarEventContainerProps {
  onCalendarMouseDown: (args: CalendarEventArgs) => void;
  onCalendarMouseMove: (args: CalendarEventArgs) => void;
  onCalendarMouseUp: (args: CalendarEventArgs) => void;
}

export class CalendarEventContainer extends React.Component<CalendarEventContainerProps> {
  static displayName = 'CalendarEventContainer';

  _DOMCache: {
    eventColumn?: any;
    gridWrap?: any;
    calWrap?: any;
    calWrapRect?: any;
    rect?: any;
  } = {};

  _mouseIsDown: boolean;

  componentDidMount() {
    window.addEventListener('mouseup', this._onWindowMouseUp);
  }

  componentWillUnmount() {
    window.removeEventListener('mouseup', this._onWindowMouseUp);
  }

  _onCalendarMouseUp = event => {
    this._DOMCache = {};
    if (!this._mouseIsDown) {
      return;
    }
    this._mouseIsDown = false;
    this._runPropsHandler('onCalendarMouseUp', event);
  };

  _onCalendarMouseDown = event => {
    this._DOMCache = {};
    this._mouseIsDown = true;
    this._runPropsHandler('onCalendarMouseDown', event);
  };

  _onCalendarMouseMove = event => {
    this._runPropsHandler('onCalendarMouseMove', event);
  };

  _runPropsHandler(name, event) {
    const propsFn = this.props[name];
    if (!propsFn) {
      return;
    }
    const { time, x, y, width, height } = this._dataFromMouseEvent(event);
    try {
      propsFn({ event, time, x, y, width, height, mouseIsDown: this._mouseIsDown });
    } catch (error) {
      AppEnv.reportError(error);
    }
  }

  _dataFromMouseEvent(event) {
    let x = null;
    let y = null;
    let width = null;
    let height = null;
    let time = null;
    if (!event.target || !event.target.closest) {
      return { x, y, width, height, time };
    }

    // Try week view first
    const weekGridWrap =
      this._DOMCache.gridWrap ||
      event.target.closest('.event-grid-wrap .scroll-region-content-inner');
    const calWrap = this._DOMCache.calWrap || event.target.closest('.calendar-area-wrap');

    // Try month view if week view elements not found
    const monthGrid =
      this._DOMCache.monthGrid || event.target.closest('.month-view-grid');

    if (weekGridWrap && calWrap) {
      // Week view mode
      const rect = this._DOMCache.rect || weekGridWrap.getBoundingClientRect();
      const calWrapRect = this._DOMCache.calWrapRect || calWrap.getBoundingClientRect();

      this._DOMCache = { rect, gridWrap: weekGridWrap, calWrap, calWrapRect };

      y = weekGridWrap.scrollTop + event.clientY - rect.top;
      x = calWrap.scrollLeft + event.clientX - calWrapRect.left;
      width = weekGridWrap.scrollWidth;
      height = weekGridWrap.scrollHeight;

      // Find the event column at the current mouse X position
      let eventColumn = this._findEventColumnAtX(weekGridWrap, event.clientX, calWrapRect);

      if (!eventColumn) {
        eventColumn = event.target.closest('.event-column');
      }

      if (!eventColumn) {
        return { x, y, width, height, time };
      }

      const percentDay = y / height;
      const diff = +eventColumn.dataset.end - +eventColumn.dataset.start;
      time = moment(diff * percentDay + +eventColumn.dataset.start);
      return { x, y, width, height, time };
    } else if (monthGrid) {
      // Month view mode
      const rect = this._DOMCache.rect || monthGrid.getBoundingClientRect();
      this._DOMCache = { rect, monthGrid };

      x = event.clientX - rect.left;
      y = event.clientY - rect.top;
      width = rect.width;
      height = rect.height;

      // Find the day cell at the current mouse position
      const dayCell = this._findMonthDayCellAtPosition(monthGrid, event.clientX, event.clientY);

      if (dayCell) {
        // Get the day from the cell's data or compute from position
        const dayStart = parseInt(dayCell.dataset.dayStart, 10);
        if (dayStart) {
          time = moment.unix(dayStart).startOf('day');
        }
      }

      return { x, y, width, height, time };
    }

    return { x, y, width, height, time };
  }

  /**
   * Find the month view day cell at the given position.
   */
  _findMonthDayCellAtPosition(
    monthGrid: Element,
    clientX: number,
    clientY: number
  ): HTMLElement | null {
    const cells = monthGrid.querySelectorAll('.month-view-day-cell');
    for (const cell of cells) {
      const cellRect = cell.getBoundingClientRect();
      if (
        clientX >= cellRect.left &&
        clientX < cellRect.right &&
        clientY >= cellRect.top &&
        clientY < cellRect.bottom
      ) {
        return cell as HTMLElement;
      }
    }
    return null;
  }

  /**
   * Find the event column element that contains the given X position.
   * This enables horizontal dragging between day columns.
   */
  _findEventColumnAtX(gridWrap: Element, clientX: number, calWrapRect: DOMRect): Element | null {
    const columns = gridWrap.querySelectorAll('.event-column');
    for (const column of columns) {
      const colRect = column.getBoundingClientRect();
      if (clientX >= colRect.left && clientX < colRect.right) {
        return column;
      }
    }
    return null;
  }

  _onWindowMouseUp = event => {
    if (ReactDOM.findDOMNode(this).contains(event.target)) {
      return;
    }
    this._onCalendarMouseUp(event);
  };

  render() {
    return (
      <div
        className="calendar-mouse-handler"
        onMouseUp={this._onCalendarMouseUp}
        onMouseDown={this._onCalendarMouseDown}
        onMouseMove={this._onCalendarMouseMove}
      >
        {this.props.children}
      </div>
    );
  }
}
