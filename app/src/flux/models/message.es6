import _ from 'underscore';
import moment from 'moment';

import File from './file';
import Utils from './utils';
import Event from './event';
import Contact from './contact';
import Folder from './folder';
import Attributes from '../attributes';
import ModelWithMetadata from './model-with-metadata';
import AccountStore from '../stores/account-store';

/*
Public: The Message model represents an email message or draft.

Messages are a sub-object of threads. The content of a message === immutable (with the
exception being drafts). Nylas does not support operations such as move || delete on
individual messages; those operations should be performed on the message’s thread.
All messages are part of a thread, even if that thread has only one message.

## Attributes

`to`: {AttributeCollection} A collection of {Contact} objects

`cc`: {AttributeCollection} A collection of {Contact} objects

`bcc`: {AttributeCollection} A collection of {Contact} objects

`from`: {AttributeCollection} A collection of {Contact} objects.

`replyTo`: {AttributeCollection} A collection of {Contact} objects.

`date`: {AttributeDateTime} When the message was delivered. Queryable.

`subject`: {AttributeString} The subject of the thread. Queryable.

`snippet`: {AttributeString} A short, 140-character plain-text summary of the message body.

`unread`: {AttributeBoolean} True if the message === unread. Queryable.

`starred`: {AttributeBoolean} True if the message === starred. Queryable.

`draft`: {AttributeBoolean} True if the message === a draft. Queryable.

`version`: {AttributeNumber} The version number of the message. Message
   versions are used for drafts, && increment when attributes are changed.

`files`: {AttributeCollection} A set of {File} models representing
   the attachments on this thread.

`body`: {AttributeJoinedData} The HTML body of the message. You must specifically
 request this attribute when querying for a Message using the {{AttributeJoinedData::include}}
 method.

`pristine`: {AttributeBoolean} True if the message === a draft which has not been
 edited since it was created.

`threadId`: {AttributeString} The ID of the Message's parent {Thread}. Queryable.

`replyToHeaderMessageId`: {AttributeString} The headerMessageID of a {Message} that this message is in reply to.

This class also inherits attributes from {Model}

Section: Models
*/
export default class Message extends ModelWithMetadata {
  static NewDraft = 1;
  static EditExistingDraft = 2;
  static ReplyDraft = 3;
  static ForwardDraft = 4;
  static ReplyAllDraft = 5;
  static draftType = {
    reply: 1,
    forward: 2,
  };
  static messageState = {
    normal: '0',
    deleted: '1',
    saving: '2',
    sending: '3',
    updatingNoUID: '4', // Updating data from server
    updatingHasUID: '5',
    failing: '-2', // This state indicates that draft first attempt at sending is taking too long, thus should
    // display in
    // outbox
    failed: '-1', // This state indicates that draft have failed to send.
  };
  static compareMessageState(currentState, targetState){
    try {
      const current = parseInt(currentState);
      const target = parseInt(targetState);
      return current === target;
    } catch (e) {
      AppEnv.reportError(new Error('currentState or targetState cannot be converted to int'), {
        errorData: {
          current: currentState,
          target: targetState,
        },
      });
      return false;
    }
  }
  static attributes = Object.assign({}, ModelWithMetadata.attributes, {
    // load id column into json
    id: Attributes.String({
      queryable: true,
      jsonKey: 'id',
      modelKey: 'id',
      loadFromColumn: true,
    }),

    to: Attributes.Collection({
      modelKey: 'to',
      jsonKey: 'to',
      queryable: true,
      loadFromColumn: true,
      itemClass: Contact,
    }),

    cc: Attributes.Collection({
      modelKey: 'cc',
      jsonKey: 'cc',
      queryable: true,
      loadFromColumn: true,
      itemClass: Contact,
    }),

    bcc: Attributes.Collection({
      modelKey: 'bcc',
      jsonKey: 'bcc',
      queryable: true,
      loadFromColumn: true,
      itemClass: Contact,
    }),

    from: Attributes.Collection({
      modelKey: 'from',
      jsonKey: 'from',
      queryable: true,
      loadFromColumn: true,
      itemClass: Contact,
    }),

    replyTo: Attributes.Collection({
      modelKey: 'replyTo',
      itemClass: Contact,
    }),

    date: Attributes.DateTime({
      queryable: true,
      modelKey: 'date',
    }),

    body: Attributes.JoinedData({
      modelTable: 'MessageBody',
      modelKey: 'body',
    }),

    isPlainText: Attributes.JoinedData({
      modelTable: 'MessageBody',
      modelKey: 'isPlainText',
      joinTableColumn: 'type',
    }),

    files: Attributes.Collection({
      modelKey: 'files',
      itemClass: File,
    }),

    unread: Attributes.Boolean({
      queryable: true,
      modelKey: 'unread',
    }),

    events: Attributes.Collection({
      modelKey: 'events',
      itemClass: Event,
    }),

    starred: Attributes.Boolean({
      queryable: true,
      modelKey: 'starred',
    }),

    snippet: Attributes.String({
      modelKey: 'snippet',
    }),

    threadId: Attributes.String({
      queryable: true,
      modelKey: 'threadId',
    }),

    headerMessageId: Attributes.String({
      queryable: true,
      modelKey: 'headerMessageId',
    }),

    subject: Attributes.String({
      modelKey: 'subject',
    }),

    draft: Attributes.Boolean({
      modelKey: 'draft',
      queryable: true,
    }),

    calendarReply: Attributes.Boolean({
      modelKey: 'calendarReply',
    }),

    pristine: Attributes.Boolean({
      modelKey: 'pristine',
      queryable: false,
    }),

    version: Attributes.Number({
      jsonKey: 'v',
      modelKey: 'version',
      queryable: true,
    }),

    replyToHeaderMessageId: Attributes.String({
      modelKey: 'replyToHeaderMessageId',
    }),

    forwardedHeaderMessageId: Attributes.String({
      modelKey: 'forwardedHeaderMessageId',
    }),

    refOldDraftHeaderMessageId: Attributes.String({
      modelKey: 'refOldDraftHeaderMessageId',
    }),
    savedOnRemote: Attributes.Boolean({
      modelKey: 'savedOnRemote',
    }),
    hasRefOldDraftOnRemote: Attributes.Boolean({
      modelKey: 'hasRefOldDraftOnRemote',
    }),
    folder: Attributes.Object({
      queryable: false,
      modelKey: 'folder',
      itemClass: Folder,
    }),
    //DC-265 State attributes must be Number, but actual value must be string, otherwise all kinds of error
    state: Attributes.Number({
      modelKey: 'state',
      jsonKey: 'state',
      loadFromColumn: true,
      queryable: true,
    }),
    replyOrForward: Attributes.Number({
      modelKey: 'replyOrForward',
    }),
    msgOrigin: Attributes.Number({
      modelKey: 'msgOrigin',
      queryable: true,
    }),
    remoteUID: Attributes.Number({
      modelKey: 'remoteUID',
    }),
    hasNewID: Attributes.Boolean({
      modelKey: 'hasNewID',
    }),
    waitingForBody: Attributes.Boolean({
      modelKey: 'waitingForBody',
      queryable: false,
    }),
    calendarCurrentStatus: Attributes.Number({
      modelKey: 'calCurStat',
    }),
    calendarTargetStatus: Attributes.Number({
      modelKey: 'calTarStat',
    }),
    calendarFileId: Attributes.String({
      modelKey: 'calFileId',
    }),
    hasCalendar: Attributes.Boolean({
      modelKey: 'hasCalendar',
    }),
  });

  static naturalSortOrder() {
    return Message.attributes.date.ascending();
  }

  constructor(data = {}) {
    super(data);
    this.subject = this.subject || '';
    this.to = this.to || [];
    this.cc = this.cc || [];
    this.bcc = this.bcc || [];
    this.from = this.from || [];
    this.replyTo = this.replyTo || [];
    this.files = this.files || [];
    this.events = this.events || [];
    this.waitingForBody = data.waitingForBody || false;
  }

  toJSON(options) {
    const json = super.toJSON(options);
    json.file_ids = this.fileIds();
    // if (this.draft) {
    //   json.object = 'draft';
    // }

    if (this.events && this.events.length) {
      json.event_id = this.events[0].id;
    }

    return json;
  }

  fromJSON(json = {}) {
    super.fromJSON(json);

    // Only change the `draft` bit if the incoming json has an `object`
    // property. Because of `DraftChangeSet`, it's common for incoming json
    // to be an empty hash. In this case we want to leave the pre-existing
    // draft bit alone.
    // if (json.object) {
    //   this.draft = json.object === 'draft';
    // }

    return this;
  }

  canReplyAll() {
    const { to, cc } = this.participantsForReplyAll();
    return to.length > 1 || cc.length > 0;
  }

  // Public: Returns a set of uniqued message participants by combining the
  // `to`, `cc`, `bcc` && (optionally) `from` fields.
  participants({ includeFrom = true, includeBcc = false } = {}) {
    const seen = {};
    const all = [];
    let contacts = [].concat(this.to, this.cc);
    if (includeFrom) {
      contacts = _.union(contacts, this.from || []);
    }
    if (includeBcc) {
      contacts = _.union(contacts, this.bcc || []);
    }
    for (const contact of contacts) {
      if (!contact.email) {
        continue;
      }
      const key = contact
        .toString()
        .trim()
        .toLowerCase();
      if (seen[key]) {
        continue;
      }
      seen[key] = true;
      all.push(contact);
    }
    return all;
  }

  // Public: Returns a hash with `to` && `cc` keys for authoring a new draft in
  // "reply all" to this message. This method takes into account whether the
  // message is from the current user, && also looks at the replyTo field.
  participantsForReplyAll() {
    const excludedFroms = this.from.map(c => Utils.toEquivalentEmailForm(c.email));

    const excludeMeAndFroms = cc =>
      _.reject(
        cc,
        p => p.isMe() || _.contains(excludedFroms, Utils.toEquivalentEmailForm(p.email)),
      );

    let to = null;
    let cc = null;

    if (this.replyTo.length && !this.replyTo[0].isMe()) {
      // If a replyTo is specified and that replyTo would not result in you
      // sending the message to yourself, use it.
      to = this.replyTo;
      cc = excludeMeAndFroms([].concat(this.to, this.cc));
    } else if (this.isFromMe()) {
      // If the message is from you to others, reply-all should send to the
      // same people.
      to = this.to;
      cc = excludeMeAndFroms(this.cc);
    } else {
      // ... otherwise, address the reply to the sender of the email and cc
      // everyone else.
      to = this.from;
      cc = excludeMeAndFroms([].concat(this.to, this.cc));
    }

    to = _.uniq(to, p => Utils.toEquivalentEmailForm(p.email));
    cc = _.uniq(cc, p => Utils.toEquivalentEmailForm(p.email));
    return { to, cc };
  }

  // Public: Returns a hash with `to` && `cc` keys for authoring a new draft in
  // "reply" to this message. This method takes into account whether the
  // message is from the current user, && also looks at the replyTo field.
  participantsForReply() {
    let to = [];
    const cc = [];
    if (this.replyTo.length && !this.replyTo[0].isMe()) {
      // If a replyTo is specified and that replyTo would not result in you
      // sending the message to yourself, use it.
      to = this.replyTo;
    } else if (this.isExactFromMe()) {
      // If you sent the previous email, a "reply" should go to the same recipient.
      to = this.to;
    } else {
      // ... otherwise, address the reply to the sender.
      to = this.from;
    }

    to = _.uniq(to, p => Utils.toEquivalentEmailForm(p.email));
    return { to, cc };
  }

  isExactFromMe() {
    if (this.from[0]) {
      const me = AccountStore.accountForId(this.accountId);
      if (me && me.emailAddress === this.from[0].email) {
        return true;
      }
    }
    return false;
  }

  // Public: Returns an {Array} of {File} IDs
  fileIds() {
    return this.files.map(file => file.id);
  }

  // Public: Returns true if this message === from the current user's email
  // address. In the future, this method will take into account all of the
  // user's email addresses && accounts.
  isFromMe() {
    return this.from[0] ? this.from[0].isMe() : false;
  }

  isForwarded() {
    if (this.subject.toLowerCase().startsWith('fwd:')) {
      return true;
    }
    if (this.subject.toLowerCase().startsWith('re:')) {
      return false;
    }
    if (this.body) {
      const indexForwarded = this.body.search(/forwarded/i);
      if (indexForwarded >= 0 && indexForwarded < 250) {
        return true;
      }
      const indexFwd = this.body.search(/fwd/i);
      if (indexFwd >= 0 && indexFwd < 250) {
        return true;
      }
    }
    return false;
  }

  isInTrash() {
    if (!this.folder || !this.folder.role) {
      return false;
    }
    return this.folder.role.toLowerCase().includes('trash');
  }

  fromContact() {
    return (this.from || [])[0] || new Contact({ name: 'Unknown', email: 'Unknown' });
  }

  // Public: Returns the standard attribution line for this message,
  // localized for the current user.
  // ie "On Dec. 12th, 2015 at 4:00PM, Ben Gotow wrote:"
  replyAttributionLine() {
    return `On ${this.formattedDate()}, ${this.fromContact().toString()} wrote:`;
  }

  formattedDate() {
    return moment(this.date).format('MMM D YYYY, [at] h:mm a');
  }

  hasEmptyBody() {
    if (!this.body) {
      return true;
    }

    // https://regex101.com/r/hR7zN3/1
    const re = /(?:<signature>.*<\/signature>)|(?:<.+?>)|\s/gim;
    return this.body.replace(re, '').length === 0;
  }

  isActiveDraft() {

  }

  isDeleted() {
    //DC-269
    return this.state == Message.messageState.deleted; // eslint-ignore-line
  }

  isDraftSaving() {
    return this.state == Message.messageState.saving && this.draft; // eslint-ignore-line
  }
  isCalendarReply() {
    return this.calendarReply;
  }

  isHidden() {
    const isReminder =
      this.to.length === 1 &&
      this.from.length === 1 &&
      this.to[0].email === this.from[0].email &&
      (this.from[0].name || '').endsWith('via Mailspring');
    const isDraftBeingDeleted = this.id.startsWith('deleted-') || this.isDeleted();

    return isReminder || isDraftBeingDeleted || this.isCalendarReply();
  }

  setOrigin(val) {
    this.msgOrigin = val;
  }

  isNewDraft() {
    return this.msgOrigin === Message.NewDraft;
  }

  calendarStatus() {
    if (this.calendarTargetStatus >= 0) {
      return this.calendarTargetStatus;
    }
    return this.calendarCurrentStatus;
  }
}
