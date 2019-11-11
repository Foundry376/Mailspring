import React from 'react';
import { Utils, Message, DateUtils, AccountStore } from 'mailspring-exports';
import { InjectedComponentSet, ListTabular, InjectedComponent } from 'mailspring-component-kit';
import {
  OutboxResendQuickAction,
  OutboxTrashQuickAction,
  OutboxEditQuickAction,
} from './outbox-list-quick-actions';
import RetinaImg from '../../../src/components/retina-img';
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
  resolver: draft => {
    const account = AccountStore.accountForId(draft.accountId);
    let accountLogo = 'account-logo-other.png';
    if (account && account.provider !== 'imap') {
      accountLogo = `account-logo-${account.provider}.png`;
    }
    const styles = {
      backgroundPosition: 'center',
      backgroundSize: 'cover',
    };
    return <div className="avatar-icon" style={styles}>
      <RetinaImg mode={RetinaImg.Mode.ContentPreserve}
        name={accountLogo}
        style={{ width: 40, height: 40 }}
      />
    </div>
  }
});

const ParticipantsColumn = new ListTabular.Column({
  name: 'Participants',
  width: 180,
  resolver: draft => {
    const list = [].concat(draft.to, draft.cc, draft.bcc);

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
const participants = (draft) => {
  const list = [].concat(draft.to, draft.cc, draft.bcc);

  if (list.length > 0) {
    return (
      <div className="participants">
        <span>{list.map(p => p.displayName()).join(', ')}</span>
      </div>
    );
  } else {
    return <div className="participants no-recipients">(No Recipients)</div>;
  }
}

const ContentsColumn = new ListTabular.Column({
  name: 'Contents',
  flex: 4,
  resolver: draft => {
    let attachments = [];
    if (draft.files && draft.files.length > 0) {
      attachments = <div className="thread-icon thread-icon-attachment" />;
    }
    return (
      <span className="details">
        <span className="subject">{subject(draft.subject)}</span>
        <span className="snippet">{draft.snippet ? draft.snippet : snippet(draft.body)}</span>
        {attachments}
      </span>
    );
  },
});

const StatusColumn = new ListTabular.Column({
  name: 'State',
  resolver: draft => {
    return (
      <InjectedComponentSet
        inline={true}
        containersRequired={false}
        matching={{ role: 'OutboxList:DraftStatus' }}
        className="draft-list-injected-state"
        exposedProps={{ draft }}
      />
    );
  },
});

const HoverActions = new ListTabular.Column({
  name: 'HoverActions',
  resolver: draft => {
    const actions = [];
    if (Message.compareMessageState(draft.state, Message.messageState.failed)) {
      actions.unshift(<OutboxTrashQuickAction draft={draft} key='outbox-trash-quick-action' />);
      actions.unshift(<OutboxEditQuickAction draft={draft} key='outbox-edit-quick-action' />);
      actions.unshift(<OutboxResendQuickAction draft={draft} key='outbox-resend-quick-action' />)
    }
    return (
      <div className="inner">
        <InjectedComponentSet
          key="injected-component-set"
          inline={true}
          containersRequired={false}
          children={actions}
          matching={{ role: 'OutboxListQuickAction' }}
          className="thread-injected-quick-actions"
          exposedProps={{ draft: draft }}
        />
      </div>
    );
  },
});

const getSnippet = function (draft) {
  if (draft.snippet) {
    return draft.snippet;
  }
  return (
    <div className="skeleton">
      <div></div>
      <div></div>
    </div>
  );
};
const OutboxDraftTimestamp = function ({ draft }) {
  const timestamp = draft.date ? DateUtils.shortTimeString(draft.date) : 'No Date';
  return <span className="timestamp">{timestamp}</span>;
};

OutboxDraftTimestamp.containerRequired = false;
const cNarrow = new ListTabular.Column({
  name: 'Item',
  flex: 1,
  resolver: draft => {
    let attachment = false;
    let calendar = null;
    const hasCalendar = draft.hasCalendar;
    if (hasCalendar) {
      calendar = <div className="thread-icon thread-icon-calendar" />;
    }

    const hasAttachments = draft.files.length > 0;
    if (hasAttachments) {
      attachment = <div className="thread-icon thread-icon-attachment" />;
    }
    const actions = [];
    if (Message.compareMessageState(draft.state, Message.messageState.failed)) {
      actions.unshift(<OutboxTrashQuickAction draft={draft} key='outbox-trash-quick-action' />);
      actions.unshift(<OutboxEditQuickAction draft={draft} key='outbox-edit-quick-action' />);
      actions.unshift(<OutboxResendQuickAction draft={draft} key='outbox-resend-quick-action' />)
    }
    return (
      <div style={{ display: 'flex', alignItems: 'flex-start' }}>
        <div className="icons-column">
          {SenderColumn.resolver(draft)}
        </div>
        <div className="thread-info-column">
          <div className="participants-wrapper">
            {participants(draft)}
            <span style={{ flex: 1 }} />
            <InjectedComponent
              key="outbox-injected-timestamp"
              className="outbox-injected-timestamp"
              fallback={OutboxDraftTimestamp}
              exposedProps={{ draft: draft }}
              matching={{ role: 'OutboxListTimestamp' }}
            />
            <div className="list-column-HoverActions">
              <div className="inner quick-actions">
                <InjectedComponentSet
                  key="injected-component-set"
                  inline={true}
                  containersRequired={false}
                  children={actions}
                  matching={{ role: 'OutboxListQuickAction' }}
                  className="thread-injected-quick-actions"
                  exposedProps={{ draft: draft }}
                />
              </div>
            </div>
          </div>
          <div className="subject">
            <span>{subject(draft.subject)}</span>
            {calendar || attachment || <div className="thread-icon no-icon" />}
          </div>
          <div className="snippet-and-labels">
            <div className="snippet">{getSnippet(draft)}&nbsp;</div>
          </div>
        </div>
      </div>
    );
  },
});

module.exports = {
  Wide: [SenderColumn, ParticipantsColumn, ContentsColumn, StatusColumn, HoverActions],
  Narrow: [cNarrow],
};
