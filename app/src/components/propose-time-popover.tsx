import React from 'react';
import moment, { Moment } from 'moment';
import { Actions, localized } from 'mailspring-exports';
import { DatePicker, TimePicker } from 'mailspring-component-kit';

// The pickers speak milliseconds; events are passed around in unix seconds.
const toPicker = (unixSeconds: number) => unixSeconds * 1000;
const DAY = 86400;

/** The slot on one line: "Mon, Aug 24 · 12:00 PM – 12:30 PM", or the dates of an all-day one. */
function compactSlot(start: number, end: number, isAllDay: boolean): string {
  const s = moment.unix(start);
  const e = moment.unix(end);
  if (isAllDay) {
    // DTEND of an all-day event is the morning after it; show the last day it covers.
    const last = moment.unix(end - DAY);
    return last.isSame(s, 'day')
      ? s.format('ddd, MMM D')
      : `${s.format('ddd, MMM D')} – ${last.format('ddd, MMM D')}`;
  }
  const time = (m: Moment) => m.format('h:mm A');
  return `${s.format('ddd, MMM D')} · ${time(s)} – ${time(e)}`;
}

interface ProposeTimePopoverProps {
  /** The invitation's current start and end, in unix seconds; local midnights when all-day. */
  start: number;
  end: number;
  /** An all-day invitation is countered with dates, so no times are offered. */
  isAllDay?: boolean;
  onPropose: (proposal: { start: Date; end: Date; comment: string }) => void;
}

interface ProposeTimePopoverState {
  start: number;
  end: number;
  comment: string;
}

/**
 * Picks the time to counter-propose for a meeting invitation. Moving the start carries the end
 * with it ("this meeting, a different slot"); editing the end changes the duration from then on.
 */
export class ProposeTimePopover extends React.Component<
  ProposeTimePopoverProps,
  ProposeTimePopoverState
> {
  static displayName = 'ProposeTimePopover';

  constructor(props: ProposeTimePopoverProps) {
    super(props);
    this.state = { start: props.start, end: props.end, comment: '' };
  }

  /** Applies a picker's time of day to the day we're already on. */
  _withTimeOfDay(base: number, pickerMs: number): Moment {
    const picked = moment(pickerMs);
    return moment.unix(base).hour(picked.hour()).minute(picked.minute()).second(0).millisecond(0);
  }

  _moveStart(start: Moment) {
    const duration = this.state.end - this.state.start;
    this.setState({ start: start.unix(), end: start.unix() + duration });
  }

  _onChangeDay = (pickerMs: number) => {
    const day = moment(pickerMs);
    this._moveStart(moment.unix(this.state.start).year(day.year()).dayOfYear(day.dayOfYear()));
  };

  _onChangeStartTime = (pickerMs: number) => {
    this._moveStart(this._withTimeOfDay(this.state.start, pickerMs));
  };

  _onChangeEndTime = (pickerMs: number) => {
    const end = this._withTimeOfDay(this.state.start, pickerMs);
    // A meeting that ends before it starts isn't a proposal, so hold a one-minute floor.
    this.setState({ end: Math.max(end.unix(), this.state.start + 60) });
  };

  _onChangeLastDay = (pickerMs: number) => {
    // The picker shows the last day covered; DTEND is the midnight after it.
    const end = moment(pickerMs).startOf('day').unix() + DAY;
    this.setState({ end: Math.max(end, this.state.start + DAY) });
  };

  _onSubmit = () => {
    this.props.onPropose({
      start: new Date(this.state.start * 1000),
      end: new Date(this.state.end * 1000),
      comment: this.state.comment.trim(),
    });
    Actions.closePopover();
  };

  _renderTimed(start: number, end: number) {
    const minutes = Math.round((end - start) / 60);
    const duration =
      minutes % 60 === 0
        ? localized('%@ hr', minutes / 60)
        : minutes > 60
          ? localized('%@ hr %@ min', Math.floor(minutes / 60), minutes % 60)
          : localized('%@ min', minutes);
    return (
      <div className="propose-time-fields">
        <label className="propose-time-field">
          <span className="propose-time-label">{localized('Date')}</span>
          <DatePicker value={toPicker(start)} onChange={this._onChangeDay} />
        </label>

        <div className="propose-time-field">
          <span className="propose-time-label">{localized('Time')}</span>
          <div className="propose-time-times">
            <TimePicker value={toPicker(start)} onChange={this._onChangeStartTime} />
            <span className="propose-time-separator">{localized('to')}</span>
            <TimePicker value={toPicker(end)} onChange={this._onChangeEndTime} />
            <span className="propose-time-duration">{duration}</span>
          </div>
        </div>
      </div>
    );
  }

  _renderAllDay(start: number, end: number) {
    const days = Math.round((end - start) / DAY);
    return (
      <div className="propose-time-fields">
        <label className="propose-time-field">
          <span className="propose-time-label">{localized('From')}</span>
          <DatePicker value={toPicker(start)} onChange={this._onChangeDay} />
        </label>
        <label className="propose-time-field">
          <span className="propose-time-label">{localized('To')}</span>
          <DatePicker value={toPicker(end - DAY)} onChange={this._onChangeLastDay} />
          <span className="propose-time-duration">
            {days === 1 ? localized('1 day') : localized('%@ days', days)}
          </span>
        </label>
      </div>
    );
  }

  render() {
    const { start, end, comment } = this.state;
    const { isAllDay } = this.props;
    const unchanged = start === this.props.start && end === this.props.end;

    return (
      <div className="propose-time-popover">
        <div className="propose-time-header">{localized('Propose a new time')}</div>

        {/* What the organizer currently has, so the change being asked for is legible
            without going back to the event. */}
        <div className="propose-time-original">
          {localized('Currently %@', compactSlot(this.props.start, this.props.end, !!isAllDay))}
        </div>

        <div className="propose-time-body">
          {isAllDay ? this._renderAllDay(start, end) : this._renderTimed(start, end)}

          <textarea
            className="propose-time-comment"
            rows={3}
            value={comment}
            placeholder={localized('Add a note for the organizer (optional)')}
            onChange={(e) => this.setState({ comment: e.target.value })}
          />
        </div>

        <div className="propose-time-actions">
          <button className="btn" onClick={() => Actions.closePopover()}>
            {localized('Cancel')}
          </button>
          <button
            className="btn btn-emphasis"
            disabled={unchanged}
            title={unchanged ? localized('Pick a different time first') : undefined}
            onClick={this._onSubmit}
          >
            {localized('Propose')}
          </button>
        </div>
      </div>
    );
  }
}
