import React from 'react';
import { DropdownMenu, Menu } from 'mailspring-component-kit';
import { getTimespanOptions, Timespan } from './timespan';

export default class TimespanSelector extends React.Component<{
  timespan: Timespan;
  onChange: (id: string) => void;
}> {
  render() {
    const options = getTimespanOptions();
    const itemIdx = options.findIndex((item) => item.id === this.props.timespan.id);

    return (
      <div className="timespan-selector">
        <DropdownMenu
          className="hidden-on-web"
          attachment={DropdownMenu.Attachment.RightEdge}
          intitialSelectionItem={options[itemIdx]}
          defaultSelectedIndex={itemIdx}
          headerComponents={[]}
          footerComponents={[]}
          items={options}
          itemKey={(item) => item.id}
          itemContent={(item) => (item.divider ? <Menu.Item key="divider" divider /> : item.name)}
          onSelect={(item) => this.props.onChange(item.id)}
        />
      </div>
    );
  }
}
