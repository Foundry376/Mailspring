import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { localized, DateUtils, Actions, Thread } from 'mailspring-exports';
import { RetinaImg, DateInput } from 'mailspring-component-kit';
import * as SnoozeActions from './snooze-actions';

const { DATE_FORMAT_LONG } = DateUtils;

const SnoozeOptions = [
  [localized('Later Today'), localized('Tonight'), localized('Tomorrow')],
  [localized('This Weekend'), localized('Next Week'), localized('Next Month')],
];

const SnoozeDatesFactory = {
  [localized('Later Today')]: DateUtils.laterToday,
  [localized('Tonight')]: DateUtils.tonight,
  [localized('Tomorrow')]: DateUtils.tomorrow,
  [localized('This Weekend')]: DateUtils.thisWeekend,
  [localized('Next Week')]: DateUtils.nextWeek,
  [localized('Next Month')]: DateUtils.nextMonth,
};

const SnoozeIconNames = {
  [localized('Later Today')]: 'later',
  [localized('Tonight')]: 'tonight',
  [localized('Tomorrow')]: 'tomorrow',
  [localized('This Weekend')]: 'weekend',
  [localized('Next Week')]: 'week',
  [localized('Next Month')]: 'month',
};

class SnoozePopover extends Component<{
  threads: Thread[];
  swipeCallback: (didSnooze: boolean) => void;
}> {
  static displayName = 'SnoozePopover';

  static propTypes = {
    threads: PropTypes.array.isRequired,
    swipeCallback: PropTypes.func,
  };

  static defaultProps = {
    swipeCallback: () => {},
  };

  didSnooze: boolean = false;

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
      AppEnv.showErrorDialog(localized(`Sorry, we can't parse %@ as a valid date.`, inputValue));
    }
  };

  renderItem = itemLabel => {
    const date = SnoozeDatesFactory[itemLabel]();
    const iconName = SnoozeIconNames[itemLabel];
    const iconPath = `mailspring://thread-snooze/assets/ic-snoozepopover-${iconName}@2x.png`;
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
      <div className="snooze-popover" tabIndex={-1}>
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
