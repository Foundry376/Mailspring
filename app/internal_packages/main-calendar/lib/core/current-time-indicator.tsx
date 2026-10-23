import React from 'react';
import ReactDOM from 'react-dom';
import classNames from 'classnames';
import { dayFraction } from './week-view-helpers';
import { formatShortTime } from './calendar-helpers';

const nowUnix = () => Date.now() / 1000;
const MS_PER_MINUTE = 60 * 1000;

/** Re-renders its child with the current time, once a minute. */
export class EachMinute extends React.Component<
  { children: (now: number) => React.ReactElement },
  { now: number }
> {
  _timer = null;

  state = { now: nowUnix() };

  componentDidMount() {
    this._scheduleTick();
  }

  componentWillUnmount() {
    clearTimeout(this._timer);
  }

  // On each minute's turn, so the time shown keeps pace with the clock.
  _scheduleTick() {
    this._timer = setTimeout(
      () => {
        this.setState({ now: nowUnix() });
        this._scheduleTick();
      },
      MS_PER_MINUTE - (Date.now() % MS_PER_MINUTE)
    );
  }

  render() {
    return this.props.children(this.state.now);
  }
}

interface CurrentTimeIndicatorProps {
  gridHeight: number;
  numColumns: number;
  todayColumnIdx: number;
  visible: boolean;
}

/** A faint line across every day at the current time, drawn solid across today's column. */
export class CurrentTimeIndicator extends React.Component<CurrentTimeIndicatorProps> {
  componentDidMount() {
    (ReactDOM.findDOMNode(this) as any).scrollIntoViewIfNeeded(true);
  }

  render() {
    const { gridHeight, numColumns, todayColumnIdx, visible } = this.props;
    return (
      <EachMinute>
        {(now) => (
          <div
            className={classNames({ 'current-time-indicator': true, visible: visible })}
            style={{ top: gridHeight * dayFraction(now) }}
          >
            {todayColumnIdx !== -1 && (
              <div
                className="current-time-today"
                style={{
                  insetInlineStart: `${(todayColumnIdx * 100) / numColumns}%`,
                  width: `${100 / numColumns}%`,
                }}
              />
            )}
          </div>
        )}
      </EachMinute>
    );
  }
}

/** The current time in the time column, level with the indicator's line at `y`. */
export function CurrentTimeLabel({ now, y }: { now: number; y: number }) {
  return (
    <span className="legend-text current-time-label" style={{ top: y - 7.5 }}>
      {formatShortTime(now)}
    </span>
  );
}
