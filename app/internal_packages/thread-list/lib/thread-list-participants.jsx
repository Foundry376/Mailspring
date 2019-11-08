const { React, PropTypes, Utils } = require('mailspring-exports');

class ThreadListParticipants extends React.Component {
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
    return <div className="participants">
      {this.renderIcons()}
      <div class="participants-inner">{this.renderSpans(items)}</div>
      {this.renderMessageCount()}
    </div>;
  }

  renderMessageCount = () => {
    const messages =
      this.props.thread.__messages != null
        ? this.props.thread.__messages.filter(message => {
          return message.state !== 1;
        }) : [];
    if (messages.length > 1) {
      return <div className='messages-count'>({messages.length})</div>;
    }
    return null;
  }

  renderIcons = () => {
    if (this.props.thread.starred) {
      return <div className='thread-icon thread-icon-star' />;
    }
    else if (this.props.thread.unread) {
      return <div className='thread-icon thread-icon-unread' />;
    }
    return null;
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

    const accumulate = function (text, unread) {
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
        accumulate(' ...');
      } else {
        var short;
        if (contact.name && contact.name.length > 0) {
          if (items.length > 1) {
            short = contact.displayName({ includeAccountLabel: false, compact: true });
          } else {
            short = contact.displayName({ includeAccountLabel: false });
          }
        } else {
          short = contact.email;
        }
        let truncatedText = short;
        if (truncatedText.length > 12 && idx !== items.length - 1) {
          truncatedText = truncatedText.slice(0, 12);
          if (items.length > 2) {
            truncatedText += '.';
          } else {
            truncatedText += '... ';
          }
        }
        if (idx < items.length - 1 && items.length > 2) {
          truncatedText += ', ';
        } else if (idx < items.length - 1 && truncatedText === short) {
          truncatedText += ', ';
        }
        accumulate(truncatedText, unread);
      }
    }

    if (!this.props.thread.__messages) {
      throw new Error('ThreadListParticipants requires __messages.');
    }

    flush();

    return spans;
  }

  getTokensFromMessages = () => {
    const messages = this.props.thread.__messages;
    const tokens = [];

    let field = 'from';
    if (messages.every(message => message.isFromMe())) {
      field = 'to';
    }

    for (let idx = 0; idx < messages.length; idx++) {
      const message = Object.assign({}, messages[idx]);
      if (message.draft && message.unread) {
        // If message is draft and unread, force contact from name to be 'Draft'
        let tmp = message['from'];
        if (Array.isArray(tmp) && tmp.length > 0) {
          message['from'][0].name = 'Draft';
        }
      }

      for (let contact of message[field]) {
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
    if (list.length > 2) {
      const listTrimmed = [
        // Always include the first item
        list[0],
        { spacer: true },

        // Always include last item
        list[list.length - 1],
      ];
      list = listTrimmed;
    }

    return list;
  };
}

module.exports = ThreadListParticipants;
