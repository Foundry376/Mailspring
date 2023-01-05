/* eslint react/jsx-no-bind: 0 */
import _ from 'underscore';
import moment, { Moment } from 'moment-timezone';
import classnames from 'classnames';
import React from 'react';
import { ScrollRegion, InjectedComponentSet } from 'mailspring-component-kit';
import { HeaderControls } from './header-controls';
import { EventOccurrence } from './calendar-data-source';
import { EventGridBackground } from './event-grid-background';
import { WeekViewEventColumn } from './week-view-event-column';
import { WeekViewAllDayEvents } from './week-view-all-day-events';
import { CalendarEventContainer } from './calendar-event-container';
import { CurrentTimeIndicator } from './current-time-indicator';
import { Disposable } from 'rx-core';
import { CalendarView } from './calendar-constants';
import {
  overlapForEvents,
  maxConcurrentEvents,
  eventsGroupedByDay,
  TICKS_PER_DAY,
  tickGenerator,
} from './week-view-helpers';
import { MailspringCalendarViewProps } from './mailspring-calendar';

const BUFFER_DAYS = 7; // in each direction
const DAYS_IN_VIEW = 7;
const MIN_INTERVAL_HEIGHT = 21;
const DAY_PORTION_SHOWN_VERTICALLY = 11 / 24;

export class WeekView extends React.Component<
  MailspringCalendarViewProps,
  { intervalHeight: number; events: EventOccurrence[] }
> {
  static displayName = 'WeekView';

  _waitingForShift = 0;
  _mounted = false;
  _scrollbar = React.createRef<any>();
  _sub?: Disposable;

  _legendWrapEl = React.createRef<HTMLDivElement>();
  _calendarWrapEl = React.createRef<HTMLDivElement>();
  _gridScrollRegion = React.createRef<ScrollRegion>();

  constructor(props) {
    super(props);
    this.state = {
      events: [],
      intervalHeight: MIN_INTERVAL_HEIGHT,
    };
  }

  componentDidMount() {
    this._mounted = true;
    this._centerScrollRegion();

    // Shift ourselves right by a week because we preload 7 days on either side
    const wrap = this._calendarWrapEl.current;
    wrap.scrollLeft += wrap.clientWidth;

    this.updateSubscription();
    this._setIntervalHeight();
  }

  componentDidUpdate(prevProps) {
    if (this._waitingForShift) {
      const wrap = this._calendarWrapEl.current;
      wrap.scrollLeft += this._waitingForShift;
      this._waitingForShift = 0;
    }
    if (
      prevProps.focusedMoment !== this.props.focusedMoment ||
      prevProps.disabledCalendars !== this.props.disabledCalendars
    ) {
      this.updateSubscription();
    }
  }

  componentWillUnmount() {
    this._mounted = false;
    this._sub && this._sub.dispose();
  }

  // Indirection for testing purposes
  _now() {
    return moment();
  }

  updateSubscription() {
    const { bufferedStart, bufferedEnd } = this._calculateMomentRange();

    this._sub && this._sub.dispose();
    this._sub = this.props.dataSource
      .buildObservable({
        disabledCalendars: this.props.disabledCalendars,
        startUnix: bufferedStart.unix(),
        endUnix: bufferedEnd.unix(),
      })
      .subscribe(state => {
        this.setState(state);
      });
  }

  _calculateMomentRange() {
    const { focusedMoment } = this.props;

    // NOTE: Since we initialize a new time from one of the properties of
    // the props.focusedMoment, we need to check for the timezone!
    //
    // Other relative operations (like adding or subtracting time) are
    // independent of a timezone.
    const tz = focusedMoment.tz();
    const start = (tz ? moment.tz([focusedMoment.year()], tz) : moment([focusedMoment.year()]))
      .weekday(0)
      .week(focusedMoment.week());

    const end = start
      .clone()
      .add(DAYS_IN_VIEW, 'days')
      .subtract(1, 'millisecond');

    return {
      visibleStart: start,
      visibleEnd: end,

      bufferedStart: start.clone().subtract(BUFFER_DAYS, 'days'),
      bufferedEnd: moment(end)
        .add(BUFFER_DAYS, 'days')
        .subtract(1, 'millisecond'),
    };
  }

  _renderDateLabel = (day: Moment, idx: number) => {
    const className = classnames({
      'day-label-wrap': true,
      'is-today': this._isToday(day),
      'is-hard-stop': day.weekday() == 1,
    });
    return (
      <div className={className} key={idx}>
        <span className="date-label">{day.format('D')}</span>
        <span className="weekday-label">{day.format('ddd')}</span>
      </div>
    );
  };

  _isToday(day) {
    const todayYear = this._now().year();
    const todayDayOfYear = this._now().dayOfYear();

    return todayDayOfYear === day.dayOfYear() && todayYear === day.year();
  }

  _daysInView() {
    const { bufferedStart } = this._calculateMomentRange();
    const days: Moment[] = [];
    for (let i = 0; i < DAYS_IN_VIEW + BUFFER_DAYS * 2; i++) {
      // moment::weekday is locale aware since some weeks start on diff
      // days. See http://momentjs.com/docs/#/get-set/weekday/
      days.push(moment(bufferedStart).weekday(i));
    }
    return days;
  }

  _onClickToday = () => {
    this.props.onChangeFocusedMoment(this._now());
  };

  _onClickNextWeek = () => {
    const newMoment = moment(this.props.focusedMoment).add(1, 'week');
    this.props.onChangeFocusedMoment(newMoment);
  };

  _onClickPrevWeek = () => {
    const newMoment = moment(this.props.focusedMoment).subtract(1, 'week');
    this.props.onChangeFocusedMoment(newMoment);
  };

  _centerScrollRegion() {
    const wrap = this._gridScrollRegion.current.viewportEl;
    wrap.scrollTop = wrap.scrollHeight / 2 - wrap.clientHeight / 2;
  }

  _setIntervalHeight = () => {
    if (!this._mounted) {
      return;
    }
    const viewportHeight = this._gridScrollRegion.current.viewportEl.clientHeight;
    this._legendWrapEl.current.style.height = `${viewportHeight}px`;

    this.setState({
      intervalHeight: Math.max(
        viewportHeight / (TICKS_PER_DAY * DAY_PORTION_SHOWN_VERTICALLY),
        MIN_INTERVAL_HEIGHT
      ),
    });
  };

  _onScrollCalendarArea = (event: React.UIEvent) => {
    console.log(event.currentTarget.scrollLeft);
    // if (!event.currentTarget.scrollLeft || this._waitingForShift) {
    //   return;
    // }

    // const edgeWidth = (event.currentTarget.clientWidth / DAYS_IN_VIEW) * 2;

    // if (event.currentTarget.scrollLeft < edgeWidth) {
    //   this._waitingForShift = event.currentTarget.clientWidth;
    //   this._onClickPrevWeek();
    // } else if (
    //   event.currentTarget.scrollLeft >
    //   event.currentTarget.scrollWidth - event.currentTarget.clientWidth - edgeWidth
    // ) {
    //   this._waitingForShift = -event.currentTarget.clientWidth;
    //   this._onClickNextWeek();
    // }
  };

  _renderEventGridLabels() {
    const labels = [];
    for (const { time, y } of tickGenerator('major', this.state.intervalHeight)) {
      labels.push(
        <span className="legend-text" key={y} style={{ top: y === 0 ? y : y - 8 }}>
          {time.format('LT')}
        </span>
      );
    }
    return labels.slice(0, labels.length - 1);
  }

  _bufferRatio() {
    return (BUFFER_DAYS * 2 + DAYS_IN_VIEW) / DAYS_IN_VIEW;
  }

  render() {
    const days = this._daysInView();
    const eventsByDay = eventsGroupedByDay(this.state.events, days);
    const todayColumnIdx = days.findIndex(d => this._isToday(d));
    const totalHeight = TICKS_PER_DAY * this.state.intervalHeight;

    const range = this._calculateMomentRange();

    const headerText = [
      range.visibleStart.format('MMMM D'),
      range.visibleEnd.format('MMMM D YYYY'),
    ].join(' - ');

    const allDayOverlap = overlapForEvents(eventsByDay.allDay);
    const allDayBarHeight = eventsByDay.allDay.length
      ? maxConcurrentEvents(allDayOverlap) * MIN_INTERVAL_HEIGHT + 1
      : 0;

    return (
      <div className="calendar-view week-view">
        <CalendarEventContainer
          onCalendarMouseUp={this.props.onCalendarMouseUp}
          onCalendarMouseDown={this.props.onCalendarMouseDown}
          onCalendarMouseMove={this.props.onCalendarMouseMove}
        >
          <div className="top-banner">
            <InjectedComponentSet matching={{ role: 'Calendar:Week:Banner' }} direction="row" />
          </div>

          <HeaderControls
            title={headerText}
            nextAction={this._onClickNextWeek}
            prevAction={this._onClickPrevWeek}
            onChangeView={this.props.onChangeView}
            disabledViewButton={CalendarView.WEEK}
          >
            <button
              key="today"
              className="btn"
              onClick={this._onClickToday}
              style={{ position: 'absolute', left: 10 }}
            >
              Today
            </button>
          </HeaderControls>

          <div className="calendar-body-wrap">
            <div className="calendar-legend">
              <div className="date-label-legend" style={{ height: allDayBarHeight + 75 + 1 }}>
                <span className="legend-text">All Day</span>
              </div>
              <div className="event-grid-legend-wrap" ref={this._legendWrapEl}>
                <div className="event-grid-legend" style={{ height: totalHeight }}>
                  {this._renderEventGridLabels()}
                </div>
              </div>
            </div>

            <div
              className="calendar-area-wrap"
              ref={this._calendarWrapEl}
              onScroll={this._onScrollCalendarArea}
            >
              <div className="week-header" style={{ width: `${this._bufferRatio() * 100}%` }}>
                <div className="date-labels">{days.map(this._renderDateLabel)}</div>

                <WeekViewAllDayEvents
                  minorDim={MIN_INTERVAL_HEIGHT}
                  height={allDayBarHeight}
                  start={range.bufferedStart.unix()}
                  end={range.bufferedEnd.unix()}
                  allDayEvents={eventsByDay.allDay}
                  allDayOverlap={allDayOverlap}
                  focusedEvent={this.props.focusedEvent}
                  selectedEvents={this.props.selectedEvents}
                  onEventClick={this.props.onEventClick}
                  onEventDoubleClick={this.props.onEventDoubleClick}
                  onEventFocused={this.props.onEventFocused}
                />
              </div>
              <ScrollRegion
                className="event-grid-wrap"
                ref={this._gridScrollRegion}
                scrollbarRef={this._scrollbar}
                onScroll={event => (this._legendWrapEl.current.scrollTop = event.target.scrollTop)}
                onViewportResize={this._setIntervalHeight}
                style={{ width: `${this._bufferRatio() * 100}%` }}
              >
                <div className="event-grid" style={{ height: totalHeight }}>
                  {days.map(day => (
                    <WeekViewEventColumn
                      day={day}
                      dayEnd={day.unix() + 24 * 60 * 60 - 1}
                      key={day.valueOf()}
                      events={eventsByDay[day.unix()]}
                      focusedEvent={this.props.focusedEvent}
                      selectedEvents={this.props.selectedEvents}
                      onEventClick={this.props.onEventClick}
                      onEventDoubleClick={this.props.onEventDoubleClick}
                      onEventFocused={this.props.onEventFocused}
                    />
                  ))}
                  <CurrentTimeIndicator
                    visible={
                      todayColumnIdx > BUFFER_DAYS && todayColumnIdx <= BUFFER_DAYS + DAYS_IN_VIEW
                    }
                    gridHeight={totalHeight}
                    numColumns={BUFFER_DAYS * 2 + DAYS_IN_VIEW}
                    todayColumnIdx={todayColumnIdx}
                  />
                  <EventGridBackground
                    height={totalHeight}
                    intervalHeight={this.state.intervalHeight}
                    numColumns={BUFFER_DAYS * 2 + DAYS_IN_VIEW}
                  />
                </div>
              </ScrollRegion>
            </div>
            <ScrollRegion.Scrollbar
              ref={this._scrollbar}
              getScrollRegion={() => this._gridScrollRegion.current}
            />
          </div>
        </CalendarEventContainer>
      </div>
    );
  }
}
