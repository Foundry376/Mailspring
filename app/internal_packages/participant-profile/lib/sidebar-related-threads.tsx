import React from 'react';
import {
  localized,
  PropTypes,
  Actions,
  DateUtils,
  Contact,
  Thread,
  DatabaseStore,
  SearchQueryParser,
} from 'mailspring-exports';

function emailFor(contact: Contact | undefined) {
  return (contact || { email: '' }).email;
}

export default class RelatedThreads extends React.Component<
  { contact: Contact },
  { threads: Thread[] }
> {
  static displayName = 'RelatedThreads';

  static containerStyles = {
    order: 99,
  };

  state = {
    threads: [],
  };

  _mounted: boolean = false;

  componentDidMount() {
    this._mounted = true;
    this.fetchThreads();
  }

  componentWillUnmount() {
    this._mounted = false;
  }

  componentDidUpdate(prevProps) {
    if (emailFor(prevProps.contact) !== emailFor(this.props.contact)) {
      this.setState({ threads: [] });
      this.fetchThreads();
    }
  }

  async fetchThreads() {
    const email = emailFor(this.props.contact);
    if (!email) return;

    // Wait to load the related threads to make sure the user settles on this
    // contact and isn't flying through their email. This query is expensive.
    await Promise.delay(1000);

    if (!this._mounted) return;
    if (email !== emailFor(this.props.contact)) return;

    const threads = await DatabaseStore.findAll<Thread>(Thread)
      .structuredSearch(SearchQueryParser.parse(`from:${email}`))
      .limit(25)
      .background();

    if (!this._mounted) return;
    if (email !== emailFor(this.props.contact)) return;

    this.setState({ threads });
  }

  render() {
    return <RelatedThreadsWithData threads={this.state.threads} />;
  }
}

const DEFAULT_NUM = 3;

class RelatedThreadsWithData extends React.Component<{
  threads: Thread[];
}> {
  static displayName = 'RelatedThreadsWithData';

  static propTypes = {
    threads: PropTypes.array,
  };

  state = { expanded: false };

  render() {
    const { threads } = this.props;

    const limit = this.state.expanded ? threads.length : Math.min(threads.length, DEFAULT_NUM);
    const showToggle = threads.length > DEFAULT_NUM;
    const height = (limit + (showToggle ? 1 : 0)) * 31;
    const shownThreads = threads.slice(0, limit);

    return (
      <div className="related-threads" style={{ height }}>
        {shownThreads.map(thread => (
          <div
            key={thread.id}
            className="related-thread"
            onClick={() => Actions.setFocus({ collection: 'thread', item: thread })}
          >
            <span className="content" title={thread.subject}>
              {thread.subject}
              <span
                className="snippet"
                style={thread.subject && thread.subject.length ? { marginLeft: '1em' } : {}}
              >
                {thread.snippet}
              </span>
            </span>
            <span
              className="timestamp"
              title={DateUtils.fullTimeString(thread.lastMessageReceivedTimestamp)}
            >
              {DateUtils.shortTimeString(thread.lastMessageReceivedTimestamp)}
            </span>
          </div>
        ))}
        {showToggle && (
          <div className="toggle" onClick={() => this.setState({ expanded: !this.state.expanded })}>
            {this.state.expanded ? localized('Collapse') : localized('Show more')}
          </div>
        )}
      </div>
    );
  }
}
