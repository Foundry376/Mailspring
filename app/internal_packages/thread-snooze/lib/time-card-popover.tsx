import React from 'react';
import { localized, DateUtils } from 'mailspring-exports';
import { DateInput, RetinaImg } from 'mailspring-component-kit';

const { DATE_FORMAT_LONG } = DateUtils;

export const DEFAULT_TIME_CARD_OPTIONS = [
  [localized('Later Today'), localized('Tonight'), localized('Tomorrow')],
  [localized('This Weekend'), localized('Next Week'), localized('Next Month')],
];

export const DEFAULT_TIME_CARD_DATES_FACTORY = {
  [localized('Later Today')]: DateUtils.laterToday,
  [localized('Tonight')]: DateUtils.tonight,
  [localized('Tomorrow')]: DateUtils.tomorrow,
  [localized('This Weekend')]: DateUtils.thisWeekend,
  [localized('Next Week')]: DateUtils.nextWeek,
  [localized('Next Month')]: DateUtils.nextMonth,
};

export const DEFAULT_TIME_CARD_ICON_NAMES = {
  [localized('Later Today')]: 'later',
  [localized('Tonight')]: 'tonight',
  [localized('Tomorrow')]: 'tomorrow',
  [localized('This Weekend')]: 'weekend',
  [localized('Next Week')]: 'week',
  [localized('Next Month')]: 'month',
};

interface TimeCardPopoverProps {
  className?: string;
  options: string[][];
  datesFactory: { [label: string]: () => any };
  iconNames: { [label: string]: string };
  onSelectDate: (date: any, label: string) => void;
  footer?: React.ReactNode;
}

function TimeCardPopover({
  className = '',
  options,
  datesFactory,
  iconNames,
  onSelectDate,
  footer = null,
}: TimeCardPopoverProps) {
  const onSelectCustomDate = (date, inputValue) => {
    if (!date) {
      AppEnv.showErrorDialog(localized(`Sorry, we can't parse %@ as a valid date.`, inputValue));
      return;
    }
    onSelectDate(date, 'Custom');
  };

  const onSelectQuickDate = itemLabel => {
    const dateFactory = datesFactory[itemLabel];
    if (!dateFactory) {
      return;
    }
    onSelectDate(dateFactory(), itemLabel);
  };

  const renderItem = itemLabel => {
    const iconName = iconNames[itemLabel];
    const iconPath = `mailspring://thread-snooze/assets/ic-snoozepopover-${iconName}@2x.png`;
    return (
      <div key={itemLabel} className="snooze-item" onClick={() => onSelectQuickDate(itemLabel)}>
        <RetinaImg
          url={iconPath}
          mode={RetinaImg.Mode.ContentIsMask}
          style={{ width: 45, height: 45 }}
        />
        {itemLabel}
      </div>
    );
  };

  const renderRow = (rowOptions, idx) => (
    <div key={`time-card-row-${idx}`} className="snooze-row">
      {rowOptions.map(renderItem)}
    </div>
  );

  return (
    <div className={className} tabIndex={-1}>
      {options.map(renderRow)}
      <DateInput
        className="snooze-input"
        dateFormat={DATE_FORMAT_LONG}
        onDateSubmitted={onSelectCustomDate}
      />
      {footer}
    </div>
  );
}

export default TimeCardPopover;
