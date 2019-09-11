import React, { Component } from 'react';
import {
  ListensToObservable,
  MultiselectToolbar,
  InjectedComponentSet,
} from 'mailspring-component-kit';
import PropTypes from 'prop-types';
import { OutboxStore, Message } from 'mailspring-exports';

function getObservable() {
  return OutboxStore.selectionObservable();
}

function getStateFromObservable(items) {
  if (!items) {
    return { items: [] };
  }
  return { items };
}

class OutboxListToolbar extends Component {
  static displayName = 'OutboxListToolbar';

  static propTypes = {
    items: PropTypes.array,
  };

  onClearSelection = () => {
    OutboxStore.dataSource().selection.clear();
  };
  selectAllFilter = item => {
    return Message.compareMessageState(item.state, Message.messageState.failed);
  };

  render() {
    const { selection } = OutboxStore.dataSource();
    const { items } = this.props;

    // Keep all of the exposed props from deprecated regions that now map to this one
    const toolbarElement = (
      <InjectedComponentSet
        matching={{ role: 'OutboxActionsToolbarButton' }}
        exposedProps={{ selection, items }}
      />
    );

    return (
      <MultiselectToolbar
        collection="outbox"
        dataSource={OutboxStore.dataSource()}
        selectionCount={items.length}
        toolbarElement={toolbarElement}
        onClearSelection={this.onClearSelection}
        renderRefresh={false}
        renderFilterSelection={false}
        selectAllSelectionFilter={this.selectAllFilter}
      />
    );
  }
}

export default ListensToObservable(OutboxListToolbar, { getObservable, getStateFromObservable });
