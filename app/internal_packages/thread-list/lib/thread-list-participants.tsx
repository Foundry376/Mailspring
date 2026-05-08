import React from 'react';
import { Utils, Contact } from 'mailspring-exports';
import { AccountColorBar } from 'mailspring-component-kit';
import { ThreadWithMessagesMetadata } from './types';

function getTokensFromMessages(thread: ThreadWithMessagesMetadata) {
  const messages = thread.__messages;
  const tokens = [];

  let field = 'from';
  if (messages.every((message) => message.isFromMe())) {
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
}

function getTokensFromParticipants(thread: ThreadWithMessagesMetadata) {
  let contacts = thread.participants != null ? thread.participants : [];
  contacts = contacts.filter((contact) => !contact.isMe());
  return contacts.map((contact) => ({ contact, unread: false }));
}

function getTokens(thread: ThreadWithMessagesMetadata) {
  let list;
  if (thread.__messages instanceof Array) {
    list = getTokensFromMessages(thread);
  } else {
    list = getTokensFromParticipants(thread);
  }

  // If no participants, we should at least add current user as sole participant
  if (
    list.length === 0 &&
    (thread.participants != null ? thread.participants.length : undefined) > 0
  ) {
    list.push({ contact: thread.participants[0], unread: false });
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
}

function renderSpans(
  thread: ThreadWithMessagesMetadata,
  items: Array<{ spacer?: boolean; contact?: Contact; unread?: boolean }>
) {
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

  const accumulate = function (text: string, unread?: boolean) {
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

  if (!thread.__messages) {
    throw new Error('ThreadListParticipants requires __messages.');
  }

  const messages = thread.__messages != null ? thread.__messages : [];
  if (messages.length > 1) {
    accumulate(` (${messages.length})`);
  }

  flush();

  return spans;
}

const ThreadListParticipants: React.FC<{ thread: ThreadWithMessagesMetadata }> = React.memo(
  ({ thread }) => (
    <div className="participants" dir="auto">
      <AccountColorBar accountId={thread.accountId} />
      {renderSpans(thread, getTokens(thread))}
    </div>
  ),
  (prev, next) => prev.thread === next.thread
);
ThreadListParticipants.displayName = 'ThreadListParticipants';

export default ThreadListParticipants;
