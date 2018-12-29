import _ from 'underscore';
import Actions from '../actions';
import DatabaseStore from './database-store';
import AccountStore from './account-store';
import ContactStore from './contact-store';
import MessageStore from './message-store';
import FocusedPerspectiveStore from './focused-perspective-store';
import uuid from 'uuid';

import Contact from '../models/contact';
import Message from '../models/message';
import MessageUtils from '../models/message-utils';
import Utils from '../models/utils';
import InlineStyleTransformer from '../../services/inline-style-transformer';
import SanitizeTransformer from '../../services/sanitize-transformer';
import DOMUtils from '../../dom-utils';

let DraftStore = null;

async function prepareBodyForQuoting(body) {
  // TODO: Fix inline images
  const cidRE = MessageUtils.cidRegexString;

  // Be sure to match over multiple lines with [\s\S]*
  // Regex explanation here: https://regex101.com/r/vO6eN2/1
  let transformed = (body || '').replace(new RegExp(`<img.*${cidRE}[\\s\\S]*?>`, 'igm'), '');
  transformed = await SanitizeTransformer.run(transformed, SanitizeTransformer.Preset.UnsafeOnly);
  transformed = await InlineStyleTransformer.run(transformed);
  return transformed;
}

class DraftFactory {
  async createDraft(fields = {}) {
    const account = this._accountForNewDraft();
    // const uniqueId = `${Math.floor(Date.now() / 1000)}.${Utils.generateTempId()}`;
    const uniqueId = uuid();
    const defaults = {
      body: '<br/>',
      subject: '',
      version: 0,
      unread: false,
      starred: false,
      headerMessageId: `${uniqueId}@edison.tech`,
      from: [account.defaultMe()],
      date: new Date(),
      draft: true,
      pristine: true,
      accountId: account.id,
    };

    const merged = Object.assign(defaults, fields);

    const autoContacts = await ContactStore.parseContactsInString(account.autoaddress.value);
    if (account.autoaddress.type === 'cc') {
      merged.cc = (merged.cc || []).concat(autoContacts);
    }
    if (account.autoaddress.type === 'bcc') {
      merged.bcc = (merged.bcc || []).concat(autoContacts);
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
    const query = {};
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

    if (query.body) {
      query.body = query.body.replace(/[\n\r]/g, '<br/>');
    }

    return this.createDraft(Object.assign(query, await Promise.props(contacts)));
  }

  async createOrUpdateDraftForReply({ message, thread, type, behavior }) {
    if (!['reply', 'reply-all'].includes(type)) {
      throw new Error(`createOrUpdateDraftForReply called with ${type}, not reply or reply-all`);
    }

    const existingDraft = await this.candidateDraftForUpdating(message, behavior);
    if (existingDraft) {
      return this.updateDraftForReply(existingDraft, { message, thread, type });
    }
    return this.createDraftForReply({ message, thread, type });
  }

  async createDraftForReply({ message, thread, type }) {
    const prevBody = await prepareBodyForQuoting(message.body);
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
      replyToHeaderMessageId: message.headerMessageId,
      body: `
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
        `,
    });
  }

  async createDraftForForward({ thread, message }) {
    // Start downloading the attachments, if they haven't been already
    message.files.forEach(f => Actions.fetchFile(f));

    const contactsAsHtml = cs => DOMUtils.escapeHTMLCharacters(_.invoke(cs, 'toString').join(', '));
    const fields = [];
    if (message.from.length > 0) fields.push(`From: ${contactsAsHtml(message.from)}`);
    fields.push(`Subject: ${message.subject}`);
    fields.push(`Date: ${message.formattedDate()}`);
    if (message.to.length > 0) fields.push(`To: ${contactsAsHtml(message.to)}`);
    if (message.cc.length > 0) fields.push(`Cc: ${contactsAsHtml(message.cc)}`);

    const body = await prepareBodyForQuoting(message.body);

    return this.createDraft({
      subject: Utils.subjectWithPrefix(message.subject, 'Fwd:'),
      from: [this._fromContactForReply(message)],
      files: message.files,
      threadId: thread.id,
      accountId: message.accountId,
      forwardedHeaderMessageId: message.headerMessageId,
      body: `
        <br/>
        <div class="gmail_quote">
          <br>
          ---------- Forwarded message ---------
          <br><br>
          ${fields.join('<br>')}
          <br><br>
          ${body}
          <br/>
        </div>
        `,
    });
  }

  async createDraftForResurfacing(thread, threadMessageId, body) {
    const account = AccountStore.accountForId(thread.accountId);
    let replyToHeaderMessageId = threadMessageId;

    if (!replyToHeaderMessageId) {
      const msg = await DatabaseStore.findBy(Message, {
        accountId: thread.accountId,
        threadId: thread.id,
      })
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

  async candidateDraftForUpdating(message, behavior) {
    if (!['prefer-existing-if-pristine', 'prefer-existing'].includes(behavior)) {
      return null;
    }

    const messages =
      message.threadId === MessageStore.threadId()
        ? MessageStore.items()
        : await DatabaseStore.findAll(Message, { threadId: message.threadId });

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
      for (const session of sessions) {
        if (session.draft().pristine) {
          return session.draft();
        }
      }
      return null;
    }
  }

  updateDraftForReply(draft, { type, message }) {
    if (!(message && draft)) {
      throw new Error('updateDraftForReply: Expected message and existing draft.');
    }

    const updated = { to: [].concat(draft.to), cc: [].concat(draft.cc) };
    const replySet = message.participantsForReply();
    const replyAllSet = message.participantsForReplyAll();
    let targetSet = null;

    if (type === 'reply') {
      targetSet = replySet;

      // Remove participants present in the reply-all set and not the reply set
      for (const key of ['to', 'cc']) {
        updated[key] = _.reject(updated[key], contact => {
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
      for (const recipient of [].concat(message.to, message.cc)) {
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
