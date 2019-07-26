import React from 'react';
import _ from 'underscore';
import { Actions, OutboxStore, Message } from 'mailspring-exports';
import {
  FluxContainer,
  FocusContainer,
  EmptyListState,
  MultiselectList,
} from 'mailspring-component-kit';
import OutboxListColumns from './outbox-list-columns';

const buttonTimer = 500;

class OutboxList extends React.Component {
  static displayName = 'OutboxList';
  static containerRequired = false;

  constructor(props) {
    super(props);
    this.state = {
      isDeleting: false,
    };
    this._mounted = false;
    this._deletingTimer = false;
  }

  componentDidMount() {
    this._mounted = true;
  }

  componentWillUnmount() {
    this._mounted = false;
    clearTimeout(this._deletingTimer);
  }


  _calcScrollPosition = _.throttle((scrollTop) => {
    const toolbar = document.querySelector('.outbox-list .outbox-list-toolbar');
    if (toolbar) {
      if (scrollTop > 0) {
        if (toolbar.className.indexOf('has-shadow') === -1) {
          toolbar.className += ' has-shadow';
        }
      } else {
        toolbar.className = toolbar.className.replace(' has-shadow', '');
      }
    }
  }, 100)

  _onScroll = e => {
    if (e.target) {
      this._calcScrollPosition(e.target.scrollTop);
    }
  };

  render() {
    const itemHeight = 105;
    return (
      <FluxContainer
        stores={[OutboxStore]}
        getStateFromStores={() => {
          return { dataSource: OutboxStore.dataSource() };
        }}
      >
        <FocusContainer collection="outbox">
          <MultiselectList
            className="outbox-list outbox-list-narrow"
            columns={OutboxListColumns.Narrow}
            itemHeight={itemHeight}
            EmptyComponent={EmptyListState}
            keymapHandlers={this._keymapHandlers()}
            columnCheckProvider={this._itemCheckProvider}
            itemPropsProvider={this._itemPropsProvider}
            onScroll={this._onScroll}
          />
        </FocusContainer>
      </FluxContainer>
    );
  }

  _itemCheckProvider = (draft, onClick) => {
    if (Message.compareMessageState(draft.state, Message.messageState.failing)) {
      return null;
    }
    const toggle = event => {
      if (draft.state !== parseInt(Message.messageState.failing)) {
        onClick();
      }
      event.stopPropagation();
    };
    return (
      <div className="checkmark" onClick={toggle}>
        <div className="inner" />
      </div>
    );
  };

  _itemPropsProvider = draft => {
    const props = {};
    if (draft.state === parseInt(Message.messageState.failing)) {
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
  _changeBackToNotDeleting = () => {
    if (this._deletingTimer) {
      return;
    }
    this._deletingTimer = setTimeout(() => {
      if (this._mounted) {
        this.setState({ isDeleting: false });
      }
      this._deletingTimer = null;
    }, buttonTimer);
  };

  _onRemoveFromView = () => {
    if (!this.state.isDeleting && !this._deletingTimer) {
      this._changeBackToNotDeleting();
      this.setState({ isDeleting: true });
      for (const draft of OutboxStore.dataSource().selection.items()) {
        Actions.destroyDraft(draft);
      }
    }
  };
}

module.exports = OutboxList;
