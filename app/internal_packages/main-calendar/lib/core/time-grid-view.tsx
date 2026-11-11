/* eslint react/jsx-no-bind: 0 */
import moment, { Moment } from 'moment-timezone';
import classnames from 'classnames';
import React from 'react';
import {
  ScrollRegion,
  InjectedComponentSet,
  SnapScroller,
  SnapScrollTarget,
  withSmallMeridiem,
} from 'mailspring-component-kit';
import { CalendarDate, CalendarDateUtils } from 'mailspring-exports';
import CalendarHeaderStore from './calendar-header-store';
import VisibleRangeStore from './visible-range-store';
import {
  EventOccurrence,
  EventRangeSubscription,
  inAllDayRow,
  isTimed,
} from './calendar-data-source';
import {
  DayPlacement,
  centerGridScroll,
  dateOf,
  formatShortTime,
  momentOf,
} from './calendar-helpers';
import { EventGridBackground } from './event-grid-background';
import { WeekViewEventColumn } from './week-view-event-column';
import { WeekViewAllDayEvents } from './week-view-all-day-events';
import { CalendarEventContainer } from './calendar-event-container';
import { CurrentTimeIndicator, CurrentTimeLabel, EachMinute } from './current-time-indicator';
import { BAR_HEIGHT, CalendarView, EVENT_GAP } from './calendar-constants';
import {
  overlapForEvents,
  columnSpan,
  DAY_DUR,
  drawnInGrid,
  eventsGroupedByDay,
  exclusiveDayEnds,
  TICKS_PER_DAY,
  tickGenerator,
  dayFraction,
} from './week-view-helpers';
import { MailspringCalendarViewProps } from './mailspring-calendar';
import { getEventsWithDragPreview, withNewEventPreview } from './calendar-drag-utils';
import { withUnsentChange } from './unsent-change';
import { WeekdayHeader } from './weekday-header';

const ALL_DAY_LANE_HEIGHT = BAR_HEIGHT + EVENT_GAP;
// Half an hour at its smallest: a 30-minute event holds one 14px line, a 45-minute one two.
const MIN_INTERVAL_HEIGHT = 24;
const DATE_LABELS_HEIGHT = 28;
// Half the current-time pill plus half an hour label: nearer than this, the two overlap.
const CURRENT_TIME_LABEL_CLEARANCE = 14;
const QUERY_MARGIN_DAYS = 21;

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
  firstVisible: CalendarDate;
  scrollTarget: SnapScrollTarget;
  prevFocusedMoment: Moment;
  adjustedFocus: Moment | null;
  /** Half an hour's height: the minimum, or more so the day fills a taller viewport. */
  intervalHeight: number;
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
  _pendingInitialCenter = true;
  _scrollbar = React.createRef<any>();
  _sub: EventRangeSubscription;
  _dayChange?: { dispose(): void };
  _scroller = React.createRef<SnapScroller>();

  _legendWrapEl = React.createRef<HTMLDivElement>();
  _gridScrollRegion = React.createRef<ScrollRegion>();

  constructor(props: TimeGridViewProps) {
    super(props);
    const start = alignedStart(dateOf(props.focusedMoment), props.visibleDays);
    this.state = {
      events: [],
      firstVisible: start,
      scrollTarget: { date: start, animate: false },
      prevFocusedMoment: props.focusedMoment,
      adjustedFocus: null,
      intervalHeight: MIN_INTERVAL_HEIGHT,
    };
    this._sub = new EventRangeSubscription(props.dataSource, QUERY_MARGIN_DAYS, (events) =>
      this.setState({ events })
    );
  }

  componentDidMount() {
    this._mounted = true;
    this._subscribe();
    this._fitViewport();
    this._publishNavigation();
    // Today's column, the current-time line and its pill are worked out as the view renders.
    this._dayChange = CalendarDateUtils.onDayChange(dateOf(this._now()), () => this.forceUpdate());
  }

  componentDidUpdate() {
    this._subscribe();
    this._publishNavigation();
  }

  componentWillUnmount() {
    this._mounted = false;
    this._sub.dispose();
    this._dayChange?.dispose();
    CalendarHeaderStore.setViewNavigation(null);
    VisibleRangeStore.setVisibleRange(null);
  }

  _publishNavigation() {
    VisibleRangeStore.setVisibleRange({
      first: this.state.firstVisible,
      days: this.props.visibleDays,
    });
    CalendarHeaderStore.setViewNavigation({
      arrows: 'horizontal',
      prevAction: this._onClickPrev,
      nextAction: this._onClickNext,
      todayAction: this._onClickToday,
    });
  }

  _onClickPrev = () => this.navigate(-1);
  _onClickNext = () => this.navigate(1);

  /** Names the month holding the middle day, as Month view does, so a split week takes the one with more days. */
  _title() {
    const { visibleDays } = this.props;
    const middle = CalendarDateUtils.addCalendarDays(
      this.state.firstVisible,
      Math.floor(visibleDays / 2)
    );
    return momentOf(middle).format('MMMM YYYY');
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

  /** The events on the days shown, for the arrow keys: the all-day row's lanes, then the hours. */
  dayPlacements(): DayPlacement[] {
    const { firstVisible } = this.state;
    const events = withUnsentChange(this.state.events, this.props.unsentChange);
    const dayStarts = Array.from({ length: this.props.visibleDays }, (_, i) =>
      CalendarDateUtils.addCalendarDays(firstVisible, i)
    );
    const days = dayStarts.map(momentOf);
    const dayEnds = exclusiveDayEnds(days);
    const placements: DayPlacement[] = [];

    const { allDayEvents, allDayOverlap } = this._allDay(events, firstVisible);
    dayStarts.forEach((date, day) => {
      for (const occurrence of allDayEvents) {
        if (occurrence.startDate <= date && occurrence.endDate >= date) {
          placements.push({ occurrence, day, rank: allDayOverlap[occurrence.id].order - DAY_DUR });
        }
      }
    });

    const eventsByDay = eventsGroupedByDay(events, days, this._inRow);
    days.forEach((d, day) => {
      const column = { start: d.unix(), end: dayEnds[day] };
      const timed = eventsByDay[d.unix()].filter(isTimed);
      const overlap = overlapForEvents(timed, column);
      for (const occurrence of timed) {
        // Side by side at the same start, left before right.
        const rank = columnSpan(occurrence, column).top + (overlap[occurrence.id].order - 1) / 100;
        placements.push({ occurrence, day, rank });
      }
    });
    return placements;
  }

  /** An hour up or down. */
  scrollHours(direction: 1 | -1) {
    const viewportEl = this._gridScrollRegion.current?.viewportEl;
    if (viewportEl) viewportEl.scrollTop += direction * 2 * this.state.intervalHeight;
  }

  _isToday(day: Moment) {
    return day.isSame(this._now(), 'day');
  }

  _centerScrollRegion() {
    centerGridScroll(this._gridScrollRegion.current.viewportEl, this.props.selectedEvents?.[0]);
  }

  _fitViewport = () => {
    if (!this._mounted) {
      return;
    }
    const viewportHeight = this._gridScrollRegion.current.viewportEl.clientHeight;
    this._legendWrapEl.current.style.height = `${viewportHeight}px`;
    const intervalHeight = Math.max(MIN_INTERVAL_HEIGHT, viewportHeight / TICKS_PER_DAY);
    // The whole day shows, so there's nothing to centre.
    if (viewportHeight >= TICKS_PER_DAY * MIN_INTERVAL_HEIGHT) this._pendingInitialCenter = false;
    if (intervalHeight !== this.state.intervalHeight) this.setState({ intervalHeight });
    this._centerOnceSized();
  };

  // Once, when there's something to centre: the view mounts behind Mail after a reload, and the
  // day columns draw after the first render.
  _centerOnceSized = () => {
    const viewportEl = this._gridScrollRegion.current?.viewportEl;
    if (!this._pendingInitialCenter || !viewportEl) return;
    if (viewportEl.clientHeight > 0 && viewportEl.scrollHeight > viewportEl.clientHeight) {
      this._pendingInitialCenter = false;
      this._centerScrollRegion();
    }
  };

  _eventsWithPreviews() {
    return withNewEventPreview(
      getEventsWithDragPreview(
        withUnsentChange(this.state.events, this.props.unsentChange),
        this.props.dragState
      ),
      this.props.newEventPreview
    );
  }

  /** Whether the all-day row draws it; a new event's draft stays in the grid until it's created. */
  _inRow = (e: EventOccurrence) => {
    if (!isTimed(e)) return true;
    if (!inAllDayRow(e)) return false;
    const { dragState, heldInGridEventId } = this.props;
    if (!e.isDragPreview) return !drawnInGrid(e, heldInGridEventId);
    if (!dragState || e.originalEventId !== dragState.event.id) return false;
    const { event, containerType } = dragState;
    return !drawnInGrid(event, heldInGridEventId) || containerType === 'all-day-area';
  };

  /** The all-day lanes for the days drawn around `firstVisible`, which the legend and strip share. */
  _allDay(events: EventOccurrence[], firstVisible: CalendarDate) {
    const drawn = SnapScroller.drawnFrom(firstVisible, this.props.visibleDays, 'day');
    const allDayEvents = events.filter(
      (e) => this._inRow(e) && e.startDate < drawn.end && e.endDate >= drawn.first
    );
    const allDayOverlap = overlapForEvents(allDayEvents);
    // Tall enough for the lanes the days on screen use, not the drawn days either side; an empty
    // row keeps one lane, so "All Day" sits below the headings.
    const visibleEnd = CalendarDateUtils.addCalendarDays(firstVisible, this.props.visibleDays);
    const lanes = allDayEvents
      .filter((e) => e.startDate < visibleEnd && e.endDate >= firstVisible)
      .map((e) => allDayOverlap[e.id].order);
    const allDayBarHeight = Math.max(1, ...lanes) * ALL_DAY_LANE_HEIGHT + EVENT_GAP + 1;
    return { allDayEvents, allDayOverlap, allDayBarHeight };
  }

  _renderEventGridLabels(currentTimeY: number | null) {
    const labels = [];
    for (const { time, y } of tickGenerator(this.state.intervalHeight)) {
      // Centred on its line, except midnight's, which sits below the top edge.
      const top = y === 0 ? y : y - 8;
      if (
        currentTimeY !== null &&
        Math.abs(top + 8 - currentTimeY) < CURRENT_TIME_LABEL_CLEARANCE
      ) {
        labels.push(null);
        continue;
      }
      labels.push(
        <span className="legend-text" key={y} style={{ top }}>
          {withSmallMeridiem(formatShortTime(time.unix()))}
        </span>
      );
    }
    return labels.slice(0, labels.length - 1);
  }

  _renderDateLabel = (day: Moment) => (
    <WeekdayHeader key={day.valueOf()} day={day} isToday={this._isToday(day)} showDate />
  );

  _renderDays = (dayStarts: CalendarDate[], firstVisible: CalendarDate) => {
    const events = this._eventsWithPreviews();
    const days = dayStarts.map(momentOf);
    const eventsByDay = eventsGroupedByDay(events, days, this._inRow);
    const { allDayEvents, allDayOverlap, allDayBarHeight } = this._allDay(events, firstVisible);
    const dayEnds = exclusiveDayEnds(days);
    const todayColumnIdx = days.findIndex((d) => this._isToday(d));
    const firstVisibleIdx = CalendarDateUtils.calendarDaysBetween(dayStarts[0], firstVisible);
    const totalHeight = TICKS_PER_DAY * this.state.intervalHeight;
    const lastDrawn = dayStarts[dayStarts.length - 1];

    return (
      <div className="time-grid-days">
        <div className="week-header" style={{ paddingTop: DATE_LABELS_HEIGHT }}>
          <div className="date-labels">{days.map(this._renderDateLabel)}</div>

          <WeekViewAllDayEvents
            minorDim={ALL_DAY_LANE_HEIGHT}
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
          onViewportResize={this._fitViewport}
          onContentResize={this._centerOnceSized}
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
    const { allDayBarHeight } = this._allDay(this._eventsWithPreviews(), firstVisible);
    const totalHeight = TICKS_PER_DAY * this.state.intervalHeight;
    const todayOffset = CalendarDateUtils.calendarDaysBetween(firstVisible, dateOf(this._now()));

    return (
      <div
        className={classnames('calendar-view', 'week-view', { 'day-view': visibleDays === 1 })}
        tabIndex={-1}
      >
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

          <div className="calendar-title">{this._title()}</div>
          <div className="calendar-body-wrap">
            <div className="calendar-legend">
              <div
                className="date-label-legend"
                style={{ height: allDayBarHeight + DATE_LABELS_HEIGHT + 1 }}
              >
                <div className="all-day-legend" style={{ top: DATE_LABELS_HEIGHT }}>
                  <span className="legend-text">All Day</span>
                </div>
              </div>
              <div className="event-grid-legend-wrap" ref={this._legendWrapEl}>
                <div className="event-grid-legend" style={{ height: totalHeight }}>
                  <EachMinute>
                    {(now) => {
                      const currentTimeY =
                        todayOffset >= 0 && todayOffset < visibleDays
                          ? totalHeight * dayFraction(now)
                          : null;
                      return (
                        <>
                          {this._renderEventGridLabels(currentTimeY)}
                          {currentTimeY !== null && <CurrentTimeLabel now={now} y={currentTimeY} />}
                        </>
                      );
                    }}
                  </EachMinute>
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
