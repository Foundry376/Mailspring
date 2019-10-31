import React, { Component } from 'react';
import {
  ListensToObservable,
  MultiselectToolbar,
  InjectedComponentSet,
} from 'mailspring-component-kit';
import PropTypes from 'prop-types';
import { SiftStore, SiftSyncDataTask, Actions } from 'mailspring-exports';
import _ from 'underscore';

function getObservable() {
  return SiftStore.selectionObservable();
}

function getStateFromObservable(items) {
  if (!items) {
    return { items: [] };
  }
  return { items };
}

class SiftListToolbar extends Component {
  static displayName = 'SiftListToolbar';

  static propTypes = {
    items: PropTypes.array,
  };

  onClearSelection = () => {
    SiftStore.dataSource().selection.clear();
  };

  _syncSiftData = _.throttle(cagtegories => {
    Actions.queueTask(new SiftSyncDataTask({ cagtegories }));
  }, 500);

  onRefreshClicked = () => {
    const category = SiftStore.siftCategory();
    if (category) {
      this._syncSiftData(category);
    }
  };

  render() {
    const { selection } = SiftStore.dataSource();
    const { items } = this.props;

    // Keep all of the exposed props from deprecated regions that now map to this one
    const toolbarElement = (
      <InjectedComponentSet
        matching={{ role: 'SiftListActionsToolbarButton' }}
        exposedProps={{ selection, items }}
      />
    );

    return (
      <MultiselectToolbar
        collection="sift"
        dataSource={SiftStore.dataSource()}
        selectionCount={items.length}
        toolbarElement={toolbarElement}
        onClearSelection={this.onClearSelection}
        renderRefresh={true}
        refreshOnClick={this.onRefreshClicked}
        renderCheckMark={false}
        renderFilterSelection={false}
      />
    );
  }
}

export default ListensToObservable(SiftListToolbar, { getObservable, getStateFromObservable });
