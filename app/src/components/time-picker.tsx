import React from 'react';
import ReactDOM from 'react-dom';
import moment from 'moment';
import classnames from 'classnames';
import { TabGroupContext } from 'mailspring-component-kit';

require('moment-round'); // overrides moment

const INTERVAL: [any, string] = [30, 'minutes'];

type TimePickerProps = {
  value?: number;
  onChange?: (ms: number) => void;
  relativeTo?: number;
};
type TimePickerState = {
  rawText: any;
  focused: boolean;
};

export default class TimePicker extends React.Component<TimePickerProps, TimePickerState> {
  static displayName = 'TimePicker';

  static contextType = TabGroupContext;
  context!: React.ContextType<typeof TabGroupContext>;

  static defaultProps = {
    value: moment().valueOf(),
    onChange: () => {},
  };

  _gotoScrollStartOnUpdate = false;

  constructor(props) {
    super(props);
    this.state = {
      focused: false,
      rawText: this._valToTimeString(props.value),
    };
  }

  componentDidMount() {
    this._fixTimeOptionScroll();
  }

  componentDidUpdate(prevProps: TimePickerProps) {
    if (prevProps.value !== this.props.value) {
      this.setState({ rawText: this._valToTimeString(this.props.value) });
    }
    if (this._gotoScrollStartOnUpdate) {
      this._fixTimeOptionScroll();
    }
  }

  _valToTimeString(value) {
    return moment(value).format('LT');
  }

  _onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      this._onArrow(event.key);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      this._onArrow(event.key);
    } else if (event.key === 'Enter') {
      this.context?.shiftFocus(1);
    }
  };

  _onArrow(key) {
    let newT = moment(this.props.value);
    newT = newT.round(...INTERVAL);
    if (key === 'ArrowUp') {
      newT = newT.subtract(...INTERVAL);
    } else if (key === 'ArrowDown') {
      newT = newT.add(...INTERVAL);
    }
    if (moment(this.props.value).day() !== newT.day()) {
      return;
    }
    this._gotoScrollStartOnUpdate = true;
    this.props.onChange(newT.valueOf());
  }

  _onFocus = () => {
    this.setState({ focused: true });
    this._gotoScrollStartOnUpdate = true;
    const el = ReactDOM.findDOMNode(this.refs.input) as HTMLInputElement;
    el.setSelectionRange(0, el.value.length);
  };

  _onBlur = (event: React.FocusEvent<HTMLInputElement>) => {
    this.setState({ focused: false });
    if (
      event.relatedTarget &&
      Array.from((event.relatedTarget as Element).classList).includes('time-options')
    ) {
      return;
    }
    this._saveIfValid(this.state.rawText);
  };

  _onRawTextChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    this.setState({ rawText: event.target.value });
  };

  _saveIfValid(rawText = '') {
    // Compare the rendered text, not the parsed instant: re-parsing an ambiguous fall-back
    // wall clock re-resolves it to the earlier offset.
    if (rawText.trim() === this._valToTimeString(this.props.value)) {
      return;
    }
    // Locale-aware am/pm parsing!!
    const parsedMoment = moment(rawText, 'h:ma');
    if (parsedMoment.isValid()) {
      if (this._shouldAddTwelve(rawText) && parsedMoment.hour() < 12) {
        parsedMoment.hour(parsedMoment.hour() + 12);
      }
      // 'h:ma' has no date tokens, so moment fills y/m/d from today.
      const valueMoment = moment(this.props.value);
      parsedMoment.year(valueMoment.year());
      parsedMoment.dayOfYear(valueMoment.dayOfYear());

      if (parsedMoment.valueOf() === this.props.value) {
        this.setState({ rawText: this._valToTimeString(this.props.value) });
        return;
      }
      this.props.onChange(parsedMoment.valueOf());
    }
  }

  // moment's LT uses h for a 12-hour clock and H for a 24-hour one. Test the hour token rather
  // than the meridiem: lb writes "H:mm [Auer]" and si writes "a h:mm".
  _isTwelveHourLocale() {
    return /h/.test(moment.localeData().longDateFormat('LT'));
  }

  /*
   * If you're going to punch only "2" into the time field, you probably
   * mean 2pm instead of 2am. The regex explicitly checks for only digits
   * (no meridiem indicators) and very basic use cases.
   */
  _shouldAddTwelve(rawText) {
    if (!this._isTwelveHourLocale()) {
      return false;
    }
    const simpleDigitMatch = rawText.match(/^(\d{1,2})(:\d{1,2})?$/);
    if (simpleDigitMatch && simpleDigitMatch.length > 0) {
      const hr = parseInt(simpleDigitMatch[1], 10);
      if (hr >= 1 && hr <= 7) {
        return true;
      }
    }
    return false;
  }

  _fixTimeOptionScroll() {
    this._gotoScrollStartOnUpdate = false;
    const el = ReactDOM.findDOMNode(this) as HTMLElement;
    const scrollTo = el.querySelector('.scroll-start') as HTMLElement;
    const scrollWrap = el.querySelector('.time-options');
    if (scrollTo && scrollWrap) {
      scrollWrap.scrollTop = scrollTo.offsetTop;
    }
  }

  _onSelectOption(val) {
    this.props.onChange(val);
  }

  _renderTimeOptions() {
    if (!this.state.focused) {
      return false;
    }

    const enteredMoment = moment(this.props.value);

    const roundedMoment = moment(enteredMoment);
    roundedMoment.ceil(...INTERVAL);

    const firstVisibleMoment = moment(roundedMoment);
    firstVisibleMoment.add(...INTERVAL);

    let startVal = moment(this.props.value).startOf('day').valueOf();
    startVal = Math.max(startVal, this.props.relativeTo || 0);

    const startMoment = moment(startVal);
    if (this.props.relativeTo) {
      startMoment.ceil(...INTERVAL).add(...INTERVAL);
    }
    const endMoment = moment(startVal).endOf('day');
    const opts = [];

    const relStart = moment(this.props.relativeTo);
    const timeIter = moment(startMoment);
    while (timeIter.isSameOrBefore(endMoment)) {
      const val = timeIter.valueOf();
      const className = classnames({
        option: true,
        selected: timeIter.isSame(enteredMoment),
        'scroll-start': timeIter.isSame(firstVisibleMoment),
      });

      let relTxt: React.ReactElement | null = null;
      if (this.props.relativeTo) {
        relTxt = (
          <span className="rel-text">{`(${timeIter.diff(relStart, 'hours', true)}hr)`}</span>
        );
      }

      opts.push(
        <div className={className} key={val} onMouseDown={() => this._onSelectOption(val)}>
          {timeIter.format('LT')}
          {relTxt}
        </div>
      );
      timeIter.add(...INTERVAL);
    }

    const className = classnames({
      'time-options': true,
      'relative-to': this.props.relativeTo,
    });

    return (
      <div className={className} tabIndex={-1}>
        {opts}
      </div>
    );
  }

  render() {
    const className = classnames({
      'time-picker': true,
      'no-select-end': true,
      invalid: !moment(this.state.rawText, 'h:ma').isValid(),
    });
    return (
      <div className="time-picker-wrap">
        <input
          className={className}
          type="text"
          ref="input"
          value={this.state.rawText}
          onChange={this._onRawTextChange}
          onKeyDown={this._onKeyDown}
          onFocus={this._onFocus}
          onBlur={this._onBlur}
        />
        {this._renderTimeOptions()}
      </div>
    );
  }
}
