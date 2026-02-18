import React from 'react';
import { PropTypes, Utils } from 'mailspring-exports';
import { AccountColorBar } from 'mailspring-component-kit';
import { ThreadWithMessagesMetadata } from './types';
import ParticipantAvatar from './participant-avatar';

class ThreadListParticipants extends React.Component<{ thread: ThreadWithMessagesMetadata }> {
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
        <div className="participants-content">
          {this.renderAvatars(items)}
          {this.renderSpans(items)}
        </div>
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

    if (!this.props.thread.__messages) {
      throw new Error('ThreadListParticipants requires __messages.');
    }

    const messages = this.props.thread.__messages != null ? this.props.thread.__messages : [];
    if (messages.length > 1) {
      accumulate(` (${messages.length})`);
    }

    flush();

    return spans;
  }

  renderAvatars(items) {
    const avatars = [];
    const displayedContacts = new Set();

    for (let idx = 0; idx < items.length; idx++) {
      const { spacer, contact } = items[idx];

      if (spacer) {
        // Add a spacer indicator if needed
        if (avatars.length > 0) {
          avatars.push(
            <div key="spacer" className="avatar-spacer">
              <span>...</span>
            </div>
          );
        }
        continue;
      }

      // Only show avatar for unique contacts to avoid duplicates
      const contactKey = `${contact.email}-${contact.name}`;
      if (!displayedContacts.has(contactKey) && avatars.length < 3) {
        displayedContacts.add(contactKey);
        avatars.push(
          <ParticipantAvatar
            key={contactKey}
            contact={contact}
            size={24}
            className="participant-avatar-small"
          />
        );
      }
    }

    return avatars;
  }

  getTokensFromMessages = () => {
    const messages = this.props.thread.__messages;
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
    let contacts = this.props.thread.participants != null ? this.props.thread.participants : [];
    contacts = contacts.filter(contact => !contact.isMe());
    return contacts.map(contact => ({ contact, unread: false }));
  };

  getTokens = () => {
    let list;
    if (this.props.thread.__messages instanceof Array) {
      list = this.getTokensFromMessages();
    } else {
      list = this.getTokensFromParticipants();
    }

    // If no participants, we should at least add current user as sole participant
    if (
      list.length === 0 &&
      (this.props.thread.participants != null ? this.props.thread.participants.length : undefined) >
      0
    ) {
      list.push({ contact: this.props.thread.participants[0], unread: false });
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
