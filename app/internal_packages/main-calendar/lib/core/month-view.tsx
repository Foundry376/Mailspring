import React from 'react';
import { MailspringCalendarViewProps } from './mailspring-calendar';
import { CalendarView } from './calendar-constants';

export class MonthView extends React.Component<MailspringCalendarViewProps> {
  static displayName = 'MonthView';

  _onClick = () => {
    this.props.onChangeView(CalendarView.WEEK);
  };

  render() {
    return <button onClick={this._onClick}>Change to week</button>;
  }
}
