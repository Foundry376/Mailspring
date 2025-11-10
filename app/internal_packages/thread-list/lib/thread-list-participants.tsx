import React from 'react';
import { PropTypes, Utils, Thread, Message } from 'mailspring-exports';
import { AccountColorBar } from 'mailspring-component-kit';
import { ItemAdapter, isMessage } from './thread-or-message';

class ThreadListParticipants extends React.Component<{ thread: Thread | Message }> {
  static displayName = 'ThreadListParticipants';

  static propTypes = { thread: PropTypes.object.isRequired };

  shouldComponentUpdate(nextProps) {
    if (nextProps.thread === this.props.thread) {
      return false;
    }
    return true;
  }

  render() {
    const items = this.getTokens();
    return (
      <div className="participants" dir="auto">
        <AccountColorBar accountId={this.props.thread.accountId} />
        {this.renderSpans(items)}
      </div>
    );
  }

  renderSpans(items) {
    const spans = [];
    let accumulated = null;
    let accumulatedUnread = false;

    const flush = function () {
      if (accumulated) {
        spans.push(
          <span key={spans.length} className={`unread-${accumulatedUnread}`}>
            {accumulated}
          </span>
        );
      }
      accumulated = null;
      accumulatedUnread = false;
    };

    const accumulate = function (text, unread?: boolean) {
      if (accumulated && unread && accumulatedUnread !== unread) {
        flush();
      }
      if (accumulated) {
        accumulated += text;
      } else {
        accumulated = text;
        accumulatedUnread = unread;
      }
    };

    for (let idx = 0; idx < items.length; idx++) {
      const { spacer, contact, unread } = items[idx];
      if (spacer) {
        accumulate('...');
      } else {
        let short = contact.email;
        if (contact.name && contact.name.length > 0) {
          if (items.length > 1) {
            short = contact.displayName({
              includeAccountLabel: false,
              compact: !AppEnv.config.get('core.reading.detailedNames'),
            });
          } else {
            short = contact.displayName({ includeAccountLabel: false });
          }
        }
        if (idx < items.length - 1 && !items[idx + 1].spacer) {
          short += ', ';
        }
        accumulate(short, unread);
      }
    }

    // For messages, show count only if it's a thread with messages
    const messages = ItemAdapter.getMessages(this.props.thread);
    if (messages.length > 1) {
      accumulate(` (${messages.length})`);
    }

    flush();

    return spans;
  }

  getTokensFromMessages = () => {
    const messages = ItemAdapter.getMessages(this.props.thread);
    const tokens = [];

    let field = 'from';
    if (messages.every(message => message.isFromMe())) {
      field = 'to';
    }

    for (let idx = 0; idx < messages.length; idx++) {
      const message = messages[idx];
      if (message.draft) {
        continue;
      }

      for (const contact of message[field]) {
        if (tokens.length === 0) {
          tokens.push({ contact, unread: message.unread });
        } else {
          const lastToken = tokens[tokens.length - 1];
          const lastContact = lastToken.contact;

          const sameEmail = Utils.emailIsEquivalent(lastContact.email, contact.email);
          const sameName = lastContact.name === contact.name;
          if (sameEmail && sameName) {
            if (!lastToken.unread) {
              lastToken.unread = message.unread;
            }
          } else {
            tokens.push({ contact, unread: message.unread });
          }
        }
      }
    }

    return tokens;
  };

  getTokensFromParticipants = () => {
    const participants = ItemAdapter.getParticipants(this.props.thread);
    let contacts = Array.isArray(participants) ? participants : [];
    contacts = contacts.filter(contact => !contact.isMe());
    return contacts.map(contact => ({ contact, unread: false }));
  };

  getTokens = () => {
    let list;
    const messages = ItemAdapter.getMessages(this.props.thread);

    // If we have messages (either from thread or single message), use them
    if (messages.length > 0) {
      list = this.getTokensFromMessages();
    } else {
      list = this.getTokensFromParticipants();
    }

    // If no participants, we should at least add current user as sole participant
    const participants = ItemAdapter.getParticipants(this.props.thread);
    const participantsArray = Array.isArray(participants) ? participants : [];
    if (list.length === 0 && participantsArray.length > 0) {
      list.push({ contact: participantsArray[0], unread: false });
    }

    // We only ever want to show three. Ben...Kevin... Marty
    // But we want the *right* three.
    if (list.length > 3) {
      const listTrimmed = [
        // Always include the first item
        list[0],
        { spacer: true },

        // Always include last two items
        list[list.length - 2],
        list[list.length - 1],
      ];
      list = listTrimmed;
    }

    return list;
  };
}

export default ThreadListParticipants;
