import React from 'react';
import classnames from 'classnames';
import { AccountStore, localized } from 'mailspring-exports';

export type AlertTiming =
  | 'none'
  | '5min'
  | '10min'
  | '15min'
  | '30min'
  | '1hour'
  | '2hours'
  | '1day'
  | '2days'
  | '1week'
  /** A reminder the event already had that none of the options describes. */
  | 'custom';

// Each timing's TRIGGER, as getAlarmTrigger normalizes one: an offset before DTSTART (RFC 5545
// section 3.8.6.3).
const ALERT_TRIGGERS: Record<Exclude<AlertTiming, 'none' | 'custom'>, string> = {
  '5min': '-PT5M',
  '10min': '-PT10M',
  '15min': '-PT15M',
  '30min': '-PT30M',
  '1hour': '-PT1H',
  '2hours': '-PT2H',
  '1day': '-P1D',
  '2days': '-P2D',
  '1week': '-P1W',
};

const ALERT_LABELS: Record<Exclude<AlertTiming, 'custom'>, string> = {
  none: localized('No alert'),
  '5min': localized('5 minutes before'),
  '10min': localized('10 minutes before'),
  '15min': localized('15 minutes before'),
  '30min': localized('30 minutes before'),
  '1hour': localized('1 hour before'),
  '2hours': localized('2 hours before'),
  '1day': localized('1 day before'),
  '2days': localized('2 days before'),
  '1week': localized('1 week before'),
};

/** The timings the Alert picker offers, in order. */
export const ALERT_TIMINGS = Object.keys(ALERT_LABELS) as Exclude<AlertTiming, 'custom'>[];

export function alertLabel(alert: Exclude<AlertTiming, 'custom'>): string {
  return ALERT_LABELS[alert];
}

const UNITS: { seconds: number; label: (count: number) => string }[] = [
  {
    seconds: 604800,
    label: (n) => (n === 1 ? localized('1 week before') : localized('%@ weeks before', n)),
  },
  {
    seconds: 86400,
    label: (n) => (n === 1 ? localized('1 day before') : localized('%@ days before', n)),
  },
  {
    seconds: 3600,
    label: (n) => (n === 1 ? localized('1 hour before') : localized('%@ hours before', n)),
  },
  {
    seconds: 60,
    label: (n) => (n === 1 ? localized('1 minute before') : localized('%@ minutes before', n)),
  },
];

/**
 * A reminder none of the timings describes, read out in the largest whole unit ("20 minutes
 * before"). On an all-day event a relative TRIGGER counts from midnight, so Google's "9 AM the
 * day before" is -PT15H, which reads as "Custom" rather than as a misleading 15 hours.
 */
export function customAlertLabel(trigger: string, isAllDay: boolean): string {
  const seconds = secondsBefore(trigger);
  if (isAllDay || seconds === null) return localized('Custom');
  if (seconds === 0) return localized('At time of event');
  const unit = UNITS.find((u) => seconds % u.seconds === 0);
  return unit ? unit.label(seconds / unit.seconds) : localized('Custom');
}

/** How long before the start a TRIGGER, as getAlarmTrigger normalizes it, goes off; null for any other kind. */
export function secondsBefore(trigger: string): number | null {
  if (trigger === 'PT0S') return 0;
  const m = /^-P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(trigger);
  if (!m) return null;
  const [weeks, days, hours, minutes, secs] = m.slice(1).map((n) => Number(n || 0));
  return weeks * 604800 + days * 86400 + hours * 3600 + minutes * 60 + secs;
}

/** The TRIGGER to write for a timing, or null for none. */
export function alertTrigger(alert: AlertTiming): string | null {
  return alert === 'none' || alert === 'custom' ? null : ALERT_TRIGGERS[alert];
}

/** The timing an event's first reminder reads as; see ICSEventHelpers.getAlarmTrigger. */
export function alertForTrigger(trigger: string | null): AlertTiming {
  if (!trigger) return 'none';
  const match = Object.keys(ALERT_TRIGGERS).find((k) => ALERT_TRIGGERS[k] === trigger);
  return (match as AlertTiming) || 'custom';
}

/** A relative reminder on an all-day event goes off at midnight, so a new one starts with none. */
export function defaultAlert(isAllDay: boolean): AlertTiming {
  return isAllDay ? 'none' : '10min';
}

/** How a reminder reads in the panel: an option's label, or one described from its TRIGGER. */
export function alertLabelFor(trigger: string, isAllDay: boolean): string {
  const timing = alertForTrigger(trigger);
  return timing === 'custom' ? customAlertLabel(trigger, isAllDay) : alertLabel(timing);
}

/** Outlook calendars, written through Graph, hold one reminder an event; Google up to five. */
export function maxAlerts(accountId: string): number {
  const provider = AccountStore.accountForId(accountId)?.provider;
  return provider === 'office365' || provider === 'outlook' ? 1 : 5;
}

// Google Calendar's longest reminder.
const LONGEST_ALERT = 4 * 604800;

const TYPED_UNITS: { letter: 'M' | 'H' | 'D' | 'W'; seconds: number; words: string[] }[] = [
  { letter: 'M', seconds: 60, words: ['minutes', 'mins'] },
  { letter: 'H', seconds: 3600, words: ['hours', 'hrs'] },
  { letter: 'D', seconds: 86400, words: ['days'] },
  { letter: 'W', seconds: 604800, words: ['weeks', 'wks'] },
];

/**
 * The reminders a typed alert offers to pick from: with nothing typed, the timings; for a number,
 * each unit it can mean up to Google's longest reminder ("20" is 20 minutes, hours or days), or
 * the units its letters start ("20 h"); else the timings whose label holds the text.
 */
export function alertChoices(text: string): string[] {
  const typed = text.trim().toLowerCase();
  const timings = ALERT_TIMINGS.filter((t) => t !== 'none');
  const m = /^(\d+)\s*([a-z]*)(?:\s+before)?$/.exec(typed);
  if (!m) {
    return timings.filter((t) => alertLabel(t).toLowerCase().includes(typed)).map(alertTrigger);
  }
  const count = Number(m[1]);
  if (count === 0) return ['PT0S'];
  return TYPED_UNITS.filter((u) => !m[2] || u.words.some((w) => w.startsWith(m[2])))
    .filter((u) => count * u.seconds <= LONGEST_ALERT)
    .map(({ letter }) =>
      letter === 'M' || letter === 'H' ? `-PT${count}${letter}` : `-P${count}${letter}`
    );
}

interface AlertSelectorProps {
  /** The reminder's TRIGGER; null for the field that adds one. */
  value: string | null;
  isAllDay: boolean;
  placeholder?: string;
  onChange: (trigger: string) => void;
}

interface AlertSelectorState {
  text: string;
  optionsOpen: boolean;
  highlighted: number;
}

/**
 * A reminder picked from a list that typing rebuilds (see alertChoices). Only a pick saves: Enter
 * or a click on a choice; leaving the field puts back the reminder it had.
 */
export class AlertSelector extends React.Component<AlertSelectorProps, AlertSelectorState> {
  static displayName = 'AlertSelector';

  _input = React.createRef<HTMLInputElement>();

  state: AlertSelectorState = { text: this._label(), optionsOpen: false, highlighted: 0 };

  componentDidUpdate(prevProps: AlertSelectorProps) {
    if (prevProps.value !== this.props.value || prevProps.isAllDay !== this.props.isAllDay) {
      this.setState({ text: this._label() });
    }
  }

  _label() {
    const { value, isAllDay } = this.props;
    return value === null ? '' : alertLabelFor(value, isAllDay);
  }

  /** The choices for what's typed; the timings while the field still shows its reminder. */
  _choices() {
    const { text } = this.state;
    return alertChoices(text === this._label() ? '' : text);
  }

  _reset = () => {
    this.setState({ text: this._label(), optionsOpen: false, highlighted: 0 });
  };

  _pick(trigger: string) {
    this._reset();
    if (trigger !== this.props.value) this.props.onChange(trigger);
    this._input.current?.blur();
  }

  _onFocus = () => {
    this.setState({ optionsOpen: true, highlighted: 0 });
    this._input.current?.select();
  };

  _onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const choices = this._choices();
    const { highlighted } = this.state;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      const next = Math.min(Math.max(highlighted + step, 0), choices.length - 1);
      this.setState({ optionsOpen: true, highlighted: Math.max(next, 0) });
    } else if (event.key === 'Enter') {
      if (this.state.text !== this._label() && choices[highlighted]) {
        this._pick(choices[highlighted]);
      } else {
        this._reset();
        this._input.current?.blur();
      }
    } else if (event.key === 'Escape') {
      this._reset();
      this._input.current?.blur();
    }
  };

  render() {
    const { text, optionsOpen, highlighted } = this.state;
    const choices = this._choices();
    return (
      <div className="time-picker-wrap alert-selector">
        <input
          ref={this._input}
          type="text"
          className={classnames({ invalid: !!text.trim() && !choices.length })}
          value={text}
          placeholder={this.props.placeholder}
          onChange={(e) =>
            this.setState({ text: e.target.value, optionsOpen: true, highlighted: 0 })
          }
          onFocus={this._onFocus}
          onBlur={this._reset}
          onKeyDown={this._onKeyDown}
        />
        {optionsOpen && choices.length > 0 && (
          <div className="time-options" tabIndex={-1}>
            {choices.map((trigger, i) => (
              <div
                key={trigger}
                className={classnames('option', {
                  focused: i === highlighted,
                  selected: trigger === this.props.value,
                })}
                onMouseDown={(e) => {
                  e.preventDefault();
                  this._pick(trigger);
                }}
              >
                {alertLabelFor(trigger, false)}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }
}
