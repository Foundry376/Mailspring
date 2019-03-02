import React from 'react';
import {
  ListTabular,
  RetinaImg,
  MailLabelSet,
  MailImportantIcon,
  InjectedComponent,
  InjectedComponentSet,
} from 'mailspring-component-kit';

import { localized, FocusedPerspectiveStore, Utils, DateUtils } from 'mailspring-exports';

import { ThreadArchiveQuickAction, ThreadTrashQuickAction } from './thread-list-quick-actions';
import ThreadListParticipants from './thread-list-participants';
import ThreadListIcon from './thread-list-icon';

// Get and format either last sent or last received timestamp depending on thread-list being viewed
const ThreadListTimestamp = function({ thread }) {
  let rawTimestamp = FocusedPerspectiveStore.current().isSent()
    ? thread.lastMessageSentTimestamp
    : thread.lastMessageReceivedTimestamp;
  const timestamp = rawTimestamp ? DateUtils.shortTimeString(rawTimestamp) : localized('No Date');
  return <span className="timestamp">{timestamp}</span>;
};

ThreadListTimestamp.containerRequired = false;

const subject = function(subj) {
  if ((subj || '').trim().length === 0) {
    return <span className="no-subject">{localized('(No Subject)')}</span>;
  } else if (subj.split(/([\uD800-\uDBFF][\uDC00-\uDFFF])/g).length > 1) {
    const subjComponents = [];
    const subjParts = subj.split(/([\uD800-\uDBFF][\uDC00-\uDFFF])/g);
    for (let idx = 0; idx < subjParts.length; idx++) {
      const part = subjParts[idx];
      if (part.match(/([\uD800-\uDBFF][\uDC00-\uDFFF])/g)) {
        subjComponents.push(
          <span className="emoji" key={idx}>
            {part}
          </span>
        );
      } else {
        subjComponents.push(<span key={idx}>{part}</span>);
      }
    }
    return subjComponents;
  } else {
    return subj;
  }
};

const getSnippet = function(thread) {
  const messages = thread.__messages || [];
  if (messages.length === 0) {
    return thread.snippet;
  }
  for (let ii = messages.length - 1; ii >= 0; ii--) {
    if (messages[ii].snippet) return messages[ii].snippet;
  }
  return null;
};

const c1 = new ListTabular.Column({
  name: '★',
  resolver: thread => {
    return [
      <ThreadListIcon key="thread-list-icon" thread={thread} />,
      <MailImportantIcon
        key="mail-important-icon"
        thread={thread}
        showIfAvailableForAnyAccount={true}
      />,
      <InjectedComponentSet
        key="injected-component-set"
        inline={true}
        containersRequired={false}
        matching={{ role: 'ThreadListIcon' }}
        className="thread-injected-icons"
        exposedProps={{ thread: thread }}
      />,
    ];
  },
});

const c2 = new ListTabular.Column({
  name: 'Participants',
  width: 200,
  resolver: thread => {
    const hasDraft = (thread.__messages || []).find(m => m.draft);
    if (hasDraft) {
      return (
        <div style={{ display: 'flex' }}>
          <ThreadListParticipants thread={thread} />
          <RetinaImg
            name="icon-draft-pencil.png"
            className="draft-icon"
            mode={RetinaImg.Mode.ContentPreserve}
          />
        </div>
      );
    } else {
      return <ThreadListParticipants thread={thread} />;
    }
  },
});

const c3 = new ListTabular.Column({
  name: 'Message',
  flex: 4,
  resolver: thread => {
    let attachment: JSX.Element = null;
    const messages = thread.__messages || [];

    const hasAttachments =
      thread.attachmentCount > 0 && messages.find(m => Utils.showIconForAttachments(m.files));
    if (hasAttachments) {
      attachment = <div className="thread-icon thread-icon-attachment" />;
    }

    return (
      <span className="details">
        <MailLabelSet thread={thread} />
        <span className="subject" dir="auto">
          {subject(thread.subject)}
        </span>
        <span className="snippet" dir="auto">
          {getSnippet(thread)}
        </span>
        {attachment}
      </span>
    );
  },
});

const c4 = new ListTabular.Column({
  name: 'Date',
  resolver: thread => {
    return (
      <InjectedComponent
        className="thread-injected-timestamp"
        fallback={ThreadListTimestamp}
        exposedProps={{ thread: thread }}
        matching={{ role: 'ThreadListTimestamp' }}
      />
    );
  },
});

const c5 = new ListTabular.Column({
  name: 'HoverActions',
  resolver: thread => {
    return (
      <div className="inner">
        <InjectedComponentSet
          key="injected-component-set"
          inline={true}
          containersRequired={false}
          children={[
            <ThreadTrashQuickAction key="thread-trash-quick-action" thread={thread} />,
            <ThreadArchiveQuickAction key="thread-archive-quick-action" thread={thread} />,
          ]}
          matching={{ role: 'ThreadListQuickAction' }}
          className="thread-injected-quick-actions"
          exposedProps={{ thread: thread }}
        />
      </div>
    );
  },
});

const cNarrow = new ListTabular.Column({
  name: 'Item',
  flex: 1,
  resolver: thread => {
    let pencil: JSX.Element = null;
    let attachment: JSX.Element = null;
    const messages = thread.__messages || [];

    const hasAttachments =
      thread.attachmentCount > 0 && messages.find(m => Utils.showIconForAttachments(m.files));
    if (hasAttachments) {
      attachment = <div className="thread-icon thread-icon-attachment" />;
    }

    const hasDraft = messages.find(m => m.draft);
    if (hasDraft) {
      pencil = (
        <RetinaImg
          name="icon-draft-pencil.png"
          className="draft-icon"
          mode={RetinaImg.Mode.ContentPreserve}
        />
      );
    }

    // TODO We are limiting the amount on injected icons in narrow mode to 1
    // until we revisit the UI to accommodate more icons
    return (
      <div style={{ display: 'flex', alignItems: 'flex-start' }}>
        <div className="icons-column">
          <ThreadListIcon thread={thread} />
          <InjectedComponentSet
            inline={true}
            matchLimit={1}
            direction="column"
            containersRequired={false}
            key="injected-component-set"
            exposedProps={{ thread: thread }}
            matching={{ role: 'ThreadListIcon' }}
            className="thread-injected-icons"
          />
          <MailImportantIcon thread={thread} showIfAvailableForAnyAccount={true} />
        </div>
        <div className="thread-info-column">
          <div className="participants-wrapper">
            <ThreadListParticipants thread={thread} />
            {pencil}
            <span style={{ flex: 1 }} />
            {attachment}
            <InjectedComponent
              key="thread-injected-timestamp"
              className="thread-injected-timestamp"
              fallback={ThreadListTimestamp}
              exposedProps={{ thread: thread }}
              matching={{ role: 'ThreadListTimestamp' }}
            />
          </div>
          <div className="subject" dir="auto">
            {subject(thread.subject)}
          </div>
          <div className="snippet-and-labels">
            <div className="snippet" dir="auto">
              {getSnippet(thread)}&nbsp;
            </div>
            <div style={{ flex: 1, flexShrink: 1 }} />
            <MailLabelSet thread={thread} />
          </div>
        </div>
      </div>
    );
  },
});

export const Narrow = [cNarrow];
export const Wide = [c1, c2, c3, c4, c5];
