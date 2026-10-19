/* eslint react/jsx-no-bind: 0 */
import moment, { Moment } from 'moment-timezone';
import classnames from 'classnames';
import React from 'react';
import {
  ScrollRegion,
  InjectedComponentSet,
  SnapScroller,
  SnapScrollTarget,
} from 'mailspring-component-kit';
import { CalendarDate, CalendarDateUtils } from 'mailspring-exports';
import { HeaderControls } from './header-controls';
import { EventOccurrence } from './calendar-data-source';
import { centerGridScroll } from './calendar-helpers';
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
  exclusiveDayEnds,
  TICKS_PER_DAY,
  tickGenerator,
} from './week-view-helpers';
import { MailspringCalendarViewProps } from './mailspring-calendar';
import { getEventsWithDragPreview, withNewEventPreview } from './calendar-drag-utils';

const MIN_INTERVAL_HEIGHT = 21;
const DAY_PORTION_SHOWN_VERTICALLY = 11 / 24;

function dateOf(m: Moment): CalendarDate {
  return CalendarDateUtils.calendarDateFromUnix(m.unix());
}

function momentOf(date: CalendarDate): Moment {
  return moment.unix(CalendarDateUtils.dayStartUnix(date));
}

function weekStartOf(date: CalendarDate): CalendarDate {
  return dateOf(momentOf(date).startOf('week'));
}

/** Where a view of `days` lines up for `date`: a week's first day, or the date itself. */
function alignedStart(date: CalendarDate, days: number): CalendarDate {
  return days === 7 ? weekStartOf(date) : date;
}

interface TimeGridViewProps extends MailspringCalendarViewProps {
  /** 7 lines up on the week's first day; any other count on the focused day. */
  days: number;
}

interface TimeGridViewState {
  events: EventOccurrence[];
  intervalHeight: number;
  firstVisible: CalendarDate;
  scrollTarget: SnapScrollTarget;
  prevFocusedMoment: Moment;
  adjustedFocus: Moment | null;
}

/** The hour grid behind Week view (7 days) and Day view (1), scrolling sideways through days. */
export class TimeGridView extends React.Component<TimeGridViewProps, TimeGridViewState> {
  static displayName = 'TimeGridView';

  static getDerivedStateFromProps(
    props: TimeGridViewProps,
    state: TimeGridViewState
  ): Partial<TimeGridViewState> | null {
    const { focusedMoment } = props;
    if (focusedMoment === state.prevFocusedMoment) return null;
    if (focusedMoment === state.adjustedFocus) return { prevFocusedMoment: focusedMoment };
    return {
      prevFocusedMoment: focusedMoment,
      scrollTarget: {
        date: alignedStart(dateOf(focusedMoment), props.days),
        animate: !props.focusedEvent,
      },
    };
  }

  _mounted = false;
  _pendingInitialCenter = false;
  _scrollbar = React.createRef<any>();
  _sub?: Disposable;
  _subscribedDays: { first: CalendarDate; end: CalendarDate } | null = null;

  _legendWrapEl = React.createRef<HTMLDivElement>();
  _gridScrollRegion = React.createRef<ScrollRegion>();

  constructor(props: TimeGridViewProps) {
    super(props);
    const start = alignedStart(dateOf(props.focusedMoment), props.days);
    this.state = {
      events: [],
      intervalHeight: MIN_INTERVAL_HEIGHT,
      firstVisible: start,
      scrollTarget: { date: start, animate: false },
      prevFocusedMoment: props.focusedMoment,
      adjustedFocus: null,
    };
  }

  componentDidMount() {
    this._mounted = true;
    // Center after _setIntervalHeight finalizes the grid height (below); centering now
    // uses a too-short scrollHeight and pushes edge-of-day events off-screen.
    this._pendingInitialCenter = true;
    this._subscribe();
    this._setIntervalHeight();
  }

  componentDidUpdate(prevProps: TimeGridViewProps) {
    if (prevProps.disabledCalendars !== this.props.disabledCalendars) {
      this._subscribedDays = null;
      this._subscribe();
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

  _subscribe() {
    const drawn = SnapScroller.drawnFrom(this.state.firstVisible, this.props.days, 'day');
    const drawnEnd = CalendarDateUtils.addCalendarDays(drawn.first, drawn.days);
    const covered = this._subscribedDays;
    if (covered && covered.first <= drawn.first && drawnEnd <= covered.end) {
      return;
    }
    const first = CalendarDateUtils.addCalendarDays(drawn.first, -drawn.days);
    const end = CalendarDateUtils.addCalendarDays(drawnEnd, drawn.days);
    this._subscribedDays = { first, end };

    this._sub && this._sub.dispose();
    this._sub = this.props.dataSource
      .buildObservable({
        disabledCalendars: this.props.disabledCalendars,
        startUnix: CalendarDateUtils.dayStartUnix(first),
        endUnix: CalendarDateUtils.dayStartUnix(end) - 1,
      })
      .subscribe((state) => {
        if (this._mounted) {
          this.setState(state);
        }
      });
  }

  _onFirstVisibleChange = (firstVisible: CalendarDate) => {
    this.setState({ firstVisible }, () => this._subscribe());
  };

  _adjustFocus = (firstVisible: CalendarDate) => {
    const { focusedMoment, days } = this.props;
    const focused = dateOf(focusedMoment);
    const offset = CalendarDateUtils.calendarDaysBetween(firstVisible, focused);
    if (offset >= 0 && offset < days) {
      return;
    }
    const sameWeekdayInView = CalendarDateUtils.addCalendarDays(
      firstVisible,
      ((offset % days) + days) % days
    );
    const adjustedFocus = moment(focusedMoment).add(
      CalendarDateUtils.calendarDaysBetween(focused, sameWeekdayInView),
      'days'
    );
    this.setState({ adjustedFocus });
    this.props.onChangeFocusedMoment(adjustedFocus);
  };

  /** Goes to the nearest week start behind or ahead of the first day in view, or a day in Day view. */
  navigate = (direction: 1 | -1) => {
    const { focusedMoment, days } = this.props;
    const { firstVisible } = this.state;
    const target =
      days === 7
        ? weekStartOf(CalendarDateUtils.addCalendarDays(firstVisible, direction > 0 ? 7 : -1))
        : CalendarDateUtils.addCalendarDays(firstVisible, direction * days);
    const focused = dateOf(focusedMoment);
    const offset = CalendarDateUtils.calendarDaysBetween(target, focused);
    const sameWeekdayThere = CalendarDateUtils.addCalendarDays(
      target,
      ((offset % days) + days) % days
    );
    this.props.onChangeFocusedMoment(
      moment(focusedMoment).add(
        CalendarDateUtils.calendarDaysBetween(focused, sameWeekdayThere),
        'days'
      )
    );
  };

  _onClickToday = () => {
    this.props.onChangeFocusedMoment(this._now());
  };

  _isToday(day: Moment) {
    return day.isSame(this._now(), 'day');
  }

  _centerScrollRegion() {
    centerGridScroll(this._gridScrollRegion.current.viewportEl, this.props.selectedEvents?.[0]);
  }

  _setIntervalHeight = () => {
    if (!this._mounted) {
      return;
    }
    const viewportHeight = this._gridScrollRegion.current.viewportEl.clientHeight;
    this._legendWrapEl.current.style.height = `${viewportHeight}px`;

    this.setState(
      {
        intervalHeight: Math.max(
          viewportHeight / (TICKS_PER_DAY * DAY_PORTION_SHOWN_VERTICALLY),
          MIN_INTERVAL_HEIGHT
        ),
      },
      () => {
        // Resize also calls this; only the initial mount should reposition the scroll.
        if (this._pendingInitialCenter) {
          this._pendingInitialCenter = false;
          this._centerScrollRegion();
        }
      }
    );
  };

  _layout(dayStarts: CalendarDate[]) {
    const events = withNewEventPreview(
      getEventsWithDragPreview(this.state.events, this.props.dragState),
      this.props.newEventPreview
    );
    const days = dayStarts.map(momentOf);
    const eventsByDay = eventsGroupedByDay(events, days);
    const allDayOverlap = overlapForEvents(eventsByDay.allDay);
    const allDayBarHeight = eventsByDay.allDay.length
      ? maxConcurrentEvents(allDayOverlap) * MIN_INTERVAL_HEIGHT + 1
      : 0;
    return { days, eventsByDay, allDayOverlap, allDayBarHeight };
  }

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

  _renderDateLabel = (day: Moment) => {
    const className = classnames({
      'day-label-wrap': true,
      'is-today': this._isToday(day),
    });
    return (
      <div className={className} key={day.valueOf()}>
        <span className="date-label">{day.format('D')}</span>
        <span className="weekday-label">{day.format('ddd')}</span>
      </div>
    );
  };

  _renderDays = (dayStarts: CalendarDate[], firstVisible: CalendarDate) => {
    const { days, eventsByDay, allDayOverlap, allDayBarHeight } = this._layout(dayStarts);
    const dayEnds = exclusiveDayEnds(days);
    const todayColumnIdx = days.findIndex((d) => this._isToday(d));
    const firstVisibleIdx = CalendarDateUtils.calendarDaysBetween(dayStarts[0], firstVisible);
    const totalHeight = TICKS_PER_DAY * this.state.intervalHeight;
    const lastDrawn = dayStarts[dayStarts.length - 1];

    return (
      <div className="time-grid-days">
        <div className="week-header">
          <div className="date-labels">{days.map(this._renderDateLabel)}</div>

          <WeekViewAllDayEvents
            minorDim={MIN_INTERVAL_HEIGHT}
            height={allDayBarHeight}
            start={CalendarDateUtils.dayStartUnix(dayStarts[0])}
            end={CalendarDateUtils.nextDayStartUnix(lastDrawn) - 1}
            allDayEvents={eventsByDay.allDay}
            allDayOverlap={allDayOverlap}
            focusedEvent={this.props.focusedEvent}
            selectedEvents={this.props.selectedEvents}
            onEventClick={this.props.onEventClick}
            onEventDoubleClick={this.props.onEventDoubleClick}
            onEventContextMenu={this.props.onEventContextMenu}
            onEventFocused={this.props.onEventFocused}
            paintVersion={this.props.paintVersion}
            dragState={this.props.dragState}
            onEventDragStart={this.props.onEventDragStart}
            readOnlyCalendarIds={this.props.readOnlyCalendarIds}
          />
        </div>
        <ScrollRegion
          className="event-grid-wrap"
          ref={this._gridScrollRegion}
          scrollbarRef={this._scrollbar}
          onScroll={(event) => (this._legendWrapEl.current.scrollTop = event.target.scrollTop)}
          onViewportResize={this._setIntervalHeight}
        >
          <div className="event-grid" style={{ height: totalHeight }}>
            {days.map((day, dayIdx) => (
              <WeekViewEventColumn
                day={day}
                dayEnd={dayEnds[dayIdx]}
                key={day.valueOf()}
                events={eventsByDay[day.unix()]}
                focusedEvent={this.props.focusedEvent}
                selectedEvents={this.props.selectedEvents}
                onEventClick={this.props.onEventClick}
                onEventDoubleClick={this.props.onEventDoubleClick}
                onEventContextMenu={this.props.onEventContextMenu}
                onEventFocused={this.props.onEventFocused}
                paintVersion={this.props.paintVersion}
                dragState={this.props.dragState}
                onEventDragStart={this.props.onEventDragStart}
                readOnlyCalendarIds={this.props.readOnlyCalendarIds}
              />
            ))}
            <CurrentTimeIndicator
              visible={
                todayColumnIdx >= firstVisibleIdx &&
                todayColumnIdx < firstVisibleIdx + this.props.days
              }
              gridHeight={totalHeight}
              numColumns={days.length}
              todayColumnIdx={todayColumnIdx}
            />
            <EventGridBackground
              height={totalHeight}
              intervalHeight={this.state.intervalHeight}
              numColumns={days.length}
              paintVersion={this.props.paintVersion}
            />
          </div>
        </ScrollRegion>
      </div>
    );
  };

  render() {
    const { days } = this.props;
    const { firstVisible } = this.state;
    const view = days === 1 ? CalendarView.DAY : CalendarView.WEEK;
    const first = momentOf(firstVisible);
    const headerText =
      days === 1
        ? first.format('dddd, MMMM D, YYYY')
        : [
            first.format('MMMM D'),
            momentOf(CalendarDateUtils.addCalendarDays(firstVisible, days - 1)).format(
              'MMMM D YYYY'
            ),
          ].join(' - ');

    const drawn = SnapScroller.drawnFrom(firstVisible, days, 'day');
    const drawnDays = Array.from({ length: drawn.days }, (_, i) =>
      CalendarDateUtils.addCalendarDays(drawn.first, i)
    );
    const { allDayBarHeight } = this._layout(drawnDays);
    const totalHeight = TICKS_PER_DAY * this.state.intervalHeight;

    return (
      <div className={classnames('calendar-view', 'week-view', { 'day-view': days === 1 })}>
        <CalendarEventContainer
          onCalendarMouseUp={this.props.onCalendarMouseUp}
          onCalendarMouseDown={this.props.onCalendarMouseDown}
          onCalendarMouseMove={this.props.onCalendarMouseMove}
          onCalendarClick={this.props.onCalendarClick}
          onCalendarDoubleClick={this.props.onCalendarDoubleClick}
          onCalendarContextMenu={this.props.onCalendarContextMenu}
        >
          <div className="top-banner">
            <InjectedComponentSet matching={{ role: `Calendar:${view}:Banner` }} direction="row" />
          </div>

          <HeaderControls
            title={headerText}
            nextAction={() => this.navigate(1)}
            prevAction={() => this.navigate(-1)}
            onChangeView={this.props.onChangeView}
            disabledViewButton={view}
          >
            <button key="today" className="btn" onClick={this._onClickToday}>
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

            <SnapScroller
              className="calendar-area-wrap"
              axis="horizontal"
              unit="day"
              visibleUnits={days}
              scrollTarget={this.state.scrollTarget}
              renderUnits={this._renderDays}
              onFirstVisibleChange={this._onFirstVisibleChange}
              onScrollEnd={this._adjustFocus}
            />
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
