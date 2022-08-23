import React from 'react';
import { MailspringCalendarViewProps } from './mailspring-calendar';
import { CalendarEventContainer } from './calendar-event-container';
import { ScrollRegion, InjectedComponentSet } from 'mailspring-component-kit';
import { CalendarView } from './calendar-constants';
import { HeaderControls } from './header-controls';

export class MonthView extends React.Component<MailspringCalendarViewProps> {
  static displayName = 'MonthView';

  _onClick = () => {
    this.props.onChangeView(CalendarView.WEEK);
  };

  render() {
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
            title={'Test 2022'}
            nextAction={() => console.log('Next Month')}
            prevAction={() => console.log('Previous Month')}
            onChangeView={this.props.onChangeView}
            disabledViewButton={CalendarView.MONTH}
          >
            <button
              key="today"
              className="btn"
              onClick={() => console.log('Go to today (Month)')}
              style={{ position: 'absolute', left: 10 }}
            >
              Today
            </button>
          </HeaderControls>
        </CalendarEventContainer>
      </div>
    );
  }
}
