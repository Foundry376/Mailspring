import React from 'react';
import moment, { Moment } from 'moment-timezone';
import { InjectedComponentSet } from 'mailspring-component-kit';
import { CalendarDateUtils } from 'mailspring-exports';
import { MailspringCalendarViewProps } from './mailspring-calendar';
import { CalendarEventContainer } from './calendar-event-container';
import { CalendarView } from './calendar-constants';
import { HeaderControls } from './header-controls';
import { EventOccurrence } from './calendar-data-source';
import { Disposable } from 'rx-core';
import { MonthViewWeek } from './month-view-week';
import { WeekBarsLayout, firstVisibleBarIds, layoutWeekBars } from './month-view-helpers';
import { getEventsWithDragPreview, withCreateDragPreview } from './calendar-drag-utils';

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

  _renderWeek(week: Moment[], weekIdx: number, layout: WeekBarsLayout, firstBarIds: Set<string>) {
    return (
      <MonthViewWeek
        key={weekIdx}
        days={week}
        layout={layout}
        firstBarIds={firstBarIds}
        currentMonth={this.props.focusedMoment.month()}
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

  render() {
    const weeks = this._getWeeksInMonth();
    const events = withCreateDragPreview(
      getEventsWithDragPreview(this.state.events, this.props.dragState),
      this.props.createDrag
    );
    const layouts = weeks.map((week) =>
      layoutWeekBars(
        events,
        week.map((d) => CalendarDateUtils.calendarDateFromUnix(d.unix())),
        MAX_VISIBLE_EVENTS
      )
    );
    const firstBarIds = firstVisibleBarIds(layouts);
    const headerText = this.props.focusedMoment.format('MMMM YYYY');

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
            title={headerText}
            nextAction={this._onClickNextMonth}
            prevAction={this._onClickPrevMonth}
            onChangeView={this.props.onChangeView}
            disabledViewButton={CalendarView.MONTH}
          >
            <button key="today" className="btn" onClick={this._onClickToday}>
              Today
            </button>
          </HeaderControls>

          <div className="month-view-grid-container">
            {this._renderWeekdayHeaders()}
            <div className="month-view-grid">
              {weeks.map((week, idx) =>
                this._renderWeek(week, idx, layouts[idx], firstBarIds[idx])
              )}
            </div>
          </div>
        </CalendarEventContainer>
      </div>
    );
  }
}
