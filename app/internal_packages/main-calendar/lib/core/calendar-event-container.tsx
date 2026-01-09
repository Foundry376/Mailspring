import React from 'react';
import ReactDOM from 'react-dom';

import { EventOccurrence } from './calendar-data-source';
import { CalendarContainerType } from './calendar-drag-types';

export interface CalendarEventArgs {
  event?: EventOccurrence;
  /** Unix timestamp at mouse position, or null if not over a valid time container */
  time: number | null;
  x: number | null;
  y: number | null;
  width: number | null;
  height: number | null;
  mouseIsDown: boolean;
  /** The type of calendar container the mouse is over (determines snap resolution) */
  containerType: CalendarContainerType | null;
}

interface CalendarEventContainerProps {
  onCalendarMouseDown: (args: CalendarEventArgs) => void;
  onCalendarMouseMove: (args: CalendarEventArgs) => void;
  onCalendarMouseUp: (args: CalendarEventArgs) => void;
}

export class CalendarEventContainer extends React.Component<CalendarEventContainerProps> {
  static displayName = 'CalendarEventContainer';

  // Simplified cache: just the scroll container and its rect for offset calculations
  _DOMCache: {
    scrollContainer?: HTMLElement;
    scrollContainerRect?: DOMRect;
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
    const { time, x, y, width, height, containerType } = this._dataFromMouseEvent(event);
    try {
      propsFn({ event, time, x, y, width, height, mouseIsDown: this._mouseIsDown, containerType });
    } catch (error) {
      AppEnv.reportError(error);
    }
  }

  /**
   * Extract time and position data from a mouse event using unified data attributes.
   * Uses [data-calendar-start], [data-calendar-end], and [data-calendar-type] to
   * identify time containers across all calendar views.
   */
  _dataFromMouseEvent(event) {
    let x = null;
    let y = null;
    let width = null;
    let height = null;
    let time = null;
    let containerType: CalendarContainerType | null = null;

    if (!event.target || !event.target.closest) {
      return { x, y, width, height, time, containerType };
    }

    // Find the nearest time container using the unified data attribute
    const timeContainer = event.target.closest('[data-calendar-start]') as HTMLElement;
    if (!timeContainer) {
      return { x, y, width, height, time, containerType };
    }

    containerType = timeContainer.dataset.calendarType as CalendarContainerType;
    const startTime = parseInt(timeContainer.dataset.calendarStart, 10);
    const endTime = parseInt(timeContainer.dataset.calendarEnd, 10);
    const rect = timeContainer.getBoundingClientRect();

    // Validate parsed time values - if invalid, return early with position data only
    if (isNaN(startTime) || isNaN(endTime)) {
      return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
        width: rect.width,
        height: rect.height,
        time,
        containerType,
      };
    }

    // Get scroll container for offset calculations (week view needs this)
    const scrollContainer =
      this._DOMCache.scrollContainer ||
      (event.target.closest('.calendar-area-wrap') as HTMLElement);
    const scrollContainerRect =
      this._DOMCache.scrollContainerRect ||
      (scrollContainer ? scrollContainer.getBoundingClientRect() : null);

    if (scrollContainer && scrollContainerRect) {
      this._DOMCache = { scrollContainer, scrollContainerRect };
    }

    switch (containerType) {
      case 'day-column': {
        // Week view timed events: calculate time from Y position within the column
        const gridWrap = timeContainer.parentElement;
        if (gridWrap) {
          y = gridWrap.scrollTop + event.clientY - rect.top;
          height = gridWrap.scrollHeight;
        } else {
          y = event.clientY - rect.top;
          height = rect.height;
        }
        x =
          scrollContainer && scrollContainerRect
            ? scrollContainer.scrollLeft + event.clientX - scrollContainerRect.left
            : event.clientX - rect.left;
        width = rect.width;

        // Calculate time as percentage through the day
        const percentDay = Math.max(0, Math.min(1, y / height));
        const timeOffset = (endTime - startTime) * percentDay;
        time = startTime + timeOffset;
        break;
      }

      case 'all-day-area': {
        // Week view all-day events: calculate day from X position
        x =
          scrollContainer && scrollContainerRect
            ? scrollContainer.scrollLeft + event.clientX - scrollContainerRect.left
            : event.clientX - rect.left;
        y = event.clientY - rect.top;
        width = rect.width;
        height = rect.height;

        // Calculate which day based on X position as percentage of the week
        const percentWeek = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
        const numDays = Math.ceil((endTime - startTime) / 86400); // seconds per day
        const dayIndex = Math.min(Math.floor(percentWeek * numDays), numDays - 1);
        time = startTime + dayIndex * 86400;
        break;
      }

      case 'month-cell': {
        // Month view: the container IS the day, just use its start time
        x = event.clientX - rect.left;
        y = event.clientY - rect.top;
        width = rect.width;
        height = rect.height;
        time = startTime;
        break;
      }

      default: {
        // Unknown container type, return what we have
        x = event.clientX - rect.left;
        y = event.clientY - rect.top;
        width = rect.width;
        height = rect.height;
        break;
      }
    }

    return { x, y, width, height, time, containerType };
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
