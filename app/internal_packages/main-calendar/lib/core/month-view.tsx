import React from 'react';
import moment, { Moment } from 'moment-timezone';
import { InjectedComponentSet } from 'mailspring-component-kit';
import { MailspringCalendarViewProps } from './mailspring-calendar';
import { CalendarEventContainer } from './calendar-event-container';
import { CalendarView } from './calendar-constants';
import { HeaderControls } from './header-controls';
import { EventOccurrence } from './calendar-data-source';
import { Disposable } from 'rx-core';
import { MonthViewDayCell } from './month-view-day-cell';
import { getEventsWithDragPreview } from './calendar-drag-utils';

const DAYS_IN_WEEK = 7;
const MAX_VISIBLE_EVENTS = 5;

interface MonthViewState {
  events: EventOccurrence[];
}

export class MonthView extends React.Component<MailspringCalendarViewProps, MonthViewState> {
  static displayName = 'MonthView';

  _mounted = false;
  _sub?: Disposable;

  constructor(props: MailspringCalendarViewProps) {
    super(props);
    this.state = {
      events: [],
    };
  }

  componentDidMount() {
    this._mounted = true;
    this.updateSubscription();
  }

  componentDidUpdate(prevProps: MailspringCalendarViewProps) {
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

  updateSubscription() {
    const { monthStart, monthEnd } = this._calculateMonthRange();

    this._sub && this._sub.dispose();
    this._sub = this.props.dataSource
      .buildObservable({
        disabledCalendars: this.props.disabledCalendars,
        startUnix: monthStart.unix(),
        endUnix: monthEnd.unix(),
      })
      .subscribe((state) => {
        if (this._mounted) {
          this.setState(state);
        }
      });
  }

  _calculateMonthRange() {
    const { focusedMoment } = this.props;

    // Get the first day of the month
    const monthStart = moment(focusedMoment).startOf('month').startOf('week');
    // Get the last day of the month view (may include days from next month)
    const monthEnd = moment(focusedMoment).endOf('month').endOf('week');

    return { monthStart, monthEnd };
  }

  _getWeeksInMonth(): Moment[][] {
    const { monthStart, monthEnd } = this._calculateMonthRange();
    const weeks: Moment[][] = [];
    const current = moment(monthStart);

    while (current.isSameOrBefore(monthEnd)) {
      const week: Moment[] = [];
      for (let i = 0; i < DAYS_IN_WEEK; i++) {
        week.push(moment(current));
        current.add(1, 'day');
      }
      weeks.push(week);
    }

    return weeks;
  }

  _getEventsForDay(day: Moment): EventOccurrence[] {
    const dayStart = day.clone().startOf('day').unix();
    const dayEnd = day.clone().endOf('day').unix();
    const events = getEventsWithDragPreview(this.state.events, this.props.dragState);

    return events.filter((event) => {
      // Event overlaps with this day
      return event.start < dayEnd && event.end > dayStart;
    });
  }

  _isToday(day: Moment): boolean {
    const now = moment();
    return day.isSame(now, 'day');
  }

  _isCurrentMonth(day: Moment): boolean {
    return day.month() === this.props.focusedMoment.month();
  }

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

  _renderWeek(week: Moment[], weekIdx: number) {
    return (
      <div className="month-view-week" key={weekIdx}>
        {week.map((day, dayIdx) => {
          const events = this._getEventsForDay(day);
          return (
            <MonthViewDayCell
              key={dayIdx}
              day={day}
              events={events}
              isToday={this._isToday(day)}
              isCurrentMonth={this._isCurrentMonth(day)}
              maxVisibleEvents={MAX_VISIBLE_EVENTS}
              focusedEvent={this.props.focusedEvent}
              selectedEvents={this.props.selectedEvents}
              onEventClick={this.props.onEventClick}
              onEventDoubleClick={this.props.onEventDoubleClick}
              onEventFocused={this.props.onEventFocused}
              onDayClick={this._onDayClick}
              dragState={this.props.dragState}
              onEventDragStart={this.props.onEventDragStart}
              readOnlyCalendarIds={this.props.readOnlyCalendarIds}
            />
          );
        })}
      </div>
    );
  }

  render() {
    const weeks = this._getWeeksInMonth();
    const headerText = this.props.focusedMoment.format('MMMM YYYY');

    return (
      <div className="calendar-view month-view">
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
            nextAction={this._onClickNextMonth}
            prevAction={this._onClickPrevMonth}
            onChangeView={this.props.onChangeView}
            disabledViewButton={CalendarView.MONTH}
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

          <div className="month-view-grid-container">
            {this._renderWeekdayHeaders()}
            <div className="month-view-grid">
              {weeks.map((week, idx) => this._renderWeek(week, idx))}
            </div>
          </div>
        </CalendarEventContainer>
      </div>
    );
  }
}
