import React from 'react';
import { Utils, DateUtils, AccountStore, EmailAvatar } from 'mailspring-exports';
import {
  InjectedComponentSet,
  ListTabular,
  InjectedComponent
} from 'mailspring-component-kit';
import {
  SiftUnreadQuickAction,
  SiftTrashQuickAction,
  SiftStarQuickAction,
} from './sift-list-quick-actions';
function snippet(html) {
  if (!(html && typeof html === 'string')) {
    return '';
  }
  try {
    return Utils.extractTextFromHtml(html, { maxLength: 400 }).substr(0, 200);
  } catch (err) {
    return '';
  }
}

function subject(subj) {
  if ((subj || '').trim().length === 0) {
    return <span className="no-subject">(No Subject)</span>;
  }
  return Utils.extractTextFromHtml(subj);
}

const SenderColumn = new ListTabular.Column({
  name: 'Sender',
  resolver: message => {
    return <EmailAvatar key="email-avatar" mode="list" message={message} />;
  }
});

const ParticipantsColumn = new ListTabular.Column({
  name: 'Participants',
  width: 200,
  resolver: message => {
    const list = [].concat(message.to, message.cc, message.bcc);

    if (list.length > 0) {
      return (
        <div className="participants">
          <span>{list.map(p => p.displayName()).join(', ')}</span>
        </div>
      );
    } else {
      return <div className="participants no-recipients">(No Recipients)</div>;
    }
  },
});
const participants = (message) => {
  const list = [].concat(message.to, message.cc, message.bcc);

  if (list.length > 0) {
    return (
      <div className="participants">
        <span>{list.map(p => p.displayName()).join(', ')}</span>
      </div>
    );
  } else {
    return <div className="participants no-recipients">(No Recipients)</div>;
  }
};

const ContentsColumn = new ListTabular.Column({
  name: 'Contents',
  flex: 4,
  resolver: message => {
    let attachments = [];
    if (message.files && message.files.length > 0) {
      attachments = <div className="thread-icon thread-icon-attachment" />;
    }
    return (
      <span className="details">
        <span className="subject">{subject(message.subject)}</span>
        <span className="snippet">{message.snippet ? message.snippet : snippet(message.body)}</span>
        {attachments}
      </span>
    );
  },
});

const TimeColumn = new ListTabular.Column({
  name: 'Time',
  resolver: message => {
    return (
      <InjectedComponent
        key="sift-injected-timestamp"
        className="sift-injected-timestamp"
        fallback={SiftMessageTimestamp}
        exposedProps={{ message: message }}
        matching={{ role: 'SiftListTimestamp' }}
      />
    );
  },
});

const HoverActions = new ListTabular.Column({
  name: 'HoverActions',
  resolver: message => {
    const actions = [
      <SiftTrashQuickAction message={message} key="sift-trash-quick-action" />,
      <SiftStarQuickAction message={message} key="sift-star-quick-action" />,
      <SiftUnreadQuickAction message={message} key="sift-unread-quick-action" />,
    ];
    return (
      <div className="inner">
        <InjectedComponentSet
          key="injected-component-set"
          inline={true}
          containersRequired={false}
          children={actions}
          matching={{ role: 'SiftListQuickAction' }}
          className="thread-injected-quick-actions"
          exposedProps={{ message: message }}
        />
      </div>
    );
  },
});

const getSnippet = function (message) {
  if (message.snippet) {
    return message.snippet;
  }
  return (
    <div className="skeleton">
      <div></div>
      <div></div>
    </div>
  );
};
const SiftMessageTimestamp = function ({ message }) {
  const timestamp = message.date ? DateUtils.shortTimeString(message.date) : 'No Date';
  return <span className="timestamp">{timestamp}</span>;
};

SiftMessageTimestamp.containerRequired = false;
const cNarrow = new ListTabular.Column({
  name: 'Item',
  flex: 1,
  resolver: message => {
    let attachment = false;
    let calendar = null;
    const hasCalendar = message.hasCalendar;
    if (hasCalendar) {
      calendar = <div className="thread-icon thread-icon-calendar" />;
    }

    const hasAttachments = message.files.length > 0;
    if (hasAttachments) {
      attachment = <div className="thread-icon thread-icon-attachment" />;
    }
    const actions = [
      <SiftTrashQuickAction message={message} key="sift-trash-quick-action" />,
      <SiftStarQuickAction message={message} key="sift-star-quick-action" />,
      <SiftUnreadQuickAction message={message} key="sift-unread-quick-action" />,
    ];
    return (
      <div style={{ display: 'flex', alignItems: 'flex-start' }}>
        <div className="icons-column">
          <EmailAvatar key="email-avatar" mode="split" message={message} />
        </div>
        <div className="thread-info-column">
          <div className="participants-wrapper">
            {participants(message)}
            <span style={{ flex: 1 }} />
            <InjectedComponent
              key="sift-injected-timestamp"
              className="sift-injected-timestamp"
              fallback={SiftMessageTimestamp}
              exposedProps={{ message: message }}
              matching={{ role: 'SiftListTimestamp' }}
            />
            <div className="list-column-HoverActions">
              <div className="inner quick-actions">
                <InjectedComponentSet
                  key="injected-component-set"
                  inline={true}
                  containersRequired={false}
                  children={actions}
                  matching={{ role: 'SiftListQuickAction' }}
                  className="thread-injected-quick-actions"
                  exposedProps={{ message: message }}
                />
              </div>
            </div>
          </div>
          <div className="subject">
            <span>{subject(message.subject)}</span>
            {calendar || attachment || <div className="thread-icon no-icon" />}
          </div>
          <div className="snippet-and-labels">
            <div className="snippet">{getSnippet(message)}&nbsp;</div>
          </div>
        </div>
      </div>
    );
  },
});

module.exports = {
  Wide: [SenderColumn, ParticipantsColumn, ContentsColumn, TimeColumn, HoverActions],
  Narrow: [cNarrow],
};
