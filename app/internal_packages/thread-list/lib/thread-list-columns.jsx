const React = require('react');
const {
  ListTabular,
  RetinaImg,
  MailLabelSet,
  MailImportantIcon,
  InjectedComponent,
  InjectedComponentSet,
} = require('mailspring-component-kit');

const { FocusedPerspectiveStore, Utils, DateUtils, EmailAvatar } = require('mailspring-exports');

const { ThreadUnreadQuickAction, ThreadStarQuickAction, ThreadArchiveQuickAction, ThreadTrashQuickAction } = require('./thread-list-quick-actions');
const ThreadListParticipants = require('./thread-list-participants');
const ThreadListIcon = require('./thread-list-icon');

// Get and format either last sent or last received timestamp depending on thread-list being viewed
const ThreadListTimestamp = function ({ thread }) {
  let rawTimestamp = FocusedPerspectiveStore.current().isSent()
    ? thread.lastMessageSentTimestamp
    : thread.lastMessageReceivedTimestamp;
  if (!rawTimestamp) {
    rawTimestamp = thread.lastMessageSentTimestamp;
  }
  const timestamp = rawTimestamp ? DateUtils.shortTimeString(rawTimestamp) : 'No Date';
  return <span className="timestamp">{timestamp}</span>;
};

ThreadListTimestamp.containerRequired = false;

const subject = function (subj) {
  if ((subj || '').trim().length === 0) {
    return <span className="no-subject">(No Subject)</span>;
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

const getSnippet = function (thread) {
  const messages = thread.__messages || [];
  if (thread.snippet) {
    return thread.snippet;
  }
  for (let ii = messages.length - 1; ii >= 0; ii--) {
    if (messages[ii].snippet) return messages[ii].snippet;
  }
  return (
    <div className="skeleton">
      <div></div>
      <div></div>
    </div>
  );
};

const c1 = new ListTabular.Column({
  name: '★',
  resolver: thread => {
    return [
      <EmailAvatar thread={thread} />,
      // <ThreadListIcon key="thread-list-icon" thread={thread} />,
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
  maxWidth: 200,
  resolver: thread => {
    const messages = thread.__messages || [];

    let draft = null;
    const hasDraft = messages.find(m => m.draft);
    if (hasDraft) {
      draft = (
        <RetinaImg
          name="pencil.svg"
          isIcon
          style={{ width: 16, height: 16 }}
          className="thread-icon thread-icon-pencil"
          mode={RetinaImg.Mode.ContentIsMask}
        />
      );
    }

    let attachment = null;
    const haveAttachments =
      thread.attachmentCount > 0 && messages.find(m => Utils.showIconForAttachments(m.files));
    if (haveAttachments) {
      attachment = <div className="thread-icon thread-icon-attachment" />;
    }

    if (hasDraft || haveAttachments) {
      return (
        <div style={{ display: 'flex' }}>
          <ThreadListParticipants thread={thread} />
          {attachment}
          {draft}
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
    return (
      <span className="details">
        <MailLabelSet thread={thread} />
        <span className="subject">{subject(thread.subject)}</span>
        <span className="snippet">{getSnippet(thread)}</span>
        <ThreadListIcon thread={thread} />
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
            <ThreadUnreadQuickAction key="thread-unread-quick-action" thread={thread} />,
            <ThreadStarQuickAction key="thread-star-quick-action" thread={thread} />,
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
    let pencil = false;
    let attachment = false;
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
          name="pencil.svg"
          isIcon
          style={{ width: 16, height: 16 }}
          className="thread-icon-pencil"
          mode={RetinaImg.Mode.ContentIsMask}
        />
      );
    }

    // TODO We are limiting the amount on injected icons in narrow mode to 1
    // until we revisit the UI to accommodate more icons
    return (
      <div style={{ display: 'flex', alignItems: 'flex-start' }}>
        <div className="icons-column">
          <EmailAvatar thread={thread} />
        </div>
        <div className="thread-info-column">
          <div className="participants-wrapper">
            <ThreadListParticipants thread={thread} />
            {attachment}
            {pencil}
            <span style={{ flex: 1 }} />
            <InjectedComponent
              key="thread-injected-timestamp"
              className="thread-injected-timestamp"
              fallback={ThreadListTimestamp}
              exposedProps={{ thread: thread }}
              matching={{ role: 'ThreadListTimestamp' }}
            />
            <div className="list-column-HoverActions">
              <div className="inner quick-actions">
                <InjectedComponentSet
                  key="injected-component-set"
                  inline={true}
                  containersRequired={false}
                  children={[
                    <ThreadUnreadQuickAction key="thread-unread-quick-action" thread={thread} />,
                    <ThreadStarQuickAction key="thread-star-quick-action" thread={thread} />,
                    <ThreadTrashQuickAction key="thread-trash-quick-action" thread={thread} />,
                    <ThreadArchiveQuickAction key="thread-archive-quick-action" thread={thread} />,
                  ]}
                  matching={{ role: 'ThreadListQuickAction' }}
                  className="thread-injected-quick-actions"
                  exposedProps={{ thread: thread }}
                />
              </div>
            </div>
          </div>
          <div className="subject">
            <span>{subject(thread.subject)}</span>
            <ThreadListIcon thread={thread} />
          </div>
          <div className="snippet-and-labels">
            <div className="snippet">{getSnippet(thread)}&nbsp;</div>
            {/* <div style={{ flex: 1, flexShrink: 1 }} /> */}
            {/* <MailLabelSet thread={thread} /> */}
            <div className="icons">
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
          </div>
        </div>
      </div>
    );
  },
});

module.exports = {
  Narrow: [cNarrow],
  Wide: [c1, c2, c3, c4, c5],
};
