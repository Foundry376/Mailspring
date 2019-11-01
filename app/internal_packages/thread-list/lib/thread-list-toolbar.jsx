import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { MultiselectToolbar, InjectedComponentSet } from 'mailspring-component-kit';
import InjectsToolbarButtons, { ToolbarRole } from './injects-toolbar-buttons';

class ThreadListToolbar extends Component {
  static displayName = 'ThreadListToolbar';

  static propTypes = {
    items: PropTypes.array,
    selection: PropTypes.shape({
      clear: PropTypes.func,
    }),
    onEmptyButtons: PropTypes.element,
    dataSource: PropTypes.object,
  };

  onClearSelection = () => {
    this.props.selection.clear();
  };

  render() {
    const { items, dataSource, onEmptyButtons, selection } = this.props;

    const toolbarElement = (
      <InjectedComponentSet
        matching={{ role: 'ThreadListToolbarButtons' }}
        exposedProps={{ selection, items }}
        style={{ height: 'auto', width: '100%' }}
      />
    );

    return (
      <MultiselectToolbar
        collection="thread"
        selectionCount={items.length}
        toolbarElement={toolbarElement}
        onEmptyButtons={onEmptyButtons}
        onClearSelection={this.onClearSelection}
        dataSource={dataSource}
      />
    );
  }
}

const toolbarProps = {
  extraRoles: [`ThreadList:${ToolbarRole}Empty`],
  onEmpty: {
    roles: [`${ToolbarRole}Empty`],
    modes: ['list']
  }
};

export default InjectsToolbarButtons(ThreadListToolbar, toolbarProps);
