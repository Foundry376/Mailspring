import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { Thread } from 'mailspring-exports';
import { MultiselectToolbar } from 'mailspring-component-kit';
import InjectsToolbarButtons, { ToolbarRole } from './injects-toolbar-buttons';

interface ThreadListToolbarProps {
  items: Thread[];
  injectedButtons: any;
  selection: { clear: () => void };
}
class ThreadListToolbar extends Component<ThreadListToolbarProps> {
  static displayName = 'ThreadListToolbar';

  static propTypes = {
    items: PropTypes.array,
    selection: PropTypes.shape({
      clear: PropTypes.func,
    }),
    injectedButtons: PropTypes.element,
  };

  onClearSelection = () => {
    this.props.selection.clear();
  };

  render() {
    const { injectedButtons, items } = this.props;

    return (
      <MultiselectToolbar
        collection="thread"
        selectionCount={items.length}
        toolbarElement={injectedButtons}
        onClearSelection={this.onClearSelection}
      />
    );
  }
}

const toolbarProps = {
  extraRoles: [`ThreadList:${ToolbarRole}`],
};

export default InjectsToolbarButtons(ThreadListToolbar, toolbarProps);
