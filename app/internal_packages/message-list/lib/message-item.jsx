import React from 'react';
import PropTypes from 'prop-types';
import { Utils, Actions, AttachmentStore } from 'mailspring-exports';
import { RetinaImg, InjectedComponentSet, InjectedComponent } from 'mailspring-component-kit';

import MessageParticipants from './message-participants';
import MessageItemBody from './message-item-body';
import MessageTimestamp from './message-timestamp';
import MessageControls from './message-controls';

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
    };
  }

  componentDidMount() {
    this._storeUnlisten = AttachmentStore.listen(this._onDownloadStoreChange);
  }

  shouldComponentUpdate(nextProps, nextState) {
    return !Utils.isEqualReact(nextProps, this.props) || !Utils.isEqualReact(nextState, this.state);
  }

  componentWillUnmount() {
    if (this._storeUnlisten) {
      this._storeUnlisten();
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
    });
  };

  _renderDownloadAllButton() {
    return (
      <div className="download-all">
        <div className="attachment-number">
          <RetinaImg name="ic-attachments-all-clippy.png" mode={RetinaImg.Mode.ContentIsMask} />
          <span>{this.props.message.files.length} attachments</span>
        </div>
        <div className="separator">-</div>
        <div className="download-all-action" onClick={this._onDownloadAll}>
          <RetinaImg name="ic-attachments-download-all.png" mode={RetinaImg.Mode.ContentIsMask} />
          <span>Download all</span>
        </div>
      </div>
    );
  }

  _renderAttachments() {
    const { files = [], body, id } = this.props.message;
    const { filePreviewPaths, downloads } = this.state;
    const attachedFiles = files.filter(
      f => !f.contentId || !(body || '').includes(`cid:${f.contentId}`)
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
        className={`message-header ${pending && 'pending'}`}
        onClick={this._onClickHeader}
      >
        <InjectedComponent
          matching={{ role: 'MessageHeader' }}
          exposedProps={{ message: message, thread: thread, messages: messages }}
        />
        <div className="pending-spinner" style={{ position: 'absolute', marginTop: -2, left: 55 }}>
          <RetinaImg width={18} name="sending-spinner.gif" mode={RetinaImg.Mode.ContentPreserve} />
        </div>
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
          <MessageControls thread={thread} message={message} threadPopedOut={this.props.threadPopedOut} />
        </div>
        <div className='row'>
          <InjectedComponent
            key="thread-avatar"
            exposedProps={{
              from: message.from && message.from[0]
            }}
            matching={{ role: 'EmailAvatar' }}
          />
          <div>
            <MessageParticipants
              from={message.from}
              onClick={this._onClickParticipants}
              isDetailed={this.state.detailedHeaders}
            />
            <MessageTimestamp
              className="message-time"
              isDetailed={this.state.detailedHeaders}
              date={message.date}
            />
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
        {this._renderHeaderDetailToggle()}
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
          <RetinaImg
            name={'message-disclosure-triangle-active.png'}
            mode={RetinaImg.Mode.ContentIsMask}
          />
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
        <RetinaImg name={'message-disclosure-triangle.png'} mode={RetinaImg.Mode.ContentIsMask} />
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
      <div className="collapsed-attachment" />
    ) : null;

    return (
      <div className={className} onClick={this._onToggleCollapsed}>
        <div className="message-item-white-wrap">
          <div className="message-item-area">
            <InjectedComponent
              key="thread-avatar"
              exposedProps={{
                from: from && from[0]
              }}
              matching={{ role: 'EmailAvatar' }}
            />
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <div className="row">
                <div className="collapsed-from">
                  {from && from[0] && from[0].displayName({ compact: true })}
                </div>
                {draft && (
                  <div className="collapsed-pencil" />
                )}
                {attachmentIcon}
                <div className="collapsed-timestamp">
                  <MessageTimestamp date={date} />
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
      <div className={this.props.className}>
        <div className="message-item-white-wrap">
          <div className="message-item-area">
            {this._renderHeader()}
            <MessageItemBody message={this.props.message} downloads={this.state.downloads} />
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
