import React from 'react';
import { Utils } from 'mailspring-exports';
import { InjectedComponentSet, ListTabular } from 'mailspring-component-kit';

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

const ParticipantsColumn = new ListTabular.Column({
  name: 'Participants',
  width: 180,
  resolver: draft => {
    const list = [].concat(draft.to, draft.cc, draft.bcc);

    if (list.length > 0) {
      return (
        <div className="participants">
          <div className="participants-inner">
            <span>{list.map(p => p.displayName()).join(', ')}</span>
          </div>
        </div>
      );
    } else {
      return <div className="participants no-recipients">(No Recipients)</div>;
    }
  },
});

const ContentsColumn = new ListTabular.Column({
  name: 'Contents',
  flex: 4,
  resolver: draft => {
    return (
      <span className="details">
        <span className="subject">{subject(draft.subject)}</span>
        <span className="snippet">{draft.snippet ? draft.snippet : snippet(draft.body)}</span>
      </span>
    );
  },
});

const AttachmentsColumn = new ListTabular.Column({
  name: 'Attachments',
  width: 32,
  resolver: draft => {
    let attachments = [];
    if (draft.files && draft.files.length > 0) {
      attachments = <div className="thread-icon thread-icon-attachment" />;
    }
    return attachments;
  },
});

const StatusColumn = new ListTabular.Column({
  name: 'State',
  resolver: draft => {
    return (
      <InjectedComponentSet
        inline={true}
        containersRequired={false}
        matching={{ role: 'DraftList:DraftStatus' }}
        className="draft-list-injected-state"
        exposedProps={{ draft }}
      />
    );
  },
});

module.exports = {
  Wide: [ParticipantsColumn, AttachmentsColumn, ContentsColumn, StatusColumn],
};
