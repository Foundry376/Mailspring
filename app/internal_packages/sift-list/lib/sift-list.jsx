import React from 'react';
import ReactDOM from 'react-dom';
import _ from 'underscore';
import classnames from 'classnames';
import { Actions, SiftStore, Message, WorkspaceStore, ThreadStore } from 'mailspring-exports';
import {
  FluxContainer,
  FocusContainer,
  EmptyListState,
  MultiselectList,
} from 'mailspring-component-kit';
import SiftListColumns from './sift-list-columns';

const buttonTimer = 500;

class SiftList extends React.Component {
  static displayName = 'SiftList';
  static containerRequired = true;

  static containerStyles = {
    minWidth: 375,
    maxWidth: 3000,
  };

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
    window.addEventListener('resize', this._onResize, true);
    this._onResize();
  }

  componentWillUnmount() {
    this._mounted = false;
    window.removeEventListener('resize', this._onResize, true);
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
  }, 100);

  _onScroll = e => {
    if (e.target) {
      this._calcScrollPosition(e.target.scrollTop);
    }
  };

  _onResize = event => {
    const current = this.state.style;
    const layoutMode = WorkspaceStore.layoutMode();
    // const desired = ReactDOM.findDOMNode(this).offsetWidth < 540 ? 'narrow' : 'wide';
    const desired =
      ReactDOM.findDOMNode(this).offsetWidth < 900 && layoutMode === 'split' ? 'narrow' : 'wide';
    if (current !== desired) {
      this.setState({ style: desired });
    }
  };

  _itemPropsProvider = item => {
    let classes = classnames({
      unread: item.unread,
    });
    return { className: classes };
  };
  _onFocusItem = message => {
    Actions.setFocus({ collection: 'sift', item: message });
    ThreadStore.findBy({ threadId: message.threadId }).then(result => {
      Actions.setFocus({ collection: 'thread', item: result });
    });
  };
  _onSetCursorPosition = message => {
    Actions.setCursorPosition({ collection: 'sift', item: message });
    ThreadStore.findBy({ threadId: message.threadId }).then(result => {
      Actions.setCursorPosition({ collection: 'thread', item: result });
    });
  };
  render() {
    const layoutMode = WorkspaceStore.layoutMode();
    let columns;
    let additionalClassName;
    let itemHeight;
    if (this.state.style === 'wide' || layoutMode === 'list') {
      columns = SiftListColumns.Wide;
      additionalClassName = 'sift-list-wide';
      itemHeight = 55;
    } else {
      columns = SiftListColumns.Narrow;
      additionalClassName = 'sift-list-narrow';
      itemHeight = 108;
    }
    return (
      <FluxContainer
        stores={[SiftStore]}
        getStateFromStores={() => {
          return { dataSource: SiftStore.dataSource() };
        }}
      >
        <FocusContainer
          collection="sift"
          onFocusItem={this._onFocusItem}
          onSetCursorPosition={this._onSetCursorPosition}
        >
          <MultiselectList
            className={`sift-list ${additionalClassName}`}
            columns={columns}
            itemHeight={itemHeight}
            EmptyComponent={EmptyListState}
            columnCheckProvider={this._columnCheckProvider}
            itemPropsProvider={this._itemPropsProvider}
            keymapHandlers={this._keymapHandlers()}
            onScroll={this._onScroll}
          />
        </FocusContainer>
      </FluxContainer>
    );
  }
  _columnCheckProvider = () => {
    return null;
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
      for (const draft of SiftStore.dataSource().selection.items()) {
        // Actions.destroyDraft(draft);
      }
    }
  };
}

module.exports = SiftList;
