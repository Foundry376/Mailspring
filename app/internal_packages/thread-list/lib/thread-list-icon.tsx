import React from 'react';
import {
  localized,
  PropTypes,
  Actions,
  TaskFactory,
  ExtensionRegistry,
  Thread,
  Message
} from 'mailspring-exports';
import { ItemAdapter, isMessage } from './thread-or-message';

// Import the task class directly for message support
const { ChangeStarredTask } = require('mailspring-exports');

class ThreadListIcon extends React.Component<{ thread: Thread | Message }> {
  static displayName = 'ThreadListIcon';
  static propTypes = { thread: PropTypes.object };

  _extensionsIconClassNames = () => {
    return ExtensionRegistry.ThreadList.extensions()
      .filter(ext => ext.cssClassNamesForThreadListIcon != null)
      .reduce((prev, ext) => prev + ' ' + ext.cssClassNamesForThreadListIcon(this.props.thread), '')
      .trim();
  };

  _iconClassNames = () => {
    const item = this.props.thread;
    if (!item) {
      return 'thread-icon-star-on-hover';
    }

    const extensionIconClassNames = this._extensionsIconClassNames();
    if (extensionIconClassNames.length > 0) {
      return extensionIconClassNames;
    }

    if (ItemAdapter.isStarred(item)) {
      return 'thread-icon-star';
    }

    if (ItemAdapter.isUnread(item)) {
      return 'thread-icon-unread thread-icon-star-on-hover';
    }

    // For messages, show reply/forward icons based on the message itself
    if (isMessage(item)) {
      if (ItemAdapter.isFromMe(item)) {
        if ((item as Message).isForwarded()) {
          return 'thread-icon-forwarded thread-icon-star-on-hover';
        } else {
          return 'thread-icon-replied thread-icon-star-on-hover';
        }
      }
      return 'thread-icon-none thread-icon-star-on-hover';
    }

    // For threads, check messages
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
    const item = this.props.thread;
    if (isMessage(item)) {
      return item.draft ? [] : [item];
    }

    let msgs = (item as any).__messages;
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
    const item = this.props.thread;

    // Handle starring for both threads and messages
    if (isMessage(item)) {
      const starred = !ItemAdapter.isStarred(item);
      Actions.queueTask(
        new ChangeStarredTask({
          messages: [item],
          starred,
          source: 'Thread List Icon',
        })
      );
    } else {
      Actions.queueTask(
        TaskFactory.taskForInvertingStarred({
          threads: [item],
          source: 'Thread List Icon',
        })
      );
    }

    // Don't trigger the thread row click
    return event.stopPropagation();
  };
}

export default ThreadListIcon;
