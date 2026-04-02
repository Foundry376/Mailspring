import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { localized, DateUtils, Actions, Thread } from 'mailspring-exports';
import * as SnoozeActions from './snooze-actions';
import TimeCardPopover, {
  DEFAULT_TIME_CARD_OPTIONS,
  DEFAULT_TIME_CARD_DATES_FACTORY,
  DEFAULT_TIME_CARD_ICON_NAMES,
} from './time-card-popover';

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

  didSnooze = false;

  componentWillUnmount() {
    this.props.swipeCallback(this.didSnooze);
  }

  onSnooze = (date, itemLabel) => {
    const utcDate = date.utc();
    const formatted = DateUtils.format(utcDate);
    SnoozeActions.snoozeThreads(this.props.threads, formatted, itemLabel);
    this.didSnooze = true;
    Actions.closePopover();

    // if we're looking at a thread, go back to the main view.
    // has no effect otherwise.
    Actions.popSheet();
  };

  render() {
    return (
      <TimeCardPopover
        className="snooze-popover"
        options={DEFAULT_TIME_CARD_OPTIONS}
        datesFactory={DEFAULT_TIME_CARD_DATES_FACTORY}
        iconNames={DEFAULT_TIME_CARD_ICON_NAMES}
        onSelectDate={this.onSnooze}
      />
    );
  }
}

export default SnoozePopover;
