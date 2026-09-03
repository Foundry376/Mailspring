import React from 'react';
import ReactDOM from 'react-dom';
import classNames from 'classnames';
import { CalendarDateUtils } from 'mailspring-exports';
import { DAY_DUR } from './week-view-helpers';

interface CurrentTimeIndicatorProps {
  gridHeight: number;
  numColumns: number;
  todayColumnIdx: number;
  visible: boolean;
}

export class CurrentTimeIndicator extends React.Component<
  CurrentTimeIndicatorProps,
  { dayFraction: number }
> {
  _movementTimer = null;

  constructor(props) {
    super(props);
    this.state = this.getStateFromTime();
  }

  componentDidMount() {
    // update our displayed time once a minute
    this._movementTimer = setInterval(() => {
      this.setState(this.getStateFromTime());
    }, 60 * 1000);
    (ReactDOM.findDOMNode(this) as any).scrollIntoViewIfNeeded(true);
  }

  componentWillUnmount() {
    clearTimeout(this._movementTimer);
    this._movementTimer = null;
  }

  getStateFromTime() {
    return { dayFraction: CalendarDateUtils.secondsIntoDay(Date.now() / 1000) / DAY_DUR };
  }

  render() {
    const { gridHeight, numColumns, todayColumnIdx, visible } = this.props;
    const { dayFraction } = this.state;

    const todayMarker =
      todayColumnIdx !== -1 ? (
        <div style={{ left: `${Math.round((todayColumnIdx * 100) / numColumns)}%` }} />
      ) : null;

    return (
      <div
        className={classNames({ 'current-time-indicator': true, visible: visible })}
        style={{ top: gridHeight * dayFraction }}
      >
        {todayMarker}
      </div>
    );
  }
}
