/* eslint global-require: 0 */

import React from 'react';
import {
  localized,
  PropTypes,
  Actions,
  TaskQueue,
  GetMessageRFC2822Task,
  EmlUtils,
  Thread,
  Message,
} from 'mailspring-exports';
import { RetinaImg, ButtonDropdown, Menu } from 'mailspring-component-kit';

interface MessageControlsProps {
  thread: Thread;
  message: Message;
}

export default class MessageControls extends React.Component<MessageControlsProps> {
  static displayName = 'MessageControls';
  static propTypes = {
    thread: PropTypes.object.isRequired,
    message: PropTypes.object.isRequired,
  };

  _items() {
    const reply = {
      name: localized('Reply'),
      image: 'ic-dropdown-reply.png',
      select: this._onReply,
    };
    const replyAll = {
      name: localized('Reply All'),
      image: 'ic-dropdown-replyall.png',
      select: this._onReplyAll,
    };
    const forward = {
      name: localized('Forward'),
      image: 'ic-dropdown-forward.png',
      select: this._onForward,
    };

    const showOriginal = {
      name: localized('Show Original'),
      image: 'ic-dropdown-whitespace.png',
      select: this._onShowOriginal,
    };

    if (!this.props.message.canReplyAll()) {
      return [reply, forward, showOriginal];
    }
    const defaultReplyType = AppEnv.config.get('core.sending.defaultReplyType');
    return defaultReplyType === 'reply-all'
      ? [replyAll, reply, forward, showOriginal]
      : [reply, replyAll, forward, showOriginal];
  }

  _dropdownMenu(items) {
    const itemContent = (item) => (
      <span>
        <RetinaImg name={item.image} mode={RetinaImg.Mode.ContentIsMask} />
        &nbsp;&nbsp;{item.name}&nbsp;&nbsp;
      </span>
    );

    return (
      <Menu
        items={items}
        itemKey={(item) => item.name}
        itemContent={itemContent}
        onSelect={(item) => item.select()}
      />
    );
  }

  _onReply = () => {
    const { thread, message } = this.props;
    Actions.composeReply({
      thread,
      message,
      type: 'reply',
      behavior: 'prefer-existing-if-pristine',
    });
  };

  _onReplyAll = () => {
    const { thread, message } = this.props;
    Actions.composeReply({
      thread,
      message,
      type: 'reply-all',
      behavior: 'prefer-existing-if-pristine',
    });
  };

  _onForward = () => {
    const { thread, message } = this.props;
    Actions.composeForward({ thread, message });
  };

  _onDownloadEml = () => {
    const { message } = this.props;
    const defaultFilename = EmlUtils.defaultEmlFilename(message.subject);

    AppEnv.showSaveDialog(
      { defaultPath: defaultFilename, title: localized('Save Email') },
      async (savePath) => {
        if (!savePath) return;
        const task = new GetMessageRFC2822Task({
          messageId: message.id,
          accountId: message.accountId,
          filepath: savePath,
        });
        Actions.queueTask(task);
        await TaskQueue.waitForPerformRemote(task);
      }
    );
  };

  _onShowActionsMenu = () => {
    const SystemMenu = require('@electron/remote').Menu;
    const SystemMenuItem = require('@electron/remote').MenuItem;

    // Todo: refactor this so that message actions are provided
    // dynamically. Waiting to see if this will be used often.
    const menu = new SystemMenu();
    menu.append(new SystemMenuItem({ label: localized('Log Data'), click: this._onLogData }));
    menu.append(
      new SystemMenuItem({ label: localized('Show Original'), click: this._onShowOriginal })
    );
    menu.append(
      new SystemMenuItem({
        label: localized('Copy Debug Info to Clipboard'),
        click: this._onCopyToClipboard,
      })
    );
    menu.append(new SystemMenuItem({ type: 'separator' }));
    menu.append(
      new SystemMenuItem({ label: localized('Download as .eml'), click: this._onDownloadEml })
    );
    menu.popup({});
  };

  _onShowOriginal = async () => {
    const { message } = this.props;
    const filepath = require('path').join(
      require('@electron/remote').app.getPath('temp'),
      message.id
    );
    const task = new GetMessageRFC2822Task({
      messageId: message.id,
      accountId: message.accountId,
      filepath,
    });
    Actions.queueTask(task);
    await TaskQueue.waitForPerformRemote(task);
    const { BrowserWindow } = require('@electron/remote');
    const win = new BrowserWindow({
      width: 800,
      height: 600,
      title: `${message.subject} - RFC822`,
      webPreferences: {
        javascript: false,
        nodeIntegration: false,
      },
    });
    win.loadURL(`file://${filepath}`);
  };

  _onLogData = () => {
    console.log(this.props.message);
    (window as any).__message = this.props.message;
    (window as any).__thread = this.props.thread;
    console.log('Also now available in window.__message and window.__thread');
  };

  _onCopyToClipboard = () => {
    const { message, thread } = this.props;
    const data = `
      AccountID: ${message.accountId}
      Message ID: ${message.id}
      Message Metadata: ${JSON.stringify(message.pluginMetadata, null, '  ')}
      Thread ID: ${thread.id}
      Thread Metadata: ${JSON.stringify(thread.pluginMetadata, null, '  ')}
    `;
    navigator.clipboard
      .writeText(data)
      .catch((err) => console.error('Failed to copy to clipboard:', err));
  };

  render() {
    const items = this._items();
    return (
      <div className="message-actions-wrap" onClick={(e) => e.stopPropagation()}>
        <ButtonDropdown
          primaryItem={<RetinaImg name={items[0].image} mode={RetinaImg.Mode.ContentIsMask} />}
          primaryTitle={items[0].name}
          primaryClick={items[0].select}
          closeOnMenuClick
          menu={this._dropdownMenu(items.slice(1))}
        />
        <div
          className="message-actions-ellipsis"
          tabIndex={-1}
          onClick={this._onShowActionsMenu}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              this._onShowActionsMenu();
            }
          }}
        >
          <RetinaImg
            name={'message-actions-ellipsis.png'}
            mode={RetinaImg.Mode.ContentIsMask}
            aria-hidden="true"
          />
        </div>
      </div>
    );
  }
}
