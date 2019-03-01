import classNames from 'classnames';
import React from 'react';
import ReactDOM from 'react-dom';

import {
  localized,
  PropTypes,
  Utils,
  Actions,
  MessageStore,
  Message,
  Thread,
  SearchableComponentStore,
  SearchableComponentMaker,
} from 'mailspring-exports';

import {
  Spinner,
  RetinaImg,
  MailLabelSet,
  ScrollRegion,
  ScrollPosition,
  MailImportantIcon,
  KeyCommandsRegion,
  InjectedComponentSet,
} from 'mailspring-component-kit';

import FindInThread from './find-in-thread';
import MessageItemContainer from './message-item-container';

class MessageListScrollTooltip extends React.Component<
  { viewportCenter: number; totalHeight: number },
  { idx: number; count: number }
> {
  static displayName = 'MessageListScrollTooltip';
  static propTypes = {
    viewportCenter: PropTypes.number.isRequired,
    totalHeight: PropTypes.number.isRequired,
  };

  componentWillMount() {
    this.setupForProps(this.props);
  }

  componentWillReceiveProps(newProps) {
    this.setupForProps(newProps);
  }

  shouldComponentUpdate(newProps, newState) {
    return !Utils.isEqualReact(this.state, newState);
  }

  setupForProps(props) {
    // Technically, we could have MessageList provide the currently visible
    // item index, but the DOM approach is simple and self-contained.
    //
    const els = document.querySelectorAll('.message-item-wrap');
    let idx = Array.from(els).findIndex(el => (el as HTMLElement).offsetTop > props.viewportCenter);
    if (idx === -1) {
      idx = els.length;
    }

    this.setState({
      idx: idx,
      count: els.length,
    });
  }

  render() {
    return (
      <div className="scroll-tooltip">
        {localized('%1$@ of %2$@', this.state.idx, this.state.count)}
      </div>
    );
  }
}

interface MessageListState {
  messages: Message[];
  messagesExpandedState: {
    [messageId: string]: 'explicit' | 'default';
  };
  canCollapse: boolean;
  hasCollapsedItems: boolean;
  currentThread: Thread | null;
  loading: boolean;
  minified: boolean;
}

class MessageList extends React.Component<{}, MessageListState> {
  static displayName = 'MessageList';
  static containerStyles = {
    minWidth: 500,
    maxWidth: 999999,
  };

  _unsubscribers = [];
  _messageWrapEl: ScrollRegion;
  _draftScrollInProgress = false;
  MINIFY_THRESHOLD = 3;

  constructor(props) {
    super(props);
    this.state = Object.assign(this._getStateFromStores(), { minified: true });
  }

  componentDidMount() {
    this._unsubscribers = [];
    this._unsubscribers.push(MessageStore.listen(this._onChange));
  }

  shouldComponentUpdate(nextProps, nextState) {
    return !Utils.isEqualReact(nextProps, this.props) || !Utils.isEqualReact(nextState, this.state);
  }

  componentDidUpdate() {
    // cannot remove
  }

  componentWillUnmount() {
    for (const unsubscribe of this._unsubscribers) {
      unsubscribe();
    }
  }

  _globalKeymapHandlers() {
    const handlers = {
      'core:reply': () =>
        Actions.composeReply({
          thread: this.state.currentThread,
          message: this._lastMessage(),
          type: 'reply',
          behavior: 'prefer-existing',
        }),
      'core:reply-all': () =>
        Actions.composeReply({
          thread: this.state.currentThread,
          message: this._lastMessage(),
          type: 'reply-all',
          behavior: 'prefer-existing',
        }),
      'core:forward': () => this._onForward(),
      'core:print-thread': () => this._onPrintThread(),
      'core:messages-page-up': () => this._onScrollByPage(-1),
      'core:messages-page-down': () => this._onScrollByPage(1),
    };

    if (this.state.canCollapse) {
      handlers['message-list:toggle-expanded'] = () => this._onToggleAllMessagesExpanded();
    }

    return handlers;
  }

  _getMessageContainer(headerMessageId) {
    return this.refs[`message-container-${headerMessageId}`];
  }

  _onForward = () => {
    if (!this.state.currentThread) {
      return;
    }
    Actions.composeForward({
      thread: this.state.currentThread,
      message: this._lastMessage(),
    });
  };

  _lastMessage() {
    return (this.state.messages || []).filter(m => !m.draft).pop();
  }

  // Returns either "reply" or "reply-all"
  _replyType() {
    const defaultReplyType = AppEnv.config.get('core.sending.defaultReplyType');
    const lastMessage = this._lastMessage();
    if (!lastMessage) {
      return 'reply';
    }

    if (lastMessage.canReplyAll()) {
      return defaultReplyType === 'reply-all' ? 'reply-all' : 'reply';
    }
    return 'reply';
  }

  _onToggleAllMessagesExpanded = () => {
    Actions.toggleAllMessagesExpanded();
  };

  _onPrintThread = () => {
    const node = ReactDOM.findDOMNode(this) as HTMLElement;
    Actions.printThread(this.state.currentThread, node.innerHTML);
  };

  _onPopThreadIn = () => {
    if (!this.state.currentThread) {
      return;
    }
    Actions.focusThreadMainWindow(this.state.currentThread);
    AppEnv.close();
  };

  _onPopoutThread = () => {
    if (!this.state.currentThread) {
      return;
    }
    Actions.popoutThread(this.state.currentThread);
    // This returns the single-pane view to the inbox, and does nothing for
    // double-pane view because we're at the root sheet.
    Actions.popSheet();
  };

  _onClickReplyArea = () => {
    if (!this.state.currentThread) {
      return;
    }
    Actions.composeReply({
      thread: this.state.currentThread,
      message: this._lastMessage(),
      type: this._replyType(),
      behavior: 'prefer-existing-if-pristine',
    });
  };

  _messageElements() {
    const { messagesExpandedState, currentThread } = this.state;
    const elements = [];

    let messages = this._messagesWithMinification(this.state.messages);
    const mostRecentMessage = messages[messages.length - 1];
    const hasReplyArea = mostRecentMessage && !mostRecentMessage.draft;

    // Invert the message list if the descending option is set
    if (AppEnv.config.get('core.reading.descendingOrderMessageList')) {
      messages = messages.reverse();
    }

    messages.forEach(message => {
      if (message.type === 'minifiedBundle') {
        elements.push(this._renderMinifiedBundle(message));
        return;
      }

      const collapsed = !messagesExpandedState[message.id];
      const isMostRecent = message === mostRecentMessage;
      const isBeforeReplyArea = isMostRecent && hasReplyArea;

      elements.push(
        <MessageItemContainer
          key={message.id}
          ref={`message-container-${message.headerMessageId}`}
          thread={currentThread}
          message={message}
          messages={messages}
          collapsed={collapsed}
          isMostRecent={isMostRecent}
          isBeforeReplyArea={isBeforeReplyArea}
          scrollTo={this._scrollTo}
        />
      );

      if (isBeforeReplyArea) {
        elements.push(this._renderReplyArea());
      }
    });

    return elements;
  }

  _messagesWithMinification(allMessages = []) {
    if (!this.state.minified) {
      return allMessages;
    }

    const messages = [].concat(allMessages);
    const minifyRanges = [];
    let consecutiveCollapsed = 0;

    messages.forEach((message, idx) => {
      // Never minify the 1st message
      if (idx === 0) {
        return;
      }

      const expandState = this.state.messagesExpandedState[message.id];

      if (!expandState) {
        consecutiveCollapsed += 1;
      } else {
        // We add a +1 because we don't minify the last collapsed message,
        // but the MINIFY_THRESHOLD refers to the smallest N that can be in
        // the "N older messages" minified block.
        const minifyOffset = expandState === 'default' ? 1 : 0;

        if (consecutiveCollapsed >= this.MINIFY_THRESHOLD + minifyOffset) {
          minifyRanges.push({
            start: idx - consecutiveCollapsed,
            length: consecutiveCollapsed - minifyOffset,
          });
        }
        consecutiveCollapsed = 0;
      }
    });

    let indexOffset = 0;
    for (const range of minifyRanges) {
      const start = range.start - indexOffset;
      const minified = {
        type: 'minifiedBundle',
        messages: messages.slice(start, start + range.length),
      };
      messages.splice(start, range.length, minified);

      // While we removed `range.length` items, we also added 1 back in.
      indexOffset += range.length - 1;
    }
    return messages;
  }

  // Some child components (like the composer) might request that we scroll
  // to a given location. If `selectionTop` is defined that means we should
  // scroll to that absolute position.
  //
  // If messageId and location are defined, that means we want to scroll
  // smoothly to the top of a particular message.
  _scrollTo = ({
    headerMessageId,
    rect,
    position,
  }: {
    headerMessageId?: string;
    rect?: ClientRect;
    position?: ScrollPosition;
  } = {}) => {
    if (this._draftScrollInProgress) {
      return;
    }
    if (headerMessageId) {
      const messageElement = this._getMessageContainer(headerMessageId);
      if (!messageElement) return;

      this._messageWrapEl.scrollTo(messageElement, {
        position: position !== undefined ? position : ScrollPosition.Visible,
      });
    } else if (rect) {
      this._messageWrapEl.scrollToRect(rect, {
        position: ScrollPosition.CenterIfInvisible,
      });
    } else {
      throw new Error('onChildScrollRequest: expected id or rect');
    }
  };

  _onScrollByPage = direction => {
    const height = (ReactDOM.findDOMNode(this._messageWrapEl) as HTMLElement).clientHeight;
    this._messageWrapEl.scrollTop += height * direction;
  };

  _onChange = () => {
    const newState: any = this._getStateFromStores();
    const threadId = this.state.currentThread && this.state.currentThread.id;
    const nextThreadId = newState.currentThread && newState.currentThread.id;
    if (threadId !== nextThreadId) {
      newState.minified = true;
    }
    this.setState(newState);
  };

  _getStateFromStores() {
    return {
      messages: MessageStore.items() || [],
      messagesExpandedState: MessageStore.itemsExpandedState(),
      canCollapse: MessageStore.items().length > 1,
      hasCollapsedItems: MessageStore.hasCollapsedItems(),
      currentThread: MessageStore.thread(),
      loading: MessageStore.itemsLoading(),
    };
  }

  _renderSubject() {
    let subject = this.state.currentThread.subject;
    if (!subject || subject.length === 0) {
      subject = localized('(No Subject)');
    }

    return (
      <div className="message-subject-wrap">
        <MailImportantIcon thread={this.state.currentThread} />
        <div style={{ flex: 1 }}>
          <span className="message-subject">{subject}</span>
          <MailLabelSet
            removable
            includeCurrentCategories
            messages={this.state.messages}
            thread={this.state.currentThread}
          />
        </div>
        {this._renderIcons()}
      </div>
    );
  }

  _renderIcons() {
    return (
      <div className="message-icons-wrap">
        {this._renderExpandToggle()}
        <div onClick={this._onPrintThread}>
          <RetinaImg
            name="print.png"
            title={localized('Print Thread')}
            mode={RetinaImg.Mode.ContentIsMask}
          />
        </div>
        {this._renderPopoutToggle()}
      </div>
    );
  }

  _renderExpandToggle() {
    if (!this.state.canCollapse) {
      return <span />;
    }

    return (
      <div onClick={this._onToggleAllMessagesExpanded}>
        <RetinaImg
          name={this.state.hasCollapsedItems ? 'expand.png' : 'collapse.png'}
          title={this.state.hasCollapsedItems ? localized('Expand All') : localized('Collapse All')}
          mode={RetinaImg.Mode.ContentIsMask}
        />
      </div>
    );
  }

  _renderPopoutToggle() {
    if (AppEnv.isThreadWindow()) {
      return (
        <div onClick={this._onPopThreadIn}>
          <RetinaImg
            name="thread-popin.png"
            title={localized('Pop thread in')}
            mode={RetinaImg.Mode.ContentIsMask}
          />
        </div>
      );
    }
    return (
      <div onClick={this._onPopoutThread}>
        <RetinaImg
          name="thread-popout.png"
          title={localized('Popout thread')}
          mode={RetinaImg.Mode.ContentIsMask}
        />
      </div>
    );
  }

  _renderReplyArea() {
    return (
      <div className="footer-reply-area-wrap" onClick={this._onClickReplyArea} key="reply-area">
        <div className="footer-reply-area">
          <RetinaImg name={`${this._replyType()}-footer.png`} mode={RetinaImg.Mode.ContentIsMask} />
          <span className="reply-text">{localized('Write a reply…')}</span>
        </div>
      </div>
    );
  }

  _renderMinifiedBundle(bundle) {
    const BUNDLE_HEIGHT = 36;
    const lines = bundle.messages.slice(0, 10);
    const h = Math.round(BUNDLE_HEIGHT / lines.length);

    return (
      <div
        className="minified-bundle"
        onClick={() => this.setState({ minified: false })}
        key={Utils.generateTempId()}
      >
        <div className="num-messages">{`${bundle.messages.length} ${localized(
          'older messages'
        )}`}</div>
        <div className="msg-lines" style={{ height: h * lines.length }}>
          {lines.map((msg, i) => (
            <div key={msg.id} style={{ height: h * 2, top: -h * i }} className="msg-line" />
          ))}
        </div>
      </div>
    );
  }

  render() {
    if (!this.state.currentThread) {
      return <span />;
    }

    const wrapClass = classNames({
      'messages-wrap': true,
      ready: !this.state.loading,
    });

    const messageListClass = classNames({
      'message-list': true,
      'height-fix': SearchableComponentStore.searchTerm !== null,
    });

    return (
      <KeyCommandsRegion globalHandlers={this._globalKeymapHandlers()}>
        <FindInThread />
        <div className={messageListClass} id="message-list">
          <ScrollRegion
            tabIndex={-1}
            className={wrapClass}
            scrollbarTickProvider={SearchableComponentStore}
            scrollTooltipComponent={MessageListScrollTooltip}
            ref={el => {
              this._messageWrapEl = el;
            }}
          >
            {this._renderSubject()}
            <div className="headers" style={{ position: 'relative' }}>
              <InjectedComponentSet
                className="message-list-headers"
                matching={{ role: 'MessageListHeaders' }}
                exposedProps={{ thread: this.state.currentThread, messages: this.state.messages }}
                direction="column"
              />
            </div>
            {this._messageElements()}
          </ScrollRegion>
          <Spinner visible={this.state.loading} />
        </div>
      </KeyCommandsRegion>
    );
  }
}

export default SearchableComponentMaker.extend(MessageList);
