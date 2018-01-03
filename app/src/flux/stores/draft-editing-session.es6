import _ from 'underscore';
import EventEmitter from 'events';
import MailspringStore from 'mailspring-store';

import { EditorState, SelectionState } from 'draft-js';

// TODO BEN
import {
  convertFromHTML,
  convertToHTML,
} from '../../../internal_packages/composer/lib/draftjs-config';

import { selectEndOfReply } from '../../../internal_packages/composer/lib/quoted-text-plugin';

import TaskQueue from './task-queue';
import Message from '../models/message';
import Utils from '../models/utils';
import Actions from '../actions';
import AccountStore from './account-store';
import ContactStore from './contact-store';
import DatabaseStore from './database-store';
import { Composer as ComposerExtensionRegistry } from '../../registries/extension-registry';
import QuotedHTMLTransformer from '../../services/quoted-html-transformer';
import SyncbackDraftTask from '../tasks/syncback-draft-task';
import DestroyDraftTask from '../tasks/destroy-draft-task';

const MetadataChangePrefix = 'metadata.';
let DraftStore = null;

/**
Public: As the user interacts with the draft, changes are accumulated in the
DraftChangeSet associated with the store session.

Section: Drafts
*/
class DraftChangeSet extends EventEmitter {
  constructor(callbacks) {
    super();
    this.callbacks = callbacks;
    this._timer = null;
  }

  teardown() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }

  add(changes, { doesNotAffectPristine } = {}) {
    if (!doesNotAffectPristine) {
      changes.pristine = false;
    }
    this.callbacks.onAddChanges(changes);

    if (this._timer) clearTimeout(this._timer);
    this._timer = setTimeout(() => this.commit(), 10000);
  }

  addPluginMetadata(pluginId, metadata) {
    const changes = {};
    changes[`${MetadataChangePrefix}${pluginId}`] = metadata;
    this.add(changes, { doesNotAffectPristine: true });
  }

  async commit() {
    if (this._timer) clearTimeout(this._timer);
    await this.callbacks.onCommit();
  }
}

/**
Public: DraftEditingSession is a small class that makes it easy to implement components
that display Draft objects or allow for interactive editing of Drafts.

1. It synchronously provides an instance of a draft via `draft()`, and
   triggers whenever that draft instance has changed.

2. It provides an interface for modifying the draft that transparently
   batches changes, and ensures that the draft provided via `draft()`
   always has pending changes applied.

Section: Drafts
*/
export default class DraftEditingSession extends MailspringStore {
  static DraftChangeSet = DraftChangeSet;

  constructor(headerMessageId, draft = null) {
    super();

    DraftStore = DraftStore || require('./draft-store').default; // eslint-disable-line
    this.listenTo(DraftStore, this._onDraftChanged);

    this.headerMessageId = headerMessageId;
    this._draft = false;
    this._destroyed = false;

    this.changes = new DraftChangeSet({
      onAddChanges: changes => this.changeSetApplyChanges(changes),
      onCommit: () => this.changeSetCommit(), // for specs
    });

    if (draft) {
      this._draftPromise = this._setDraft(draft);
    }

    this.prepare();
  }

  // Public: Returns the draft object with the latest changes applied.
  //
  draft() {
    return this._draft;
  }

  prepare() {
    this._draftPromise =
      this._draftPromise ||
      DatabaseStore.findBy(Message, { headerMessageId: this.headerMessageId, draft: true })
        .include(Message.attributes.body)
        .then(async draft => {
          if (this._destroyed) {
            throw new Error('Draft has been destroyed.');
          }
          if (!draft) {
            throw new Error(`Assertion Failure: Draft ${this.headerMessageId} not found.`);
          }
          return await this._setDraft(draft);
        });
    return this._draftPromise;
  }

  teardown() {
    this.stopListeningToAll();
    this.changes.teardown();
    this._destroyed = true;
  }

  validateDraftForSending() {
    const warnings = [];
    const errors = [];
    const allRecipients = [].concat(this._draft.to, this._draft.cc, this._draft.bcc);
    const hasAttachment = this._draft.files && this._draft.files.length > 0;

    const allNames = [].concat(Utils.commonlyCapitalizedSalutations);
    let unnamedRecipientPresent = false;

    for (const contact of allRecipients) {
      if (!ContactStore.isValidContact(contact)) {
        errors.push(
          `${contact.email} is not a valid email address - please remove or edit it before sending.`
        );
      }
      const name = contact.fullName();
      if (name && name.length && name !== contact.email) {
        allNames.push(name.toLowerCase()); // ben gotow
        allNames.push(...name.toLowerCase().split(' ')); // ben, gotow
        allNames.push(contact.nameAbbreviation().toLowerCase()); // bg
        allNames.push(name.toLowerCase()[0]); // b
      } else {
        unnamedRecipientPresent = true;
      }
      if (Utils.likelyNonHumanEmail(contact.email)) {
        unnamedRecipientPresent = true;
      }
    }

    if (allRecipients.length === 0) {
      errors.push('You need to provide one or more recipients before sending the message.');
    }

    if (errors.length > 0) {
      return { errors, warnings };
    }

    if (this._draft.subject.length === 0) {
      warnings.push('without a subject line');
    }

    let cleaned = QuotedHTMLTransformer.removeQuotedHTML(this._draft.body.trim());
    const signatureIndex = cleaned.indexOf('<signature>');
    if (signatureIndex !== -1) {
      cleaned = cleaned.substr(0, signatureIndex - 1);
    }

    if (cleaned.toLowerCase().includes('attach') && !hasAttachment) {
      warnings.push('without an attachment');
    }

    if (!unnamedRecipientPresent) {
      // https://www.regexpal.com/?fam=99334
      // note: requires that the name is capitalized, to avoid catching "Hey guys"
      const englishSalutationPhrases = /(?:[y|Y]o|[h|H]ey|[h|H]i|[M|m]orning|[A|a]fternoon|[E|e]vening|[D|d]ear){1} ([A-Z][A-Za-zÀ-ÿ. ]+)[!_—,.\n\r< -]/;
      const match = englishSalutationPhrases.exec(cleaned);
      if (match) {
        const salutation = (match[1] || '').toLowerCase();
        if (!allNames.find(n => n === salutation || (n.length > 1 && salutation.includes(n)))) {
          warnings.push(
            `addressed to a name that doesn't appear to be a recipient ("${salutation}")`
          );
        }
      }
    }

    // Check third party warnings added via Composer extensions
    for (const extension of ComposerExtensionRegistry.extensions()) {
      if (!extension.warningsForSending) {
        continue;
      }
      warnings.push(...extension.warningsForSending({ draft: this._draft }));
    }

    return { errors, warnings };
  }

  // This function makes sure the draft is attached to a valid account, and changes
  // it's accountId if the from address does not match the account for the from
  // address.
  //
  async ensureCorrectAccount() {
    const draft = this.draft();
    const account = AccountStore.accountForEmail(draft.from[0].email);
    if (!account) {
      throw new Error(
        'DraftEditingSession::ensureCorrectAccount - you can only send drafts from a configured account.'
      );
    }

    if (account.id !== draft.accountId) {
      // Create a new draft in the new account (with a new ID).
      // Because we use the headerMessageId /exclusively/ as the
      // identifier we'll be fine.
      //
      // Then destroy the old one, since it may be synced to the server
      // and require cleanup!
      //
      const create = new SyncbackDraftTask({
        headerMessageId: draft.headerMessageId,
        draft: new Message({
          from: draft.from,
          version: 0,
          to: draft.to,
          cc: draft.cc,
          bcc: draft.bcc,
          body: draft.body,
          files: draft.files,
          replyTo: draft.replyTo,
          subject: draft.subject,
          headerMessageId: draft.headerMessageId,
          accountId: account.id,
          unread: false,
          starred: false,
          draft: true,
        }),
      });

      const destroy = new DestroyDraftTask({
        messageIds: [draft.id],
        accountId: draft.accountId,
      });

      Actions.queueTask(create);
      await TaskQueue.waitForPerformLocal(create);
      Actions.queueTask(destroy);
    }

    return this;
  }

  async _setDraft(draft) {
    if (draft.body === undefined) {
      throw new Error('DraftEditingSession._setDraft - new draft has no body!');
    }

    // Populate the bodyEditorState and override the draft properties
    // so that they're kept in sync with minimal recomputation
    let _bodyHTMLCache = draft.body;
    let _bodyHTMLCacheContentState = null;
    let _bodyEditorState = null;

    Object.defineProperty(draft, 'body', {
      get: function() {
        if (!_bodyHTMLCache) {
          console.log('building HTML body cache');
          _bodyHTMLCacheContentState = _bodyEditorState.getCurrentContent();
          _bodyHTMLCache = convertToHTML(_bodyHTMLCacheContentState);
        }
        return _bodyHTMLCache;
      },
      set: function(inHTML) {
        const contentState = convertFromHTML(inHTML);
        let editorState = selectEndOfReply(EditorState.createWithContent(contentState));

        if (draft.bodyEditorState) {
          // preserve undo redo by rebasing the content onto the existing object
          editorState = EditorState.set(editorState, {
            undoStack: draft.bodyEditorState.getUndoStack(),
            redoStack: draft.bodyEditorState.getRedoStack(),
          });
        }
        draft.bodyEditorState = editorState;
        _bodyHTMLCacheContentState = contentState;
        _bodyHTMLCache = inHTML;
      },
    });
    Object.defineProperty(draft, 'bodyEditorState', {
      get: function() {
        return _bodyEditorState;
      },
      set: function(next) {
        if (_bodyHTMLCacheContentState !== next.getCurrentContent()) {
          _bodyHTMLCache = null;
        }
        _bodyEditorState = next;
      },
    });

    draft.body = _bodyHTMLCache;
    this._draft = draft;

    this.trigger();
    return this;
  }

  _onDraftChanged = change => {
    if (change === undefined || change.type !== 'persist') {
      return;
    }

    // We don't accept changes unless our draft object is loaded
    if (!this._draft) {
      return;
    }

    // Some change events just tell us that the state of the draft (eg sending state)
    // have changed and don't include a payload.
    if (change.headerMessageId) {
      if (change.headerMessageId === this.draft.headerMessageId) {
        this.trigger();
      }
      return;
    }

    // If our draft has been changed, only accept values which are present.
    // If `body` is undefined, assume it's not loaded. Do not overwrite old body.
    const nextDraft = change.objects
      .filter(obj => obj.headerMessageId === this._draft.headerMessageId)
      .pop();

    if (!nextDraft) {
      return;
    }

    this._incorporateExternalDraftChanges(nextDraft);
  };

  _incorporateExternalDraftChanges(nextDraft) {
    let changed = false;
    for (const [key] of Object.entries(Message.attributes)) {
      if (key === 'headerMessageId') continue;
      if (nextDraft[key] === undefined) continue;
      if (this._draft[key] !== nextDraft[key]) {
        this._draft[key] = nextDraft[key];
        changed = true;
      }
    }
    if (changed) {
      this.trigger();
    }
  }

  async changeSetCommit() {
    if (this._destroyed || !this._draft) {
      return;
    }

    const task = new SyncbackDraftTask({ draft: this._draft });
    Actions.queueTask(task);
    await TaskQueue.waitForPerformLocal(task);
  }

  changeSetApplyChanges = changes => {
    if (this._destroyed) {
      return;
    }
    if (!this._draft) {
      throw new Error('DraftChangeSet was modified before the draft was prepared.');
    }
    for (const [key, val] of Object.entries(changes)) {
      if (key.startsWith(MetadataChangePrefix)) {
        this._draft.directlyAttachMetadata(key.split(MetadataChangePrefix).pop(), val);
      } else {
        this._draft[key] = val;
      }
    }
    this.trigger();
  };
}
