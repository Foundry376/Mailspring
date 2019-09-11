import React from 'react';
import PropTypes from 'prop-types';
import { Utils, Actions, AttachmentStore, MessageStore, EmailAvatar, Message } from 'mailspring-exports';
import { RetinaImg, InjectedComponentSet, InjectedComponent } from 'mailspring-component-kit';

import MessageParticipants from './message-participants';
import MessageItemBody from './message-item-body';
import MessageTimestamp from './message-timestamp';
import MessageControls from './message-controls';
import TaskFactory from '../../../src/flux/tasks/task-factory';

export default class MessageItem extends React.Component {
  static displayName = 'MessageItem';

  static propTypes = {
    message: PropTypes.object.isRequired,
    className: PropTypes.string,
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
    this.mounted = false;
  }

  componentDidMount() {
    this._storeUnlisten = [    ];
    this.mounted = true;
  }

  shouldComponentUpdate(nextProps, nextState) {
    return !Utils.isEqualReact(nextProps, this.props) || !Utils.isEqualReact(nextState, this.state);
  }

  componentWillUnmount() {
    this.mounted = false;
    // if (this._storeUnlisten) {
    //   for (let un of this._storeUnlisten) {
    //     un();
    //   }
    // }
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

  _renderAttachments() {
    const { files = [], body, id } = this.props.message;
    const { filePreviewPaths, downloads } = this.state;
    const attachedFiles = files.filter(f => {
      return (
        (!f.contentId ||
          !(body || '').includes(`cid:${f.contentId}`)) &&
        !(f.contentType || '').toLocaleLowerCase().includes('text/calendar')
      );
    });

    return (
      <div>
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
        matching={{ role: 'OutboxMessageFooterStatus' }}
        exposedProps={{
          message: this.props.message,
          detailedHeaders: this.state.detailedHeaders,
        }}
      />
    );
  }

  _renderHeader() {
    const { message } = this.props;

    return (
      <header
        ref={el => (this._headerEl = el)}
        className={`message-header `}
      >
        <InjectedComponent
          matching={{ role: 'OutboxMessageHeader' }}
          exposedProps={{ message: message  }}
        />
        <div className="message-header-right">
          <InjectedComponentSet
            className="message-header-status"
            matching={{ role: 'OutboxMessageHeaderStatus' }}
            exposedProps={{
              message: message,
              detailedHeaders: this.state.detailedHeaders,
            }}
          />
          <MessageControls message={message} />
        </div>
        <div className='row'>
          <EmailAvatar
            key="thread-avatar"
            from={message.from && message.from[0]}
            messagePending={Message.compareMessageState(this.props.message.state, Message.messageState.failing)}
          />
          <div>
            <MessageParticipants
              from={message.from}
              onClick={this._onClickParticipants}
              isDetailed={this.state.detailedHeaders}
            />
            <MessageParticipants
              detailFrom={message.from}
              to={message.to}
              cc={message.cc}
              bcc={message.bcc}
              replyTo={message.replyTo.filter(c => !message.from.find(fc => fc.email === c.email))}
              onClick={this._onClickParticipants}
              isDetailed={this.state.detailedHeaders}
            />
            {this._renderHeaderDetailToggle()}
          </div>
        </div>
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

  _renderFull() {
    return (
      <div className={this.props.className} >
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
    return this._renderFull();
  }
}
