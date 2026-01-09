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

    // Cache gridWrap and calWrap, but NOT eventColumn - we need to recalculate
    // eventColumn on each mouse move to support horizontal dragging between days
    const gridWrap =
      this._DOMCache.gridWrap ||
      event.target.closest('.event-grid-wrap .scroll-region-content-inner');
    const calWrap = this._DOMCache.calWrap || event.target.closest('.calendar-area-wrap');

    if (!gridWrap || !calWrap) {
      return { x, y, width, height, time };
    }

    const rect = this._DOMCache.rect || gridWrap.getBoundingClientRect();
    const calWrapRect = this._DOMCache.calWrapRect || calWrap.getBoundingClientRect();

    // Cache only the non-changing elements
    this._DOMCache = { rect, gridWrap, calWrap, calWrapRect };

    y = gridWrap.scrollTop + event.clientY - rect.top;
    x = calWrap.scrollLeft + event.clientX - calWrapRect.left;
    width = gridWrap.scrollWidth;
    height = gridWrap.scrollHeight;

    // Find the event column at the current mouse X position
    // We can't just use event.target.closest because during dragging the target
    // might be the drag preview or the event being dragged, not the column
    let eventColumn = this._findEventColumnAtX(gridWrap, event.clientX, calWrapRect);

    if (!eventColumn) {
      // Fallback: try to find via event.target
      eventColumn = event.target.closest('.event-column');
    }

    if (!eventColumn) {
      return { x, y, width, height, time };
    }

    const percentDay = y / height;
    const diff = +eventColumn.dataset.end - +eventColumn.dataset.start;
    time = moment(diff * percentDay + +eventColumn.dataset.start);
    return { x, y, width, height, time };
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
