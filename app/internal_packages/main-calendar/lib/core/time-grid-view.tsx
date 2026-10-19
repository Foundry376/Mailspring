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
import { EventOccurrence, EventRangeSubscription, isTimed } from './calendar-data-source';
import { centerGridScroll } from './calendar-helpers';
import { EventGridBackground } from './event-grid-background';
import { WeekViewEventColumn } from './week-view-event-column';
import { WeekViewAllDayEvents } from './week-view-all-day-events';
import { CalendarEventContainer } from './calendar-event-container';
import { CurrentTimeIndicator } from './current-time-indicator';
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
const QUERY_MARGIN_DAYS = 21;

function dateOf(m: Moment): CalendarDate {
  return CalendarDateUtils.calendarDateFromUnix(m.unix());
}

function momentOf(date: CalendarDate): Moment {
  return moment.unix(CalendarDateUtils.dayStartUnix(date));
}

function weekStartOf(date: CalendarDate): CalendarDate {
  return CalendarDateUtils.weekStartOf(date, moment.localeData().firstDayOfWeek());
}

function alignedStart(date: CalendarDate, visibleDays: number): CalendarDate {
  return visibleDays === 7 ? weekStartOf(date) : date;
}

/** The focused moment moved into the span starting `start`, onto its weekday and keeping its time. */
function moveFocusInto(focusedMoment: Moment, start: CalendarDate, visibleDays: number): Moment {
  const focused = dateOf(focusedMoment);
  const offset = CalendarDateUtils.calendarDaysBetween(start, focused);
  const inSpan = CalendarDateUtils.addCalendarDays(
    start,
    ((offset % visibleDays) + visibleDays) % visibleDays
  );
  return moment(focusedMoment).add(CalendarDateUtils.calendarDaysBetween(focused, inSpan), 'days');
}

interface TimeGridViewProps extends MailspringCalendarViewProps {
  /** 7 lines up on the week's first day; 1 on the focused day. */
  visibleDays: 1 | 7;
}

interface TimeGridViewState {
  events: EventOccurrence[];
  intervalHeight: number;
  firstVisible: CalendarDate;
  scrollTarget: SnapScrollTarget;
  prevFocusedMoment: Moment;
  adjustedFocus: Moment | null;
}

/** The hour grid behind Week view (7 days) and Day view (1). */
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
        date: alignedStart(dateOf(focusedMoment), props.visibleDays),
        animate: !props.focusedEvent,
      },
    };
  }

  _mounted = false;
  _pendingInitialCenter = false;
  _scrollbar = React.createRef<any>();
  _sub: EventRangeSubscription;
  _scroller = React.createRef<SnapScroller>();

  _legendWrapEl = React.createRef<HTMLDivElement>();
  _gridScrollRegion = React.createRef<ScrollRegion>();

  constructor(props: TimeGridViewProps) {
    super(props);
    const start = alignedStart(dateOf(props.focusedMoment), props.visibleDays);
    this.state = {
      events: [],
      intervalHeight: MIN_INTERVAL_HEIGHT,
      firstVisible: start,
      scrollTarget: { date: start, animate: false },
      prevFocusedMoment: props.focusedMoment,
      adjustedFocus: null,
    };
    this._sub = new EventRangeSubscription(props.dataSource, QUERY_MARGIN_DAYS, (events) =>
      this.setState({ events })
    );
  }

  componentDidMount() {
    this._mounted = true;
    // Center after _setIntervalHeight finalizes the grid height (below); centering now
    // uses a too-short scrollHeight and pushes edge-of-day events off-screen.
    this._pendingInitialCenter = true;
    this._subscribe();
    this._setIntervalHeight();
  }

  componentDidUpdate() {
    this._subscribe();
  }

  componentWillUnmount() {
    this._mounted = false;
    this._sub.dispose();
  }

  // Indirection for testing purposes
  _now() {
    return moment();
  }

  _subscribe() {
    this._sub.cover(
      SnapScroller.drawnFrom(this.state.firstVisible, this.props.visibleDays, 'day'),
      this.props.disabledCalendars
    );
  }

  _onFirstVisibleChange = (firstVisible: CalendarDate) => {
    this.setState({ firstVisible });
  };

  _adjustFocus = (firstVisible: CalendarDate) => {
    const { focusedMoment, visibleDays } = this.props;
    const offset = CalendarDateUtils.calendarDaysBetween(firstVisible, dateOf(focusedMoment));
    if (offset >= 0 && offset < visibleDays) {
      return;
    }
    const adjustedFocus = moveFocusInto(focusedMoment, firstVisible, visibleDays);
    this.setState({ adjustedFocus });
    this.props.onChangeFocusedMoment(adjustedFocus);
  };

  /** Goes to the nearest week start behind or ahead of where the strip is headed, or a day in Day view. */
  navigate = (direction: 1 | -1) => {
    const { focusedMoment, visibleDays } = this.props;
    const from = this._scroller.current.headedTo();
    const target =
      visibleDays === 7
        ? weekStartOf(CalendarDateUtils.addCalendarDays(from, direction > 0 ? 7 : -1))
        : CalendarDateUtils.addCalendarDays(from, direction);
    this.props.onChangeFocusedMoment(moveFocusInto(focusedMoment, target, visibleDays));
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

  _eventsWithPreviews() {
    return withNewEventPreview(
      getEventsWithDragPreview(this.state.events, this.props.dragState),
      this.props.newEventPreview
    );
  }

  /** The all-day lanes for the days drawn around `firstVisible`, which the legend and strip share. */
  _allDay(events: EventOccurrence[], firstVisible: CalendarDate) {
    const drawn = SnapScroller.drawnFrom(firstVisible, this.props.visibleDays, 'day');
    const allDayEvents = events.filter(
      (e) => !isTimed(e) && e.startDate < drawn.end && e.endDate >= drawn.first
    );
    const allDayOverlap = overlapForEvents(allDayEvents);
    const allDayBarHeight = allDayEvents.length
      ? maxConcurrentEvents(allDayOverlap) * MIN_INTERVAL_HEIGHT + 1
      : 0;
    return { allDayEvents, allDayOverlap, allDayBarHeight };
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
    const events = this._eventsWithPreviews();
    const days = dayStarts.map(momentOf);
    const eventsByDay = eventsGroupedByDay(events, days);
    const { allDayEvents, allDayOverlap, allDayBarHeight } = this._allDay(events, firstVisible);
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
            allDayEvents={allDayEvents}
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
                todayColumnIdx < firstVisibleIdx + this.props.visibleDays
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
    const { visibleDays } = this.props;
    const { firstVisible } = this.state;
    const view = visibleDays === 1 ? CalendarView.DAY : CalendarView.WEEK;
    const first = momentOf(firstVisible);
    const headerText =
      visibleDays === 1
        ? first.format('dddd, MMMM D, YYYY')
        : [
            first.format('MMMM D'),
            momentOf(CalendarDateUtils.addCalendarDays(firstVisible, visibleDays - 1)).format(
              'MMMM D YYYY'
            ),
          ].join(' - ');
    const { allDayBarHeight } = this._allDay(this._eventsWithPreviews(), firstVisible);
    const totalHeight = TICKS_PER_DAY * this.state.intervalHeight;

    return (
      <div className={classnames('calendar-view', 'week-view', { 'day-view': visibleDays === 1 })}>
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
              ref={this._scroller}
              className="calendar-area-wrap"
              axis="horizontal"
              unit="day"
              visibleUnits={visibleDays}
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
