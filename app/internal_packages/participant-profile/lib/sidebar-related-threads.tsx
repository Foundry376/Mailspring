import React from 'react';
import { localized, PropTypes, Actions, DateUtils, Contact, Thread } from 'mailspring-exports';

export default class RelatedThreads extends React.Component<{
  contact: Contact;
  contactThreads: Thread[];
}> {
  static displayName = 'RelatedThreads';

  static propTypes = {
    contact: PropTypes.object,
    contactThreads: PropTypes.array,
  };

  static containerStyles = {
    order: 99,
  };

  DEFAULT_NUM = 3;

  state = { expanded: false };

  _onClick(thread) {
    Actions.setFocus({ collection: 'thread', item: thread });
  }

  _toggle = () => {
    this.setState({ expanded: !this.state.expanded });
  };

  _renderToggle() {
    if (!this._hasToggle()) {
      return false;
    }
    const msg = this.state.expanded ? localized('Collapse') : localized('Show more');
    return (
      <div className="toggle" onClick={this._toggle}>
        {msg}
      </div>
    );
  }

  _hasToggle() {
    return this.props.contactThreads.length > this.DEFAULT_NUM;
  }

  render() {
    let limit;
    if (this.state.expanded) {
      limit = this.props.contactThreads.length;
    } else {
      limit = Math.min(this.props.contactThreads.length, this.DEFAULT_NUM);
    }

    const height = (limit + (this._hasToggle() ? 1 : 0)) * 31;
    const shownThreads = this.props.contactThreads.slice(0, limit);
    const threads = shownThreads.map(thread => {
      const { snippet, subject, lastMessageReceivedTimestamp } = thread;
      const snippetStyles = subject && subject.length ? { marginLeft: '1em' } : {};
      const onClick = () => {
        this._onClick(thread);
      };

      return (
        <div key={thread.id} className="related-thread" onClick={onClick}>
          <span className="content" title={subject}>
            {subject}
            <span className="snippet" style={snippetStyles}>
              {snippet}
            </span>
          </span>
          <span
            className="timestamp"
            title={DateUtils.fullTimeString(lastMessageReceivedTimestamp)}
          >
            {DateUtils.shortTimeString(lastMessageReceivedTimestamp)}
          </span>
        </div>
      );
    });

    return (
      <div className="related-threads" style={{ height }}>
        {threads}
        {this._renderToggle()}
      </div>
    );
  }
}
