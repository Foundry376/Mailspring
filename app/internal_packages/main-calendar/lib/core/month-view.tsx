import React from 'react';
import moment, { Moment } from 'moment-timezone';
import { InjectedComponentSet, SnapScroller, SnapScrollTarget } from 'mailspring-component-kit';
import { CalendarDate, CalendarDateUtils } from 'mailspring-exports';
import { MailspringCalendarViewProps } from './mailspring-calendar';
import { CalendarEventContainer } from './calendar-event-container';
import { CalendarView } from './calendar-constants';
import { HeaderControls } from './header-controls';
import CalendarHeaderStore from './calendar-header-store';
import { EventOccurrence, EventRangeSubscription } from './calendar-data-source';
import { MonthViewWeek } from './month-view-week';
import { WeekBarsLayout, firstVisibleBarIds, layoutWeekBars } from './month-view-helpers';
import { getEventsWithDragPreview, withNewEventPreview } from './calendar-drag-utils';
import { momentOf } from './calendar-helpers';

const DAYS_IN_WEEK = 7;
const MAX_VISIBLE_EVENTS = 5;
const VISIBLE_WEEKS = 6;

function monthStartDate(m: Moment): CalendarDate {
  return CalendarDateUtils.calendarDateFromParts(m.year(), m.month() + 1, 1);
}

interface MonthViewState {
  events: EventOccurrence[];
  shownMonth: CalendarDate;
  scrollTarget: SnapScrollTarget;
  prevFocusedMoment: Moment;
  adjustedFocus: Moment | null;
}

export class MonthView extends React.Component<MailspringCalendarViewProps, MonthViewState> {
  static displayName = 'MonthView';

  static getDerivedStateFromProps(
    props: MailspringCalendarViewProps,
    state: MonthViewState
  ): Partial<MonthViewState> | null {
    const { focusedMoment } = props;
    if (focusedMoment === state.prevFocusedMoment) return null;
    if (focusedMoment === state.adjustedFocus) return { prevFocusedMoment: focusedMoment };
    return {
      prevFocusedMoment: focusedMoment,
      scrollTarget: { date: monthStartDate(focusedMoment), animate: !props.focusedEvent },
    };
  }

  _topWeek: CalendarDate;
  _sub: EventRangeSubscription;

  constructor(props: MailspringCalendarViewProps) {
    super(props);
    const month = monthStartDate(props.focusedMoment);
    this._topWeek = CalendarDateUtils.calendarDateFromUnix(
      moment(props.focusedMoment).startOf('month').startOf('week').unix()
    );
    this.state = {
      events: [],
      shownMonth: month,
      scrollTarget: { date: month, animate: false },
      prevFocusedMoment: props.focusedMoment,
      adjustedFocus: null,
    };
    this._sub = new EventRangeSubscription(
      props.dataSource,
      VISIBLE_WEEKS * DAYS_IN_WEEK,
      (events) => this.setState({ events })
    );
  }

  componentDidMount() {
    this._subscribe();
    this._publishHeader();
  }

  componentDidUpdate() {
    this._subscribe();
    this._publishHeader();
  }

  componentWillUnmount() {
    this._sub.dispose();
    CalendarHeaderStore.setViewHeader(null);
  }

  _publishHeader() {
    CalendarHeaderStore.setViewHeader({
      title: this._title(),
      arrows: 'vertical',
      prevAction: this._onClickPrevMonth,
      nextAction: this._onClickNextMonth,
      todayAction: this._onClickToday,
    });
  }

  _title() {
    return momentOf(this.state.shownMonth).format('MMMM YYYY');
  }

  _subscribe() {
    this._sub.cover(
      SnapScroller.drawnFrom(this._topWeek, VISIBLE_WEEKS, 'week'),
      this.props.disabledCalendars
    );
  }

  _onTopWeekChange = (topWeek: CalendarDate) => {
    this._topWeek = topWeek;
    const shownMonth = CalendarDateUtils.monthShownFrom(topWeek, VISIBLE_WEEKS);
    if (shownMonth !== this.state.shownMonth) {
      this.setState({ shownMonth });
    }
    this._subscribe();
  };

  _adjustFocus = (shownMonth: CalendarDate) => {
    const { focusedMoment } = this.props;
    const months = momentOf(shownMonth).diff(moment(focusedMoment).startOf('month'), 'months');
    if (months === 0) {
      return;
    }
    const adjustedFocus = moment(focusedMoment).add(months, 'months');
    this.setState({ adjustedFocus });
    this.props.onChangeFocusedMoment(adjustedFocus);
  };

  _onClickToday = () => {
    this.props.onChangeFocusedMoment(moment());
  };

  _onClickNextMonth = () => {
    const newMoment = moment(this.props.focusedMoment).add(1, 'month');
    this.props.onChangeFocusedMoment(newMoment);
  };

  _onClickPrevMonth = () => {
    const newMoment = moment(this.props.focusedMoment).subtract(1, 'month');
    this.props.onChangeFocusedMoment(newMoment);
  };

  _onDayClick = (day: Moment) => {
    // Navigate to week view centered on this day
    this.props.onChangeFocusedMoment(day);
    this.props.onChangeView(CalendarView.WEEK);
  };

  _renderWeekdayHeaders() {
    const weekdays = moment.weekdaysShort();
    return (
      <div className="month-view-weekday-headers">
        {weekdays.map((day, idx) => (
          <div key={idx} className="month-view-weekday-header">
            {day}
          </div>
        ))}
      </div>
    );
  }

  _renderWeek(
    week: Moment[],
    layout: WeekBarsLayout,
    firstBarIds: Set<string>,
    currentMonth: number
  ) {
    return (
      <MonthViewWeek
        key={week[0].valueOf()}
        days={week}
        layout={layout}
        firstBarIds={firstBarIds}
        currentMonth={currentMonth}
        maxVisibleEvents={MAX_VISIBLE_EVENTS}
        focusedEvent={this.props.focusedEvent}
        selectedEvents={this.props.selectedEvents}
        onEventClick={this.props.onEventClick}
        onEventDoubleClick={this.props.onEventDoubleClick}
        onEventContextMenu={this.props.onEventContextMenu}
        onEventFocused={this.props.onEventFocused}
        onDayClick={this._onDayClick}
        dragState={this.props.dragState}
        onEventDragStart={this.props.onEventDragStart}
        readOnlyCalendarIds={this.props.readOnlyCalendarIds}
      />
    );
  }

  _renderWeeks = (weekStarts: CalendarDate[], topWeek: CalendarDate) => {
    const events = withNewEventPreview(
      getEventsWithDragPreview(this.state.events, this.props.dragState),
      this.props.newEventPreview
    );
    const weeks = weekStarts.map((start) =>
      Array.from({ length: DAYS_IN_WEEK }, (_, i) => CalendarDateUtils.addCalendarDays(start, i))
    );
    const layouts = weeks.map((days) => layoutWeekBars(events, days, MAX_VISIBLE_EVENTS));
    const visibleFrom =
      CalendarDateUtils.calendarDaysBetween(weekStarts[0], topWeek) / DAYS_IN_WEEK;
    const visibleBarIds = firstVisibleBarIds(
      layouts.slice(visibleFrom, visibleFrom + VISIBLE_WEEKS)
    );
    const currentMonth = momentOf(this.state.shownMonth).month();
    return weeks.map((days, idx) =>
      this._renderWeek(
        days.map(momentOf),
        layouts[idx],
        visibleBarIds[idx - visibleFrom] || new Set<string>(),
        currentMonth
      )
    );
  };

  render() {
    return (
      <div className="calendar-view month-view">
        <CalendarEventContainer
          onCalendarMouseUp={this.props.onCalendarMouseUp}
          onCalendarMouseDown={this.props.onCalendarMouseDown}
          onCalendarMouseMove={this.props.onCalendarMouseMove}
          onCalendarClick={this.props.onCalendarClick}
          onCalendarDoubleClick={this.props.onCalendarDoubleClick}
          onCalendarContextMenu={this.props.onCalendarContextMenu}
        >
          <div className="top-banner">
            <InjectedComponentSet matching={{ role: 'Calendar:Week:Banner' }} direction="row" />
          </div>

          <HeaderControls
            title={this._title()}
            view={CalendarView.MONTH}
            nextAction={this._onClickNextMonth}
            prevAction={this._onClickPrevMonth}
            todayAction={this._onClickToday}
            onChangeView={this.props.onChangeView}
            agendaOpen={this.props.agendaOpen}
            onToggleAgenda={this.props.onToggleAgenda}
            arrows="vertical"
          />

          <div className="month-view-grid-container">
            {this._renderWeekdayHeaders()}
            <SnapScroller
              className="month-view-grid"
              axis="vertical"
              unit="week"
              visibleUnits={VISIBLE_WEEKS}
              scrollTarget={this.state.scrollTarget}
              renderUnits={this._renderWeeks}
              onFirstVisibleChange={this._onTopWeekChange}
              onScrollEnd={(topWeek) =>
                this._adjustFocus(CalendarDateUtils.monthShownFrom(topWeek, VISIBLE_WEEKS))
              }
            />
          </div>
        </CalendarEventContainer>
      </div>
    );
  }
}
