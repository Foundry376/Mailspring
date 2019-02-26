import React from 'react';
import { Actions } from 'mailspring-exports';
import {
  FluxContainer,
  FocusContainer,
  EmptyListState,
  MultiselectList,
} from 'mailspring-component-kit';
import DraftListStore from './draft-list-store';
import DraftListColumns from './draft-list-columns';

class DraftList extends React.Component {
  static displayName = 'DraftList';
  static containerRequired = false;
  static default = {
    buttonTimer: 500, //in milliseconds
  };

  constructor(props) {
    super(props);
    this.state = {
      isDeleting: false,
    };
    this._mounted = false;
    this._deletingTimer = false;
    this._deleteTimestamp = 0;
  }
  componentDidMount() {
    this._mounted = true;
  }
  componentWillUnmount() {
    this._mounted = false;
    clearTimeout(this._deletingTimer);
  }

  render() {
    return (
      <FluxContainer
        stores={[DraftListStore]}
        getStateFromStores={() => {
          return { dataSource: DraftListStore.dataSource() };
        }}
      >
        <FocusContainer collection="draft">
          <MultiselectList
            className="draft-list"
            columns={DraftListColumns.Wide}
            onDoubleClick={this._onDoubleClick}
            EmptyComponent={EmptyListState}
            keymapHandlers={this._keymapHandlers()}
            itemPropsProvider={this._itemPropsProvider}
            itemHeight={55}
          />
        </FocusContainer>
      </FluxContainer>
    );
  }

  _itemPropsProvider = draft => {
    const props = {};
    if (draft.uploadTaskId) {
      props.className = 'sending';
    }
    return props;
  };

  _keymapHandlers = () => {
    return {
      'core:delete-item': this._onRemoveFromView,
      'core:gmail-remove-from-view': this._onRemoveFromView,
      'core:remove-from-view': this._onRemoveFromView,
    };
  };

  _onDoubleClick = draft => {
    if (!draft.uploadTaskId) {
      Actions.composePopoutDraft(draft.headerMessageId);
    }
  };
  _changeBackToNotDeleting = () => {
    if (Date.now() - this._deleteTimestamp > this.props.buttonTimer) {
      clearTimeout(this._deletingTimer);
      this._deletingTimer = setTimeout(() => {
        if(this._mounted){
          this.setState({ isDeleting: false });
        }
      }, this.props.buttonTimer);
      this._deleteTimestamp = Date.now();
    }
  };

  _onRemoveFromView = () => {
    if (!this.state.isDeleting) {
      this.setState({ isDeleting: true }, this._changeBackToNotDeleting);
      for (const draft of DraftListStore.dataSource().selection.items()) {
        Actions.destroyDraft(draft);
      }
    }
  };
}

module.exports = DraftList;
