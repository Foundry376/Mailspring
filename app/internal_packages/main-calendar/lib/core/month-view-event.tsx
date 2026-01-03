import React from 'react';
import ReactDOM from 'react-dom';
import classnames from 'classnames';
import { EventOccurrence } from './calendar-data-source';
import { calcColor } from './calendar-helpers';

interface MonthViewEventProps {
  event: EventOccurrence;
  selected: boolean;
  focused: boolean;
  onClick: (e: React.MouseEvent<any>, event: EventOccurrence) => void;
  onDoubleClick: (event: EventOccurrence) => void;
  onFocused: (event: EventOccurrence) => void;
}

export class MonthViewEvent extends React.Component<MonthViewEventProps> {
  static displayName = 'MonthViewEvent';

  componentDidMount() {
    this._scrollFocusedEventIntoView();
  }

  componentDidUpdate() {
    this._scrollFocusedEventIntoView();
  }

  _scrollFocusedEventIntoView() {
    const { focused, event, onFocused } = this.props;
    if (!focused) {
      return;
    }
    const eventNode = ReactDOM.findDOMNode(this);
    if (!eventNode) {
      return;
    }
    (eventNode as any).scrollIntoViewIfNeeded?.(true);
    onFocused(event);
  }

  _onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    this.props.onClick(e, this.props.event);
  };

  _onDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    this.props.onDoubleClick(this.props.event);
  };

  render() {
    const { event, selected } = this.props;
    const backgroundColor = calcColor(event.calendarId);

    const className = classnames('month-view-event', {
      selected: selected,
      'is-all-day': event.isAllDay,
    });

    return (
      <div
        id={event.id}
        className={className}
        style={{ backgroundColor }}
        onClick={this._onClick}
        onDoubleClick={this._onDoubleClick}
        tabIndex={0}
      >
        <span className="month-view-event-title">{event.title}</span>
      </div>
    );
  }
}
