import classNames from 'classnames';
import _ from 'underscore';
import {
  React,
  ReactDOM,
  PropTypes,
  Utils,
  OutboxStore,
  SearchableComponentStore,
  SearchableComponentMaker,
  WorkspaceStore,
  OnlineStatusStore
} from 'mailspring-exports';

import {
  ScrollRegion,
  KeyCommandsRegion,
  InjectedComponentSet,
} from 'mailspring-component-kit';

import MessageItemContainer from './message-item-container';
import { remote } from 'electron';
const { Menu, MenuItem } = remote;

const buttonTimeout = 700;
const TOOLBAR_MIN_WIDTH = 595;

class MessageListScrollTooltip extends React.Component {
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
    let idx = Array.from(els).findIndex(el => el.offsetTop > props.viewportCenter);
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
        {this.state.idx} of {this.state.count}
      </div>
    );
  }
}

class OutboxMessage extends React.Component {
  static displayName = 'OutboxMessage';
  static containerStyles = {
    minWidth: 500,
    maxWidth: 999999,
  };

  static default = {
    buttonTimeout: 700, // in milliseconds
  };

  constructor(props) {
    super(props);
    this.state = this._getStateFromStores();
    this.state.minified = true;
    this.state.isReplyAlling = false;
    this.state.isReplying = false;
    this.state.isForwarding = false;
    this.state.hideButtons = false;
    this._replyTimer = null;
    this._replyAllTimer = null;
    this._forwardTimer = null;
    this._mounted = false;
    this._draftScrollInProgress = false;
    this.MINIFY_THRESHOLD = 3;
  }

  componentDidMount() {
    this._mounted = true;
    this._unsubscribers = [
      OutboxStore.listen(this._onChange),
      WorkspaceStore.listen(this._onChange),
      OnlineStatusStore.listen(this._onlineStatusChange),
    ];
    window.addEventListener('resize', this._onResize, true);
    this._onResize();
    // when thread-popout, add a className "thread-popout"
    const sheetPopoutContainer = document.querySelector('.layout-mode-popout');
    if (sheetPopoutContainer) {
      sheetPopoutContainer.className += ` ${AppEnv.getWindowType()}`;
    }
  }

  shouldComponentUpdate(nextProps, nextState) {
    return !Utils.isEqualReact(nextProps, this.props) || !Utils.isEqualReact(nextState, this.state);
  }

  componentDidUpdate() {
    // cannot remove
  }

  _onlineStatusChange = () => {
    if (this.state.isOnline !== OnlineStatusStore.isOnline()) {
      this.setState({
        isOnline: OnlineStatusStore.isOnline()
      })
    }
  }

  componentWillUnmount() {
    for (const unsubscribe of this._unsubscribers) {
      unsubscribe();
    }
    this._mounted = false;
    window.removeEventListener('resize', this._onResize, true);
    clearTimeout(this._forwardTimer);
    clearTimeout(this._replyAllTimer);
    clearTimeout(this._replyTimer);
  }

  _onResize = () => {
    const container = document.querySelector('#message-list-toolbar .item-container');
    if (!container) {
      return;
    }
    let hideButtons = false;
    if (container.clientWidth <= TOOLBAR_MIN_WIDTH) {
      hideButtons = true;
    }
    if (this.state.hideButtons !== hideButtons) {
      this.setState({
        hideButtons
      })
    }
  }

  _timeoutButton = (type) => {
    if (type === 'reply') {
      if (!this._replyTimer) {
        this._replyTimer = setTimeout(() => {
          if (this._mounted) {
            this.setState({ isReplying: false });
            this._replyTimer = null;
          }
        }, buttonTimeout);
      }
    } else if (type === 'reply-all') {
      if (!this._replyAllTimer) {
        this._replyAllTimer = setTimeout(() => {
          if (this._mounted) {
            this.setState({ isReplyAlling: false });
            this._replyAllTimer = null;
          }
        }, buttonTimeout);
      }
    } else {
      if (!this._forwardTimer) {
        this._forwardTimer = setTimeout(() => {
          if (this._mounted) {
            this.setState({ isForwarding: false });
            this._forwardTimer = null;
          }
        }, buttonTimeout);
      }
    }
  };

  _getMessageContainer(headerMessageId) {
    return this.refs[`message-container-${headerMessageId}`];
  }

  _lastMessage() {
    return (this.state.messages || []).filter(m => !m.draft).pop();
  }

  _messageElements() {
    const { message, currentThread } = this.state;
    return (
      <MessageItemContainer
        key={message.id}
        ref={`message-container-${message.headerMessageId}`}
        thread={currentThread}
        message={message}
        messages={[message]}
        collapsed={false}
        isMostRecent={true}
        isBeforeReplyArea={false}
        scrollTo={this._scrollTo}
        threadPopedOut={false}
      />
    );
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
  _scrollTo = ({ headerMessageId, rect, position } = {}) => {
    if (this._draftScrollInProgress) {
      return;
    }
    if (headerMessageId) {
      const messageElement = this._getMessageContainer(headerMessageId);
      if (!messageElement) {
        return;
      }
      this._messageWrapEl.scrollTo(messageElement, {
        position: position !== undefined ? position : ScrollRegion.ScrollPosition.Visible,
      });
    } else if (rect) {
      this._messageWrapEl.scrollToRect(rect, {
        position: ScrollRegion.ScrollPosition.CenterIfInvisible,
      });
    } else {
      throw new Error('onChildScrollRequest: expected id or rect');
    }
  };

  _onScrollByPage = direction => {
    const height = ReactDOM.findDOMNode(this._messageWrapEl).clientHeight;
    this._messageWrapEl.scrollTop += height * direction;
  };

  _onChange = () => {
    const newState = this._getStateFromStores();
    this._onResize();
    this.setState(newState);
  };

  _getStateFromStores() {
    return {
      message: OutboxStore.selectedDraft(),
      isOnline: OnlineStatusStore.isOnline(),
    };
  }
  _onSelectText = e => {

    e.preventDefault();
    e.stopPropagation();

    const textNode = e.currentTarget.childNodes[0];
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, textNode.length);
    const selection = document.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  };
  _onContactContextMenu = (subject) => {
    const menu = new Menu();
    menu.append(new MenuItem({ role: 'copy' }));
    menu.popup({});
  };

  _renderSubject() {
    let subject = this.state.message.subject;
    if (!subject || subject.length === 0) {
      subject = '(No Subject)';
    }

    return (
      <div className="message-subject-wrap">
        <div style={{ flex: 1, flexWrap: 'wrap' }}>
          <span className="message-subject"
            onClick={this._onSelectText}
            onContextMenu={this._onContactContextMenu.bind(this, subject)}
          >
            {subject}
          </span>
        </div>
      </div>
    );
  }
  _calcScrollPosition = _.throttle((scrollTop) => {
    const toolbar = document.querySelector('#message-list-toolbar');
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
    if (!this.state.message) {
      return <div className={`empty ${this.state.isOnline ? '' : 'offline'}`} />;
    }

    const wrapClass = classNames({
      'messages-wrap': true,
      ready: !this.state.loading,
      'scroll-region-content-inner': true,
    });

    const messageListClass = classNames({
      'outbox-message': true,
      'height-fix': SearchableComponentStore.searchTerm !== null,
    });
    const hideButtons = this.state.hideButtons ? ' hide-btn-when-crowded' : '';

    return (
      <KeyCommandsRegion >
        <div className={'outbox-message-toolbar' + hideButtons} id="outbox-message-toolbar">
          <InjectedComponentSet
            className="item-container"
            matching={{ role: 'OutboxMessageToolbar' }}
            exposedProps={{ draft: this.state.message, hiddenLocations: WorkspaceStore.hiddenLocations() }}
          />
        </div>
        <div className={messageListClass} id="outbox-message">
          <ScrollRegion
            tabIndex="-1"
            className={wrapClass}
            scrollbarTickProvider={SearchableComponentStore}
            scrollTooltipComponent={MessageListScrollTooltip}
            ref={el => {
              this._messageWrapEl = el;
            }}
            onScroll={this._onScroll}
          >
            {this._renderSubject()}
            <div className="headers" style={{ position: 'relative' }}>
              <InjectedComponentSet
                className="message-list-headers"
                matching={{ role: 'MessageListHeaders' }}
                exposedProps={{ draft: this.state.message}}
                direction="column"
              />
            </div>
            {this._messageElements()}
          </ScrollRegion>
        </div>
      </KeyCommandsRegion>
    );
  }
}

export default SearchableComponentMaker.extend(OutboxMessage);
