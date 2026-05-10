import React from 'react';
import { CSSTransition, TransitionGroup } from 'react-transition-group';
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
    <TransitionGroup className="message-toolbar-items" component="div">
      {shouldRender ? (
        <CSSTransition key="buttons" classNames="opacity-125ms" timeout={125}>
          {injectedButtons}
        </CSSTransition>
      ) : undefined}
    </TransitionGroup>
  );
};
MessageListToolbar.displayName = 'MessageListToolbar';

const toolbarProps = {
  getObservable,
  extraRoles: [`MessageList:${ToolbarRole}`],
};

export default InjectsToolbarButtons(MessageListToolbar, toolbarProps);
