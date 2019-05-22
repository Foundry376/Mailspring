import React from 'react';
import PropTypes from 'prop-types';
import { Utils, Actions, AttachmentStore, MessageStore, EmailAvatar } from 'mailspring-exports';
import { RetinaImg, InjectedComponentSet, InjectedComponent } from 'mailspring-component-kit';

import MessageParticipants from './message-participants';
import MessageItemBody from './message-item-body';
import MessageTimestamp from './message-timestamp';
import MessageControls from './message-controls';
import TaskFactory from '../../../src/flux/tasks/task-factory';

export default class MessageItem extends React.Component {
  static displayName = 'MessageItem';

  static propTypes = {
    thread: PropTypes.object.isRequired,
    message: PropTypes.object.isRequired,
    messages: PropTypes.array.isRequired,
    collapsed: PropTypes.bool,
    pending: PropTypes.bool,
    isMostRecent: PropTypes.bool,
    className: PropTypes.string,
    threadPopedOut: PropTypes.bool,
  };

  constructor(props, context) {
    super(props, context);

    const fileIds = this.props.message.fileIds();
    this.state = {
      // Holds the downloadData (if any) for all of our files. It's a hash
      // keyed by a fileId. The value is the downloadData.
      downloads: AttachmentStore.getDownloadDataForFiles(fileIds),
      filePreviewPaths: AttachmentStore.previewPathsForFiles(fileIds),
      detailedHeaders: false,
      missingFileIds: MessageStore.getMissingFileIds(),
    };
    this.markAsReadTimer = null;
    this.mounted = false;
  }

  componentDidMount() {
    this._storeUnlisten = [
      AttachmentStore.listen(this._onDownloadStoreChange),
      MessageStore.listen(this._onDownloadStoreChange),
    ];
    this.mounted = true;
  }

  shouldComponentUpdate(nextProps, nextState) {
    return !Utils.isEqualReact(nextProps, this.props) || !Utils.isEqualReact(nextState, this.state);
  }

  componentWillUnmount() {
    this.mounted = false;
    clearTimeout(this.markAsReadTimer);
    if (this._storeUnlisten) {
      for (let un of this._storeUnlisten) {
        un();
      }
    }
  }

  _onClickParticipants = e => {
    let el = e.target;
    while (el !== e.currentTarget) {
      if (el.classList.contains('collapsed-participants')) {
        this.setState({ detailedHeaders: true });
        e.stopPropagation();
        return;
      }
      el = el.parentElement;
    }
    return;
  };

  _onClickHeader = e => {
    this._onToggleCollapsed();
  };

  _onDownloadAll = () => {
    Actions.fetchAndSaveAllFiles(this.props.message.files);
  };

  _onToggleCollapsed = () => {
    if (this.props.isMostRecent) {
      return;
    }
    Actions.toggleMessageIdExpanded(this.props.message.id);
  };

  _onDownloadStoreChange = () => {
    const fileIds = this.props.message.fileIds();
    this.setState({
      downloads: AttachmentStore.getDownloadDataForFiles(fileIds),
      filePreviewPaths: AttachmentStore.previewPathsForFiles(fileIds),
      missingFileIds: MessageStore.getMissingFileIds(),
    });
  };
  _cancelMarkAsRead = () => {
    if (this.markAsReadTimer) {
      clearTimeout(this.markAsReadTimer);
      this.markAsReadTimer = null;
    }
  };
  _markAsRead = () => {
    if (!this.props.message) {
      return;
    }
    if (this.props.collapsed || this.props.pending) {
      return;
    }
    if (!this.props.message.unread || this.props.message.draft) {
      return;
    }
    if (this.markAsReadTimer) {
      return;
    }
    const messageId = this.props.message.id;
    const threadId = this.props.message.threadId;
    const markAsReadDelay = AppEnv.config.get('core.reading.markAsReadDelay');
    this.markAsReadTimer = setTimeout(() => {
      this.markAsReadTimer = null;
      if (!this.props.message || !this.mounted || this.props.pending) {
        return;
      }
      if (threadId !== this.props.message.threadId || messageId !== this.props.message.id) {
        return;
      }
      if (!this.props.message.unread) {
        return;
      }
      Actions.queueTask(
        TaskFactory.taskForInvertingUnread({
          threads: [this.props.thread],
          source: 'Thread Selected',
          canBeUndone: false,
          unread: false,
        }),
      );
    }, markAsReadDelay);
  };

  _renderDownloadAllButton() {
    return (
      <div className="download-all">
        <div className="attachment-number">
          <RetinaImg name="feed-attachments.svg"
                     isIcon
                     style={{ width: 18, height: 18 }}
                     mode={RetinaImg.Mode.ContentIsMask}/>
          <span>{this.props.message.files.length} attachments</span>
        </div>
        <div className="separator">-</div>
        <div className="download-all-action" onClick={this._onDownloadAll}>
          <RetinaImg name="download.svg"
                     isIcon
                     style={{ width: 18, height: 18 }}
                     mode={RetinaImg.Mode.ContentIsMask}/>
          <span>Download all</span>
        </div>
      </div>
    );
  }

  _renderAttachments() {
    const { files = [], body, id } = this.props.message;
    const { filePreviewPaths, downloads } = this.state;
    const attachedFiles = files.filter(
      f => !f.contentId || !(body || '').includes(`cid:${f.contentId}`),
    );

    return (
      <div>
        {files.length > 1 ? this._renderDownloadAllButton() : null}
        {attachedFiles.length > 0 && (
          <div className="attachments-area">
            <InjectedComponent
              matching={{ role: 'MessageAttachments' }}
              exposedProps={{
                files: attachedFiles,
                messageId: id,
                downloads,
                filePreviewPaths,
                canRemoveAttachments: false,
              }}
            />
          </div>
        )}
      </div>
    );
  }

  _renderFooterStatus() {
    return (
      <InjectedComponentSet
        className="message-footer-status"
        matching={{ role: 'MessageFooterStatus' }}
        exposedProps={{
          message: this.props.message,
          thread: this.props.thread,
          detailedHeaders: this.state.detailedHeaders,
        }}
      />
    );
  }

  _renderHeader() {
    const { message, thread, messages, pending } = this.props;

    return (
      <header
        ref={el => (this._headerEl = el)}
        className={`message-header `}
        onClick={this._onClickHeader}
      >
        <InjectedComponent
          matching={{ role: 'MessageHeader' }}
          exposedProps={{ message: message, thread: thread, messages: messages }}
        />
        {/*<div className="pending-spinner" style={{ position: 'absolute', marginTop: -2, left: 55 }}>*/}
        {/*  <RetinaImg width={18} name="sending-spinner.gif" mode={RetinaImg.Mode.ContentPreserve} />*/}
        {/*</div>*/}
        <div className="message-header-right">
          <InjectedComponentSet
            className="message-header-status"
            matching={{ role: 'MessageHeaderStatus' }}
            exposedProps={{
              message: message,
              thread: thread,
              detailedHeaders: this.state.detailedHeaders,
            }}
          />
          <MessageControls thread={thread} message={message} threadPopedOut={this.props.threadPopedOut}/>
        </div>
        <div className='row'>
          <EmailAvatar
            key="thread-avatar"
            from={message.from && message.from[0]}
            messagePending={this.props.pending}
          />
          <div>
            <MessageParticipants
              from={message.from}
              onClick={this._onClickParticipants}
              isDetailed={this.state.detailedHeaders}
            />
            <MessageTimestamp
              className="message-time"
              isDetailed
              date={message.date}
            />
            {this._renderHeaderDetailToggle()}
          </div>
        </div>
        <MessageParticipants
          detailFrom={message.from}
          to={message.to}
          cc={message.cc}
          bcc={message.bcc}
          replyTo={message.replyTo.filter(c => !message.from.find(fc => fc.email === c.email))}
          onClick={this._onClickParticipants}
          isDetailed={this.state.detailedHeaders}
        />
        {/* {this._renderFolder()} */}
      </header>
    );
  }

  _renderHeaderDetailToggle() {
    if (this.props.pending) {
      return null;
    }
    if (this.state.detailedHeaders) {
      return (
        <div
          className="header-toggle-control"
          style={{ top: 18, left: -14 }}
          onClick={e => {
            this.setState({ detailedHeaders: false });
            e.stopPropagation();
          }}
        >
          less
        </div>
      );
    }

    return (
      <div
        className="header-toggle-control inactive"
        style={{ top: 18 }}
        onClick={e => {
          this.setState({ detailedHeaders: true });
          e.stopPropagation();
        }}
      >
        more
      </div>
    );
  }

  _renderFolder() {
    if (!this.state.detailedHeaders) {
      return false;
    }

    const folder = this.props.message.folder;
    if (!folder || folder.role === 'al') {
      return false;
    }

    return (
      <div className="header-row">
        <div className="header-label">Folder:&nbsp;</div>
        <div className="header-name">{folder.displayName}</div>
      </div>
    );
  }

  _renderCollapsed() {
    const { message: { snippet, from, files, date, draft }, className } = this.props;

    const attachmentIcon = Utils.showIconForAttachments(files) ? (
      <div className="collapsed-attachment"/>
    ) : null;

    return (
      <div className={className} onClick={this._onToggleCollapsed}>
        <div className="message-item-white-wrap">
          <div className="message-item-area">
            <EmailAvatar
              key="thread-avatar"
              from={from && from[0]}
            />
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <div className="row">
                <div className="collapsed-from">
                  {from && from[0] && from[0].displayName({ compact: true })}
                </div>
                {draft && (
                  <div className="collapsed-pencil"/>
                )}
                {attachmentIcon}
                <div className="collapsed-timestamp">
                  <MessageTimestamp date={date}/>
                </div>
              </div>
              <div className="collapsed-snippet">{snippet}</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  _renderFull() {
    return (
      <div className={this.props.className} onMouseEnter={this._markAsRead} onMouseLeave={this._cancelMarkAsRead}>
        <div className="message-item-white-wrap">
          <div className="message-item-area">
            {this._renderHeader()}
            <MessageItemBody message={this.props.message} downloads={this.state.downloads}/>
            {this._renderAttachments()}
            {this._renderFooterStatus()}
          </div>
        </div>
      </div>
    );
  }

  render() {
    return this.props.collapsed ? this._renderCollapsed() : this._renderFull();
  }
}
