import React, { Component } from 'react';
import { localized, Actions, DateUtils } from 'mailspring-exports';
import DateInput from './date-input';
import { Menu } from './menu';

const { DATE_FORMAT_SHORT, DATE_FORMAT_LONG } = DateUtils;

type DatePickerPopoverProps = {
  className?: string;
  footer?: React.ReactNode;
  onSelectDate?: (...args: any[]) => any;
  header: React.ReactNode;
  dateOptions: object;
  shouldSelectDateWhenInterpreted?: boolean;
};

class DatePickerPopover extends Component<DatePickerPopoverProps> {
  static displayName = 'DatePickerPopover';

  static defaultProps = {
    shouldSelectDateWhenInterpreted: false,
  };

  private _dateInputComponent: DateInput;
  private _menuComponent: Menu;

  onEscape() {
    Actions.closePopover();
  }

  onSelectMenuOption = optionKey => {
    const { dateOptions } = this.props;
    const date = dateOptions[optionKey]();
    this._dateInputComponent.clearInput();
    this.selectDate(date, optionKey);
  };

  onCustomDateInterpreted = date => {
    const { shouldSelectDateWhenInterpreted } = this.props;
    if (date && shouldSelectDateWhenInterpreted) {
      this._menuComponent.clearSelection();
      this.selectDate(date, 'Custom');
    }
  };

  onCustomDateSelected = (date, inputValue) => {
    if (date) {
      this._menuComponent.clearSelection();
      this.selectDate(date, 'Custom');
    } else {
      AppEnv.showErrorDialog(
        localized(`Sorry, we can't interpret %@ as a valid date.`, inputValue)
      );
    }
  };

  selectDate = (date, dateLabel) => {
    const nonMomentDate = date.toDate ? date.toDate() : date;
    this.props.onSelectDate(nonMomentDate, dateLabel);
  };

  renderMenuOption = optionKey => {
    const { dateOptions } = this.props;
    const date = dateOptions[optionKey]();
    const formatted = DateUtils.format(date, DATE_FORMAT_SHORT);
    return (
      <div className="date-picker-popover-option">
        {optionKey}
        <span className="time">{formatted}</span>
      </div>
    );
  };

  render() {
    const { className, header, footer, dateOptions } = this.props;

    let footerComponents: React.ReactNode[] = [
      <div key="divider" className="divider" />,
      <DateInput
        ref={cm => {
          this._dateInputComponent = cm;
        }}
        key="custom-section"
        className="section date-input-section"
        dateFormat={DATE_FORMAT_LONG}
        onDateSubmitted={this.onCustomDateSelected}
        onDateInterpreted={this.onCustomDateInterpreted}
      />,
    ];
    if (footer) {
      if (Array.isArray(footer)) {
        footerComponents = footerComponents.concat(footer);
      } else {
        footerComponents = footerComponents.concat([footer]);
      }
    }

    return (
      <div className={`date-picker-popover ${className}`}>
        <Menu
          ref={cm => {
            this._menuComponent = cm;
          }}
          items={Object.keys(dateOptions)}
          itemKey={item => item}
          itemContent={this.renderMenuOption}
          defaultSelectedIndex={-1}
          headerComponents={header}
          footerComponents={footerComponents}
          onEscape={this.onEscape}
          onSelect={this.onSelectMenuOption}
        />
      </div>
    );
  }
}

export default DatePickerPopover;
