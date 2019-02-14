import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { MultiselectToolbar } from 'mailspring-component-kit';
import InjectsToolbarButtons, { ToolbarRole } from './injects-toolbar-buttons';

class ThreadListToolbar extends Component {
  static displayName = 'ThreadListToolbar';

  static propTypes = {
    items: PropTypes.array,
    selection: PropTypes.shape({
      clear: PropTypes.func,
    }),
    injectedButtons: PropTypes.element,
    dataSource: PropTypes.object
  };

  onClearSelection = () => {
    this.props.selection.clear();
  };

  render() {
    const { injectedButtons, items, dataSource } = this.props;

    return (
      <MultiselectToolbar
        collection="thread"
        selectionCount={items.length}
        toolbarElement={injectedButtons}
        onClearSelection={this.onClearSelection}
        dataSource={dataSource}
      />
    );
  }
}

const toolbarProps = {
  extraRoles: [`ThreadList:${ToolbarRole}`],
};

export default InjectsToolbarButtons(ThreadListToolbar, toolbarProps);
