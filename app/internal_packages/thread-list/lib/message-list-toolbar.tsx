import React from 'react';
import { CSSTransitionGroup } from 'react-transition-group';
import { Rx, FocusedContentStore, Thread } from 'mailspring-exports';
import ThreadListStore from './thread-list-store';
import InjectsToolbarButtons, { ToolbarRole } from './injects-toolbar-buttons';

function getObservable() {
  return Rx.Observable.combineLatest(
    Rx.Observable.fromStore(FocusedContentStore),
    ThreadListStore.selectionObservable(),
    (store, items) => ({
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

const MessageListToolbar = ({
  items,
  injectedButtons,
}: {
  items: Thread[];
  injectedButtons?: React.ReactElement;
}) => {
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

const toolbarProps = {
  getObservable,
  extraRoles: [`MessageList:${ToolbarRole}`],
};

export default InjectsToolbarButtons(MessageListToolbar, toolbarProps);
