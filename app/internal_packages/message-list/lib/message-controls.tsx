/* eslint global-require: 0 */

import React from 'react';
import {
  localized,
  PropTypes,
  Actions,
  TaskQueue,
  GetMessageRFC2822Task,
  CategoryStore,
  ChangeFolderTask,
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
    const itemContent = item => (
      <span>
        <RetinaImg name={item.image} mode={RetinaImg.Mode.ContentIsMask} />
        &nbsp;&nbsp;{item.name}&nbsp;&nbsp;
      </span>
    );

    return (
      <Menu
        items={items}
        itemKey={item => item.name}
        itemContent={itemContent}
        onSelect={item => item.select()}
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
    menu.popup({});
  };

  _onShowOriginal = async () => {
    const { message } = this.props;
    const filepath = require('path').join(require('@electron/remote').app.getPath('temp'), message.id);
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

  _onMoveMessageToTrash = async () => {
    const { message } = this.props;
    const trash = CategoryStore.getTrashCategory(message.accountId);

    if (!trash) {
      return;
    }

    if (message.folder?.id === trash.id) {
      return;
    }

    const task = new ChangeFolderTask({
      folder: trash,
      messages: [message],
      source: 'Message Header: Conversation View',
    });

    Actions.queueTask(task);
    await TaskQueue.waitForPerformLocal(task);
    AppEnv.mailsyncBridge.sendSyncMailNow();
  };

  _renderTrashAction() {
    const { message } = this.props;
    const trash = CategoryStore.getTrashCategory(message.accountId);

    if (!trash || message.folder?.id === trash.id) {
      return null;
    }

    return (
      <div
        title={localized('Move to Trash')}
        onClick={(e) => {
          e.stopPropagation();
          this._onMoveMessageToTrash();
        }}
        style={{ float: 'left', marginLeft: 6, cursor: 'pointer', lineHeight: 1, opacity: 0.85 }}
      >
        <RetinaImg
          name="toolbar-trash.png"
          mode={RetinaImg.Mode.ContentIsMask}
          style={{ width: 14, height: 14, backgroundColor: '#666' }}
        />
      </div>
    );
  }

  _onLogData = () => {
    console.log(this.props.message);
    (window as any).__message = this.props.message;
    (window as any).__thread = this.props.thread;
    console.log('Also now available in window.__message and window.__thread');
  };

  _onCopyToClipboard = () => {
    const { message, thread } = this.props;
    const clipboard = require('electron').clipboard;
    const data = `
      AccountID: ${message.accountId}
      Message ID: ${message.id}
      Message Metadata: ${JSON.stringify(message.pluginMetadata, null, '  ')}
      Thread ID: ${thread.id}
      Thread Metadata: ${JSON.stringify(thread.pluginMetadata, null, '  ')}
    `;
    clipboard.writeText(data);
  };

  render() {
    const items = this._items();
    return (
      <div className="message-actions-wrap" onClick={e => e.stopPropagation()}>
        <ButtonDropdown
          primaryItem={<RetinaImg name={items[0].image} mode={RetinaImg.Mode.ContentIsMask} />}
          primaryTitle={items[0].name}
          primaryClick={items[0].select}
          closeOnMenuClick
          menu={this._dropdownMenu(items.slice(1))}
        />
        {this._renderTrashAction()}
        <div className="message-actions-ellipsis" onClick={this._onShowActionsMenu}>
          <RetinaImg name={'message-actions-ellipsis.png'} mode={RetinaImg.Mode.ContentIsMask} />
        </div>
      </div>
    );
  }
}
