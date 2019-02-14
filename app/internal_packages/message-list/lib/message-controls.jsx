/* eslint global-require: 0 */
import { remote } from 'electron';
import { React, PropTypes, Actions, TaskQueue, GetMessageRFC2822Task } from 'mailspring-exports';
import { RetinaImg, ButtonDropdown, Menu } from 'mailspring-component-kit';

export default class MessageControls extends React.Component {
  static displayName = 'MessageControls';
  static propTypes = {
    thread: PropTypes.object.isRequired,
    message: PropTypes.object.isRequired,
    threadPopedOut: PropTypes.bool,
  };

  _items() {
    const reply = {
      name: 'Reply',
      image: 'reply.svg',
      select: this.props.threadPopedOut ? this._onPopoutThread : this._onReply,
    };
    const replyAll = {
      name: 'Reply All',
      image: 'reply-all.svg',
      select: this.props.threadPopedOut ? this._onPopoutThread : this._onReplyAll,
    };
    const forward = {
      name: 'Forward',
      image: 'forward.svg',
      select: this.props.threadPopedOut ? this._onPopoutThread : this._onForward,
    };

    if (!this.props.message.canReplyAll()) {
      return [reply, forward];
    }
    const defaultReplyType = AppEnv.config.get('core.sending.defaultReplyType');
    return defaultReplyType === 'reply-all'
      ? [replyAll, reply, forward]
      : [reply, replyAll, forward];
  }
  _onPopoutThread = () => {
    if (!this.props.thread) {
      return;
    }
    Actions.popoutThread(this.props.thread);
    // This returns the single-pane view to the inbox, and does nothing for
    // double-pane view because we're at the root sheet.
    Actions.popSheet();
  };

  _dropdownMenu(items) {
    const itemContent = item => (
      <span>
        <RetinaImg name={item.image}
          style={{ width: 24, height: 24 }}
          isIcon
          mode={RetinaImg.Mode.ContentIsMask} />
        &nbsp;&nbsp;{item.name}
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
    const SystemMenu = remote.Menu;
    const SystemMenuItem = remote.MenuItem;

    // Todo: refactor this so that message actions are provided
    // dynamically. Waiting to see if this will be used often.
    const menu = new SystemMenu();
    menu.append(new SystemMenuItem({ label: 'Log Data', click: this._onLogData }));
    menu.append(new SystemMenuItem({ label: 'Show Original', click: this._onShowOriginal }));
    menu.append(
      new SystemMenuItem({ label: 'Copy Debug Info to Clipboard', click: this._onCopyToClipboard })
    );
    menu.popup({});
  };

  _onShowOriginal = async () => {
    const { message } = this.props;
    const filepath = require('path').join(remote.app.getPath('temp'), message.id);
    const task = new GetMessageRFC2822Task({
      messageId: message.id,
      accountId: message.accountId,
      filepath,
    });
    Actions.queueTask(task);
    await TaskQueue.waitForPerformRemote(task);
    const win = new remote.BrowserWindow({
      width: 800,
      height: 600,
      title: `${message.subject} - RFC822`,
    });
    win.loadURL(`file://${filepath}`);
  };

  _onLogData = () => {
    console.log(this.props.message);
    window.__message = this.props.message;
    window.__thread = this.props.thread;
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
          primaryItem={<RetinaImg
            name={items[0].image}
            style={{ width: 24, height: 24 }}
            isIcon
            mode={RetinaImg.Mode.ContentIsMask} />}
          primaryTitle={items[0].name}
          primaryClick={items[0].select}
          closeOnMenuClick
          menu={this._dropdownMenu(items.slice(1))}
        />
        <div className="message-actions-ellipsis" onClick={this._onShowActionsMenu}>
          <RetinaImg name={'message-actions-ellipsis.png'} mode={RetinaImg.Mode.ContentIsMask} />
        </div>
      </div>
    );
  }
}
