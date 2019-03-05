import React from 'react';
import { localized, PropTypes, Actions, TaskFactory, ExtensionRegistry } from 'mailspring-exports';
import { ThreadWithMessagesMetadata } from './types';

class ThreadListIcon extends React.Component<{ thread: ThreadWithMessagesMetadata }> {
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
      return 'thread-icon-star-on-hover';
    }

    const extensionIconClassNames = this._extensionsIconClassNames();
    if (extensionIconClassNames.length > 0) {
      return extensionIconClassNames;
    }

    if (this.props.thread.starred) {
      return 'thread-icon-star';
    }

    if (this.props.thread.unread) {
      return 'thread-icon-unread thread-icon-star-on-hover';
    }

    const msgs = this._nonDraftMessages();
    const last = msgs[msgs.length - 1];

    if (msgs.length > 1 && (last.from[0] != null ? last.from[0].isMe() : undefined)) {
      if (last.isForwarded()) {
        return 'thread-icon-forwarded thread-icon-star-on-hover';
      } else {
        return 'thread-icon-replied thread-icon-star-on-hover';
      }
    }

    return 'thread-icon-none thread-icon-star-on-hover';
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
        title={localized('Star')}
        onClick={this._onToggleStar}
      />
    );
  }

  _onToggleStar = event => {
    Actions.queueTask(
      TaskFactory.taskForInvertingStarred({
        threads: [this.props.thread],
        source: 'Thread List Icon',
      })
    );
    // Don't trigger the thread row click
    return event.stopPropagation();
  };
}

export default ThreadListIcon;
