import moment from 'moment';
import React from 'react';
import PropTypes from 'prop-types';
import { localized } from 'mailspring-exports';
import { DropdownMenu, Menu } from 'mailspring-component-kit';
import { getTimespanOptions } from './timespan';
import { Timespan } from './root';

export default class TimespanSelector extends React.Component<{
  timespan: Timespan;
  onChange: (id: string) => void;
}> {
  static propTypes = {
    timespan: PropTypes.object,
    onChange: PropTypes.func,
  };

  render() {
    const { id, startDate, endDate } = this.props.timespan;

    const options = getTimespanOptions();
    const itemIdx = options.findIndex(item => item.id === id);

    const longFormat = id.startsWith('month')
      ? localized('MMMM Do, h:mmA')
      : localized('dddd MMMM Do, h:mmA');
    const endFormat =
      endDate.diff(moment(), 'days') === 0 ? localized('Now') : endDate.format(longFormat);
    return (
      <div className="timespan-selector">
        <div className="timespan-text">{`${startDate.format(longFormat)} - ${endFormat}`}</div>
        <DropdownMenu
          className="hidden-on-web"
          attachment={DropdownMenu.Attachment.RightEdge}
          intitialSelectionItem={options[itemIdx]}
          defaultSelectedIndex={itemIdx}
          headerComponents={[]}
          footerComponents={[]}
          items={options}
          itemKey={item => item.id}
          itemContent={item => (item.divider ? <Menu.Item key="divider" divider /> : item.name)}
          onSelect={item => this.props.onChange(item.id)}
        />
      </div>
    );
  }
}
