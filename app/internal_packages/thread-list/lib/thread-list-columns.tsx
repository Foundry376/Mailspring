import React from 'react';
import {
  ListTabular,
  RetinaImg,
  MailLabelSet,
  MailImportantIcon,
  InjectedComponent,
  InjectedComponentSet,
} from 'mailspring-component-kit';

import { localized, FocusedPerspectiveStore, Utils, DateUtils, Thread, Message } from 'mailspring-exports';

import { ThreadArchiveQuickAction, ThreadTrashQuickAction } from './thread-list-quick-actions';
import ThreadListParticipants from './thread-list-participants';
import ThreadListIcon from './thread-list-icon';
import { ItemAdapter } from './thread-or-message';

// Get and format either last sent or last received timestamp depending on thread-list being viewed
const ThreadListTimestamp = function ({ thread }: { thread: Thread | Message }) {
  const rawTimestamp = FocusedPerspectiveStore.current().isSent()
    ? ItemAdapter.getSentDate(thread)
    : ItemAdapter.getDate(thread);
  const timestamp = rawTimestamp ? DateUtils.shortTimeString(rawTimestamp) : localized('No Date');
  return <span className="timestamp">{timestamp}</span>;
};

ThreadListTimestamp.containerRequired = false;

const subject = function (subj) {
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

const getSnippet = function (item: Thread | Message) {
  return ItemAdapter.getSnippet(item);
};

const c1 = new ListTabular.Column({
  name: '★',
  resolver: (item: Thread | Message) => {
    return [
      <ThreadListIcon key="thread-list-icon" thread={item} />,
      <MailImportantIcon
        key="mail-important-icon"
        thread={item}
        showIfAvailableForAnyAccount={true}
      />,
      <InjectedComponentSet
        key="injected-component-set"
        inline={true}
        containersRequired={false}
        matching={{ role: 'ThreadListIcon' }}
        className="thread-injected-icons"
        exposedProps={{ thread: item }}
      />,
    ];
  },
});

const c2 = new ListTabular.Column({
  name: 'Participants',
  width: 200,
  resolver: (item: Thread | Message) => {
    const hasDraft = ItemAdapter.isDraft(item);
    if (hasDraft) {
      return (
        <div style={{ display: 'flex' }}>
          <ThreadListParticipants thread={item} />
          <RetinaImg
            name="icon-draft-pencil.png"
            className="draft-icon"
            mode={RetinaImg.Mode.ContentPreserve}
          />
        </div>
      );
    } else {
      return <ThreadListParticipants thread={item} />;
    }
  },
});

const c3 = new ListTabular.Column({
  name: 'Message',
  flex: 4,
  resolver: (item: Thread | Message) => {
    let attachment: JSX.Element = null;

    const hasAttachments = ItemAdapter.getAttachmentCount(item) > 0 &&
      Utils.showIconForAttachments(ItemAdapter.getFiles(item));
    if (hasAttachments) {
      attachment = <div className="thread-icon thread-icon-attachment" />;
    }

    return (
      <span className="details">
        <MailLabelSet thread={item} />
        <span className="subject" dir="auto">
          {subject(ItemAdapter.getSubject(item))}
        </span>
        <span className="snippet" dir="auto">
          {getSnippet(item)}
        </span>
        {attachment}
      </span>
    );
  },
});

const c4 = new ListTabular.Column({
  name: 'Date',
  resolver: (item: Thread | Message) => {
    return (
      <InjectedComponent
        className="thread-injected-timestamp"
        fallback={ThreadListTimestamp}
        exposedProps={{ thread: item }}
        matching={{ role: 'ThreadListTimestamp' }}
      />
    );
  },
});

const c5 = new ListTabular.Column({
  name: 'HoverActions',
  resolver: (item: Thread | Message) => {
    return (
      <div className="inner">
        <InjectedComponentSet
          key="injected-component-set"
          inline={true}
          containersRequired={false}
          children={[
            <ThreadTrashQuickAction key="thread-trash-quick-action" thread={item} />,
            <ThreadArchiveQuickAction key="thread-archive-quick-action" thread={item} />,
          ]}
          matching={{ role: 'ThreadListQuickAction' }}
          className="thread-injected-quick-actions"
          exposedProps={{ thread: item }}
        />
      </div>
    );
  },
});

const cNarrow = new ListTabular.Column({
  name: 'Item',
  flex: 1,
  resolver: (item: Thread | Message) => {
    let pencil: JSX.Element = null;
    let attachment: JSX.Element = null;

    const hasAttachments = ItemAdapter.getAttachmentCount(item) > 0 &&
      Utils.showIconForAttachments(ItemAdapter.getFiles(item));
    if (hasAttachments) {
      attachment = <div className="thread-icon thread-icon-attachment" />;
    }

    const hasDraft = ItemAdapter.isDraft(item);
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
          <ThreadListIcon thread={item} />
          <InjectedComponentSet
            inline={true}
            matchLimit={1}
            direction="column"
            containersRequired={false}
            key="injected-component-set"
            exposedProps={{ thread: item }}
            matching={{ role: 'ThreadListIcon' }}
            className="thread-injected-icons"
          />
          <MailImportantIcon thread={item} showIfAvailableForAnyAccount={true} />
        </div>
        <div className="thread-info-column">
          <div className="participants-wrapper">
            <ThreadListParticipants thread={item} />
            {pencil}
            <span style={{ flex: 1 }} />
            {attachment}
            <InjectedComponent
              key="thread-injected-timestamp"
              className="thread-injected-timestamp"
              fallback={ThreadListTimestamp}
              exposedProps={{ thread: item }}
              matching={{ role: 'ThreadListTimestamp' }}
            />
          </div>
          <div className="subject" dir="auto">
            {subject(ItemAdapter.getSubject(item))}
          </div>
          <div className="snippet-and-labels">
            <div className="snippet" dir="auto">
              {getSnippet(item)}&nbsp;
            </div>
            <div style={{ flex: 1, flexShrink: 1 }} />
            <MailLabelSet thread={item} />
          </div>
        </div>
      </div>
    );
  },
});

export const Narrow = [cNarrow];
export const Wide = [c1, c2, c3, c4, c5];
