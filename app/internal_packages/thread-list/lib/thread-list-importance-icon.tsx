import React from 'react';
import { localized } from 'mailspring-exports';
import { ThreadWithMessagesMetadata } from './types';

class ThreadListImportanceIcon extends React.Component<{
  thread: ThreadWithMessagesMetadata;
}> {
  static displayName = 'ThreadListImportanceIcon';

  static containerRequired = false;

  shouldComponentUpdate(nextProps: { thread: ThreadWithMessagesMetadata }) {
    return nextProps.thread !== this.props.thread;
  }

  _hasHighImportance() {
    const messages = this.props.thread && this.props.thread.__messages;
    if (!messages || !(messages instanceof Array)) {
      return false;
    }
    return messages.some((m) => !m.draft && m.importance === 'high');
  }

  render() {
    if (!this._hasHighImportance()) {
      return null;
    }
    const label = localized('High importance');
    return (
      <div
        className="thread-icon thread-icon-importance-high"
        title={label}
        aria-label={label}
      />
    );
  }
}

export default ThreadListImportanceIcon;
