/* eslint global-require: 0 */
import { remote } from 'electron';
import {
  React,
  PropTypes,
  Actions,
  TaskQueue,
  GetMessageRFC2822Task,
  TaskFactory,
  FocusedPerspectiveStore,
} from 'mailspring-exports';
import { RetinaImg, ButtonDropdown, Menu } from 'mailspring-component-kit';
import MessageTimestamp from './message-timestamp';

const buttonTimeout = 700;
export default class MessageControls extends React.Component {
  static displayName = 'MessageControls';
  static propTypes = {
    thread: PropTypes.object,
    message: PropTypes.object.isRequired,
    messages: PropTypes.array,
    threadPopedOut: PropTypes.bool,
    hideControls: PropTypes.bool,
    trackers: PropTypes.array,
  };

  constructor(props) {
    super(props);
    this.state = {
      isReplying: false,
      isReplyAlling: false,
      isForwarding: false,
    };
    this._mounted = false;
    this._replyTimer = null;
    this._replyAllTimer = null;
    this._forwardTimer = null;
    this._unlisten = Actions.draftReplyForwardCreated.listen(this._onDraftCreated, this);
  }

  componentDidMount() {
    this._mounted = true;
  }

  componentWillUnmount() {
    this._mounted = false;
    this._unlisten();
    clearTimeout(this._forwardTimer);
    clearTimeout(this._replyAllTimer);
    clearTimeout(this._replyTimer);
  }

  _timeoutButton = type => {
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

  _onDraftCreated = ({ messageId, type = '' }) => {
    if (messageId && messageId === this.props.message.id && this._mounted) {
      if (type === 'reply') {
        if (this._replyTimer) {
          return;
        }
        this._replyTimer = setTimeout(() => {
          if (this._mounted) {
            this.setState({ isReplying: false });
          }
          this._replyTimer = null;
        }, buttonTimeout);
      } else if (type === 'reply-all') {
        if (this._replyAllTimer) {
          return;
        }
        this._replyAllTimer = setTimeout(() => {
          if (this._mounted) {
            this.setState({ isReplyAlling: false });
          }
          this._replyAllTimer = null;
        }, buttonTimeout);
      } else {
        if (this._forwardTimer) {
          return;
        }
        this._forwardTimer = setTimeout(() => {
          if (this._mounted) {
            this.setState({ isForwarding: false });
          }
          this._forwardTimer = null;
        }, buttonTimeout);
      }
    }
  };

  _items() {
    const reply = {
      name: 'Reply',
      image: 'reply.svg',
      disabled: this.state.isReplying,
      select: this.props.threadPopedOut ? this._onPopoutThread : this._onReply,
    };
    const replyAll = {
      name: 'Reply All',
      image: 'reply-all.svg',
      disabled: this.state.isReplyAlling,
      select: this.props.threadPopedOut ? this._onPopoutThread : this._onReplyAll,
    };
    const forward = {
      name: 'Forward',
      image: 'forward.svg',
      disabled: this.state.isForwarding,
      select: this.props.threadPopedOut ? this._onPopoutThread : this._onForward,
    };
    const trash = {
      name: this.props.message.isInTrash() ? 'Expunge' : 'Trash',
      image: 'trash.svg',
      select: this.props.threadPopedOut ? this._onPopoutThread : this._onTrash,
    };

    if (!this.props.message.canReplyAll()) {
      return this.props.message.draft ? [reply, forward] : [reply, forward, trash];
    }
    const defaultReplyType = AppEnv.config.get('core.sending.defaultReplyType');
    const ret =
      defaultReplyType === 'reply-all' ? [replyAll, reply, forward] : [reply, replyAll, forward];
    if (!this.props.message.draft) {
      ret.push(trash);
    }
    return ret;
  }

  _onPopoutThread = () => {
    if (!this.props.thread) {
      return;
    }
    Actions.popoutThread(this.props.thread);
    // This returns the single-pane view to the inbox, and does nothing for
    // double-pane view because we're at the root sheet.
    Actions.popSheet({ reason: 'Message-Controls:_onPopoutThread' });
  };

  _dropdownMenu(items) {
    const itemContent = item => (
      <span>
        <RetinaImg
          name={item.image}
          style={{ width: 18, height: 18, marginTop: 3 }}
          isIcon={!item.disabled}
          mode={RetinaImg.Mode.ContentIsMask}
        />
        {item.name}
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
    if (!this.state.isReplying && !this._replyTimer) {
      this._timeoutButton('reply');
      this.setState({ isReplying: true });
      Actions.composeReply({
        thread,
        message,
        type: 'reply',
        behavior: 'prefer-existing-if-pristine',
      });
    }
  };

  _onReplyAll = () => {
    const { thread, message } = this.props;
    if (!this.state.isReplyAlling && !this._replyAllTimer) {
      this._timeoutButton('reply-all');
      this.setState({ isReplyAlling: true });
      Actions.composeReply({
        thread,
        message,
        type: 'reply-all',
        behavior: 'prefer-existing-if-pristine',
      });
    }
  };

  _onForward = () => {
    const { thread, message } = this.props;
    if (!this.state.isForwarding && !this._forwardTimer) {
      this._timeoutButton('forward');
      this.setState({ isForwarding: true });
      Actions.composeForward({ thread, message });
    }
  };

  _onRemove = event => {
    const tasks = TaskFactory.tasksForMovingToTrash({
      messages: [this.props.message],
      source: 'Toolbar Button: Message List: Remove',
    });
    if (Array.isArray(tasks) && tasks.length > 0) {
      tasks.forEach(task => {
        if (!task.accountId) {
          AppEnv.reportError(new Error(`Expunge Task no accountId`), {
            errorData: {
              task: task.toJSON(),
              message: JSON.stringify(this.props.message),
            },
          });
        }
      });
    }
    Actions.queueTasks(tasks);
    if (event) {
      event.stopPropagation();
    }
    if (this.props.selection) {
      this.props.selection.clear();
    }
    if (this.props.messages && this.props.messages && this.props.messages.length === 1) {
      Actions.popSheet({ reason: 'MessageControls:_onRemove' });
    }
    return;
  };
  _onExpunge = event => {
    const tasks = TaskFactory.tasksForExpungingThreadsOrMessages({
      messages: [this.props.message],
      source: 'Toolbar Button: Message List',
    });
    if (Array.isArray(tasks) && tasks.length > 0) {
      tasks.forEach(task => {
        if (!task.accountId) {
          AppEnv.reportError(new Error(`Expunge Task no accountId`), {
            errorData: {
              task: task.toJSON(),
              message: JSON.stringify(this.props.message),
            },
          });
        }
      });
    }
    Actions.queueTasks(tasks);
    if (event) {
      event.stopPropagation();
    }
    if (this.props.messages && this.props.messages && this.props.messages.length === 1) {
      Actions.popSheet({ reason: 'MessageControls:_onExpunge' });
    }
    return;
  };

  _onTrash = () => {
    const inTrash = this.props.message.isInTrash();
    if (inTrash) {
      this._onExpunge();
    } else {
      this._onRemove();
    }
  };

  _onShowActionsMenu = () => {
    const SystemMenu = remote.Menu;
    const SystemMenuItem = remote.MenuItem;

    // Todo: refactor this so that message actions are provided
    // dynamically. Waiting to see if this will be used often.
    const menu = new SystemMenu();
    menu.append(new SystemMenuItem({ label: 'Log Data', click: this._onLogData }));
    // menu.append(new SystemMenuItem({ label: 'Show Original', click: this._onShowOriginal }));
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

  _onClickTrackerIcon = () => {
    console.log('^^^^^^^^^^^^^^^^^^^^^^');
    console.log(this.props.trackers);
    console.log('^^^^^^^^^^^^^^^^^^^^^^');
  };

  render() {
    const items = this._items();
    const { trackers } = this.props;
    return (
      <div className="message-actions-wrap" onClick={e => e.stopPropagation()}>
        {trackers.length > 0 ? (
          <div className="remove-tracker" onClick={this._onClickTrackerIcon}>
            <RetinaImg
              name={'readReceipts.svg'}
              style={{ width: 14, height: 14 }}
              isIcon
              mode={RetinaImg.Mode.ContentIsMask}
            />
          </div>
        ) : null}
        <MessageTimestamp className="message-time" isDetailed date={this.props.message.date} />
        {!this.props.hideControls ? (
          <ButtonDropdown
            primaryItem={
              <RetinaImg
                name={items[0].image}
                style={{ width: 24, height: 24 }}
                isIcon
                mode={RetinaImg.Mode.ContentIsMask}
              />
            }
            primaryTitle={items[0].name}
            primaryClick={items[0].select}
            closeOnMenuClick
            menu={this._dropdownMenu(items.slice(1))}
          />
        ) : null}
        {!this.props.hideControls ? (
          <div className="message-actions-ellipsis" onClick={this._onShowActionsMenu}>
            <RetinaImg name={'message-actions-ellipsis.png'} mode={RetinaImg.Mode.ContentIsMask} />
          </div>
        ) : null}
      </div>
    );
  }
}
