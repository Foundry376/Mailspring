import React from 'react';
import PropTypes from 'prop-types';
import { CSSTransitionGroup } from 'react-transition-group';
import { Rx, FocusedContentStore, Thread } from 'mailspring-exports';
import ThreadListStore from './thread-list-store';
import InjectsToolbarButtons, { ToolbarRole } from './injects-toolbar-buttons';

function getObservable() {
  return Rx.Observable.combineLatest(
    Rx.Observable.fromStore(FocusedContentStore),
    ThreadListStore.selectionObservable(),
    (store: FocusedContentStore, items: Thread[]) => ({
      focusedThread: store.focused('thread'),
      items,
    })
  ).map(({ focusedThread, items }) => {
    if (focusedThread) {
      return [focusedThread];
    }
    return items;
  });
}

const MessageListToolbar = ({ items, injectedButtons }) => {
  const shouldRender = items.length > 0;

  return (
    <CSSTransitionGroup
      className="message-toolbar-items"
      transitionLeaveTimeout={125}
      transitionEnterTimeout={125}
      transitionName="opacity-125ms"
    >
      {shouldRender ? injectedButtons : undefined}
    </CSSTransitionGroup>
  );
};
MessageListToolbar.displayName = 'MessageListToolbar';
MessageListToolbar.propTypes = {
  items: PropTypes.array,
  injectedButtons: PropTypes.element,
};

const toolbarProps = {
  getObservable,
  extraRoles: [`MessageList:${ToolbarRole}`],
};

export default InjectsToolbarButtons(MessageListToolbar, toolbarProps);
