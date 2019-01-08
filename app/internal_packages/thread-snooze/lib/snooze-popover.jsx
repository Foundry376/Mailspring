import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { DateUtils, Actions } from 'mailspring-exports';
import { RetinaImg, DateInput } from 'mailspring-component-kit';
import SnoozeActions from './snooze-actions';

const { DATE_FORMAT_LONG } = DateUtils;

const SnoozeOptions = [
  ['Later today', 'Tonight', 'Tomorrow'],
  ['This weekend', 'Next week', 'Next month'],
];

const SnoozeDatesFactory = {
  'Later today': DateUtils.laterToday,
  Tonight: DateUtils.tonight,
  Tomorrow: DateUtils.tomorrow,
  'This weekend': DateUtils.thisWeekend,
  'Next week': DateUtils.nextWeek,
  'Next month': DateUtils.nextMonth,
};

const SnoozeIconNames = {
  'Later today': 'later',
  Tonight: 'tonight',
  Tomorrow: 'tomorrow',
  'This weekend': 'weekend',
  'Next week': 'week',
  'Next month': 'month',
};

class SnoozePopover extends Component {
  static displayName = 'SnoozePopover';

  static propTypes = {
    threads: PropTypes.array.isRequired,
    swipeCallback: PropTypes.func,
  };

  static defaultProps = {
    swipeCallback: () => {},
  };

  constructor() {
    super();
    this.didSnooze = false;
  }

  componentWillUnmount() {
    this.props.swipeCallback(this.didSnooze);
  }

  onSnooze(date, itemLabel) {
    const utcDate = date.utc();
    const formatted = DateUtils.format(utcDate);
    SnoozeActions.snoozeThreads(this.props.threads, formatted, itemLabel);
    this.didSnooze = true;
    Actions.closePopover();

    // if we're looking at a thread, go back to the main view.
    // has no effect otherwise.
    Actions.popSheet();
  }

  onSelectCustomDate = (date, inputValue) => {
    if (date) {
      this.onSnooze(date, 'Custom');
    } else {
      AppEnv.showErrorDialog(`Sorry, we can't parse ${inputValue} as a valid date.`);
    }
  };

  renderItem = itemLabel => {
    const date = SnoozeDatesFactory[itemLabel]();
    const iconName = SnoozeIconNames[itemLabel];
    const iconPath = `edisonmail://thread-snooze/assets/ic-snoozepopover-${iconName}@2x.png`;
    return (
      <div key={itemLabel} className="snooze-item" onClick={() => this.onSnooze(date, itemLabel)}>
        <RetinaImg
          url={iconPath}
          mode={RetinaImg.Mode.ContentIsMask}
          style={{ width: 45, height: 45 }}
        />
        {itemLabel}
      </div>
    );
  };

  renderRow = (options, idx) => {
    const items = options.map(this.renderItem);
    return (
      <div key={`snooze-popover-row-${idx}`} className="snooze-row">
        {items}
      </div>
    );
  };

  render() {
    const rows = SnoozeOptions.map(this.renderRow);

    return (
      <div className="snooze-popover" tabIndex="-1">
        {rows}
        <DateInput
          className="snooze-input"
          dateFormat={DATE_FORMAT_LONG}
          onDateSubmitted={this.onSelectCustomDate}
        />
      </div>
    );
  }
}

export default SnoozePopover;
