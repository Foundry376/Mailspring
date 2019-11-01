const { React, PropTypes, Actions, TaskFactory, ExtensionRegistry } = require('mailspring-exports');

class ThreadListIcon extends React.Component {
  static displayName = 'ThreadListIcon';
  static propTypes = { thread: PropTypes.object };

  _extensionsIconClassNames = () => {
    return ExtensionRegistry.ThreadList.extensions()
      .filter(ext => ext.cssClassNamesForThreadListIcon != null)
      .reduce((prev, ext) => prev + ' ' + ext.cssClassNamesForThreadListIcon(this.props.thread), '')
      .trim();
  };

  _iconClassNames = () => {
    if (!this.props.thread) {
      return '';
    }

    const extensionIconClassNames = this._extensionsIconClassNames();
    if (extensionIconClassNames.length > 0) {
      return extensionIconClassNames;
    }

    // if (this.props.thread.starred) {
    //   return 'thread-icon-star';
    // }

    // if (this.props.thread.unread) {
    //   return 'thread-icon-unread';
    // }

    const msgs = this._nonDraftMessages();
    const last = msgs[msgs.length - 1];

    if (msgs.length > 1 && (last.from[0] != null ? last.from[0].isMe() : undefined)) {
      if (last.isForwarded()) {
        return 'thread-icon-forwarded';
      } else {
        return 'thread-icon-replied';
      }
    }

    return '';
  };

  _nonDraftMessages() {
    let msgs = this.props.thread.__messages;
    if (!msgs || !(msgs instanceof Array)) {
      return [];
    }
    msgs = msgs.filter(m => m.id && !m.draft);
    return msgs;
  }

  shouldComponentUpdate(nextProps) {
    if (nextProps.thread === this.props.thread) {
      return false;
    }
    return true;
  }

  render() {
    return (
      <div
        className={`thread-icon ${this._iconClassNames()}`}
        title="Flag"
      // onClick={this._onToggleStar}
      />
    );
  }

  _onToggleStar = event => {
    Actions.queueTasks(
      TaskFactory.taskForInvertingStarred({
        threads: [this.props.thread],
        source: 'Thread List Icon',
      })
    );
    // Don't trigger the thread row click
    return event.stopPropagation();
  };
}

module.exports = ThreadListIcon;
