import _ from 'underscore';
import { v4 as uuidv4 } from 'uuid';
import * as Actions from '../actions';
import DatabaseStore from './database-store';
import { AccountStore } from './account-store';
import ContactStore from './contact-store';
import { MessageStore } from './message-store';
import FocusedPerspectiveStore from './focused-perspective-store';
import { localized } from '../../intl';
import { Contact } from '../models/contact';
import { Message } from '../models/message';
import MessageUtils from '../models/message-utils';
import * as Utils from '../models/utils';
import InlineStyleTransformer from '../../services/inline-style-transformer';
import SanitizeTransformer from '../../services/sanitize-transformer';
import DOMUtils from '../../dom-utils';
import { Thread } from '../models/thread';
import { convertToPlainText, convertFromHTML } from '../../components/composer-editor/conversion';
import {
  wrapPlaintext,
  deepenPlaintextQuote,
  convertPlaintextToHTML,
} from '../../components/composer-editor/plaintext';

let DraftStore: typeof import('./draft-store').default = null;

export type ReplyType = 'reply' | 'reply-all';
export type ReplyBehavior = 'prefer-existing' | 'prefer-existing-if-pristine';

class DraftFactory {
  normalizeContentId(contentId = '') {
    let normalized = (contentId || '').trim().replace(/^</, '').replace(/>$/, '');
    try {
      normalized = decodeURIComponent(normalized);
    } catch (err) {
      // no-op
    }
    return normalized;
  }

  useHTML() {
    const forcePlaintext = AppEnv.keymaps.getIsAltKeyDown();
    return AppEnv.config.get('core.composing.html') && !forcePlaintext;
  }

  async prepareBodyForQuoting(message: Message) {
    if (!this.useHTML()) {
      const content = message.plaintext
        ? message.body
        : convertToPlainText(convertFromHTML(message.body)).trim();
      return deepenPlaintextQuote(content);
    }

    const content = message.plaintext ? convertPlaintextToHTML(message.body) : message.body;

    let transformed = content || '';
    transformed = await SanitizeTransformer.run(transformed);
    transformed = await InlineStyleTransformer.run(transformed);
    return transformed;
  }

  inlineFilesForQuotedBody(message: Message) {
    if (!this.useHTML() || !message.body || !message.files || message.files.length === 0) {
      return [];
    }

    const cidRegexp = new RegExp(MessageUtils.cidRegexString, 'gi');
    const referencedContentIds = new Set<string>();
    let match = cidRegexp.exec(message.body);
    while (match !== null) {
      referencedContentIds.add(this.normalizeContentId(match[1]));
      match = cidRegexp.exec(message.body);
    }

    return message.files.filter(
      file => file.contentId && referencedContentIds.has(this.normalizeContentId(file.contentId))
    );
  }

  async createDraft(fields = {}) {
    const account = this._accountForNewDraft();
    const rich = this.useHTML();
    const defaults = {
      body: rich ? '<br/>' : '',
      subject: '',
      version: 0,
      unread: false,
      starred: false,
      headerMessageId: `${uuidv4().toUpperCase()}@getmailspring.com`,
      from: [account.defaultMe()],
      date: new Date(),
      draft: true,
      pristine: true,
      plaintext: !rich,
      accountId: account.id,
      cc: [],
      bcc: [],
    };

    const merged = Object.assign(defaults, fields);

    const autoContacts = await ContactStore.parseContactsInString(account.autoaddress.value);
    if (account.autoaddress.type === 'cc') {
      merged.cc = (merged.cc || []).concat(autoContacts);
    }
    if (account.autoaddress.type === 'bcc') {
      merged.bcc = (merged.bcc || []).concat(autoContacts);
    }
    if (merged.plaintext) {
      merged.body = wrapPlaintext(merged.body);
    }

    return new Message(merged);
  }

  async createDraftForMailto(urlString) {
    try {
      urlString = decodeURI(urlString);
    } catch (err) {
      // no-op
    }

    const match = /mailto:\/*([^?&]*)((.|\n|\r)*)/.exec(urlString);
    if (!match) {
      throw new Error(`${urlString} is not a valid mailto URL.`);
    }

    let to = match[1];
    const queryString = match[2];
    if (to.length > 0 && to.indexOf('@') === -1) {
      to = decodeURIComponent(to);
    }

    // /many/ mailto links are malformed and do things like:
    //   &body=https://github.com/atom/electron/issues?utf8=&q=is%3Aissue+is%3Aopen+123&subject=...
    //   (note the unescaped ? and & in the URL).
    //
    // To account for these scenarios, we parse the query string manually and only
    // split on params we expect to be there. (Jumping from &body= to &subject=
    // in the above example.) We only decode values when they appear to be entirely
    // URL encoded. (In the above example, decoding the body would cause the URL
    // to fall apart.)
    //
    const query: any = {};
    query.to = to;

    const querySplit = /[&|?](subject|body|cc|to|from|bcc)+\s*=/gi;

    let openKey = null;
    let openValueStart = null;
    let matched = true;

    while (matched) {
      const queryMatch = querySplit.exec(queryString);
      matched = queryMatch !== null;

      if (openKey) {
        const openValueEnd = (queryMatch && queryMatch.index) || queryString.length;
        let value = queryString.substr(openValueStart, openValueEnd - openValueStart);
        const valueIsntEscaped = value.indexOf('?') !== -1 || value.indexOf('&') !== -1;
        try {
          if (!valueIsntEscaped) {
            value = decodeURIComponent(value);
          }
        } catch (err) {
          // no-op
        }
        query[openKey] = value;
      }
      if (queryMatch) {
        openKey = queryMatch[1].toLowerCase();
        openValueStart = querySplit.lastIndex;
      }
    }
    const contacts = {};
    for (const attr of ['to', 'cc', 'bcc']) {
      if (query[attr]) {
        contacts[attr] = ContactStore.parseContactsInString(query[attr]);
      }
    }

    if (query.body && this.useHTML()) {
      query.body = query.body.replace(/[\n\r]/g, '<br/>');
    }

    return this.createDraft(Object.assign(query, await Promise.props(contacts)));
  }

  async createOrUpdateDraftForReply({
    message,
    thread,
    type,
    behavior,
  }: {
    message: Message;
    thread: Thread;
    type: ReplyType;
    behavior: ReplyBehavior;
  }) {
    if (!['reply', 'reply-all'].includes(type)) {
      throw new Error(`createOrUpdateDraftForReply called with ${type}, not reply or reply-all`);
    }

    const existingDraft = await this.candidateDraftForUpdating(message, behavior);
    if (existingDraft) {
      return this.updateDraftForReply(existingDraft, { message, type });
    }
    return this.createDraftForReply({ message, thread, type });
  }

  async createDraftForReply({ message, thread, type }) {
    const prevBody = await this.prepareBodyForQuoting(message);
    const quotedInlineFiles = this.inlineFilesForQuotedBody(message);
    quotedInlineFiles.forEach(file => Actions.fetchFile(file));
    let participants = { to: [], cc: [] };
    if (type === 'reply') {
      participants = message.participantsForReply();
    } else if (type === 'reply-all') {
      participants = message.participantsForReplyAll();
    }

    return this.createDraft({
      subject: Utils.subjectWithPrefix(message.subject, 'Re:'),
      to: participants.to,
      cc: participants.cc,
      from: [this._fromContactForReply(message)],
      threadId: thread.id,
      accountId: message.accountId,
      files: quotedInlineFiles,
      replyToHeaderMessageId: message.headerMessageId,
      body: this.useHTML()
        ? `
        <br/>
        <br/>
        <div class="gmail_quote_attribution">${DOMUtils.escapeHTMLCharacters(
          message.replyAttributionLine()
        )}</div>
        <blockquote class="gmail_quote"
          style="margin:0 0 0 .8ex;border-left:1px #ccc solid;padding-left:1ex;">
          ${prevBody}
          <br/>
        </blockquote>
        `
        : `\n\n${message.replyAttributionLine()}\n${prevBody}`,
    });
  }

  async createDraftForForward({ thread, message }) {
    // Start downloading the attachments, if they haven't been already
    message.files.forEach((f: File) => Actions.fetchFile(f));

    const formatContact = (cs: Contact[]) => {
      const text = cs.map(c => c.toString()).join(', ');
      return this.useHTML() ? DOMUtils.escapeHTMLCharacters(text) : text;
    };

    const fields = [];
    if (message.from.length > 0) fields.push(`From: ${formatContact(message.from)}`);
    fields.push(`${localized('Subject')}: ${message.subject}`);
    fields.push(`${localized('Date')}: ${message.formattedDate()}`);
    if (message.to.length > 0) fields.push(`${localized('To')}: ${formatContact(message.to)}`);
    if (message.cc.length > 0) fields.push(`${localized('Cc')}: ${formatContact(message.cc)}`);

    const body = await this.prepareBodyForQuoting(message);

    return this.createDraft({
      subject: Utils.subjectWithPrefix(message.subject, 'Fwd:'),
      from: [this._fromContactForReply(message)],
      files: message.files,
      threadId: thread.id,
      accountId: message.accountId,
      forwardedHeaderMessageId: message.headerMessageId,
      body: this.useHTML()
        ? `
        <br/>
        <div class="gmail_quote">
          <br>
          ---------- ${localized('Forwarded Message')} ---------
          <br><br>
          ${fields.join('<br>')}
          <br><br>
          ${body}
          <br/>
        </div>
        `
        : `\n\n---------- ${localized('Forwarded Message')} ---------\n\n${fields.join(
          '\n'
        )}\n\n${body}`,
    });
  }

  async createDraftForResurfacing(thread, threadMessageId, body) {
    const account = AccountStore.accountForId(thread.accountId);
    let replyToHeaderMessageId = threadMessageId;

    if (!replyToHeaderMessageId) {
      const msg = await DatabaseStore.findBy<Message>(Message, { threadId: thread.id })
        .order(Message.attributes.date.descending())
        .limit(1);
      replyToHeaderMessageId = (msg && msg.headerMessageId) || '';
    }

    return this.createDraft({
      from: [new Contact({ email: account.emailAddress, name: `${account.name} via Mailspring` })],
      to: [account.defaultMe()],
      cc: [],
      pristine: false,
      subject: thread.subject,
      threadId: thread.id,
      accountId: thread.accountId,
      replyToHeaderMessageId: replyToHeaderMessageId,
      body: body,
    });
  }

  async candidateDraftForUpdating(message: Message, behavior: ReplyBehavior) {
    if (!['prefer-existing-if-pristine', 'prefer-existing'].includes(behavior)) {
      return null;
    }

    const messages =
      message.threadId === MessageStore.threadId()
        ? MessageStore.items()
        : await DatabaseStore.findAll<Message>(Message, { threadId: message.threadId });

    const candidateDrafts = messages.filter(
      other => other.replyToHeaderMessageId === message.headerMessageId && other.draft === true
    );

    if (candidateDrafts.length === 0) {
      return null;
    }
    if (behavior === 'prefer-existing') {
      return candidateDrafts.pop();
    }
    if (behavior === 'prefer-existing-if-pristine') {
      DraftStore = DraftStore || require('./draft-store').default;
      const sessions = await Promise.all(
        candidateDrafts.map(candidateDraft =>
          DraftStore.sessionForClientId(candidateDraft.headerMessageId)
        )
      );
      return sessions.map(s => s.draft()).find(d => d && d.pristine);
    }
  }

  updateDraftForReply(draft: Message, { type, message }: { type: ReplyType; message: Message }) {
    if (!(message && draft)) {
      throw new Error('updateDraftForReply: Expected message and existing draft.');
    }

    const updated: { to: Contact[]; cc: Contact[] } = { to: [...draft.to], cc: [...draft.cc] };
    const replySet = message.participantsForReply();
    const replyAllSet = message.participantsForReplyAll();
    let targetSet = null;

    if (type === 'reply') {
      targetSet = replySet;

      // Remove participants present in the reply-all set and not the reply set
      for (const key of ['to', 'cc']) {
        updated[key] = _.reject<Contact[]>(updated[key], contact => {
          const inReplySet = _.findWhere(replySet[key], { email: contact.email });
          const inReplyAllSet = _.findWhere(replyAllSet[key], { email: contact.email });
          return inReplyAllSet && !inReplySet;
        });
      }
    } else {
      // Add participants present in the reply-all set and not on the draft
      // Switching to reply-all shouldn't really ever remove anyone.
      targetSet = replyAllSet;
    }

    for (const key of ['to', 'cc']) {
      for (const contact of targetSet[key]) {
        if (!_.findWhere(updated[key], { email: contact.email })) {
          updated[key].push(contact);
        }
      }
    }

    draft.to = updated.to;
    draft.cc = updated.cc;
    return draft;
  }

  _fromContactForReply(message) {
    const account = AccountStore.accountForId(message.accountId);
    const defaultMe = account.defaultMe();

    let result = defaultMe;

    for (const aliasString of account.aliases) {
      const alias = account.meUsingAlias(aliasString);
      for (const recipient of [...message.to, ...message.cc]) {
        const emailIsNotDefault = alias.email !== defaultMe.email;
        const emailsMatch = recipient.email === alias.email;
        const nameIsNotDefault = alias.name !== defaultMe.name;
        const namesMatch = recipient.name === alias.name;

        // No better match is possible
        if (emailsMatch && emailIsNotDefault && namesMatch && nameIsNotDefault) {
          return alias;
        }

        // A better match is possible. eg: the user may have two aliases with the same
        // email but different phrases, and we'll get an exact match on the other one.
        // Continue iterating and wait to see.
        if ((emailsMatch && emailIsNotDefault) || (namesMatch && nameIsNotDefault)) {
          result = alias;
        }
      }
    }
    return result;
  }

  _accountForNewDraft() {
    const defAccountId = AppEnv.config.get('core.sending.defaultAccountIdForSend');
    const account = AccountStore.accountForId(defAccountId);
    if (account) {
      return account;
    }
    const focusedAccountId = FocusedPerspectiveStore.current().accountIds[0];
    if (focusedAccountId) {
      return AccountStore.accountForId(focusedAccountId);
    }
    return AccountStore.accounts()[0];
  }
}

export default new DraftFactory();
