import MailspringStore from 'mailspring-store';
import { Editor } from 'slate';

import { Conversion } from '../../components/composer-editor/composer-support';
import RegExpUtils from '../../regexp-utils';
import { localized } from '../../intl';

import TaskQueue from './task-queue';
import { Message } from '../models/message';
import * as Utils from '../models/utils';
import * as Actions from '../actions';
import ContactStore from './contact-store';
import DatabaseStore from './database-store';
import { AccountStore } from './account-store';
import { DraftChangeSet } from './draft-change-set';
import { DestroyDraftTask } from '../tasks/destroy-draft-task';
import { Composer as ComposerExtensionRegistry } from '../../registries/extension-registry';
import QuotedHTMLTransformer from '../../services/quoted-html-transformer';
import { SyncbackDraftTask } from '../tasks/syncback-draft-task';

export type MessageWithEditorState = Message & { bodyEditorState: any };

const { convertFromHTML, convertToHTML } = Conversion;
const MetadataChangePrefix = 'metadata.';
let DraftStore = null;

function hotwireDraftBodyState(draft: any, session: DraftEditingSession): MessageWithEditorState {
  // Populate the bodyEditorState and override the draft properties
  // so that they're kept in sync with minimal recomputation.
  let _bodyHTMLValue = draft.body;
  let _bodyEditorValue = null;

  draft.__bodyPropDescriptor = {
    configurable: true,
    get: function() {
      if (_bodyHTMLValue === null) {
        _bodyHTMLValue = convertToHTML(_bodyEditorValue);
      }
      return _bodyHTMLValue;
    },
    set: function(inHTML) {
      if (_bodyHTMLValue === inHTML) return;

      _bodyHTMLValue = inHTML;

      if (session._mountedEditor) {
        // compute it now and apply it, preserving the document history
        _bodyEditorValue = session._mountedEditor
          .moveToRangeOfDocument()
          .delete()
          .insertFragment(convertFromHTML(inHTML).document)
          .moveToRangeOfDocument()
          .moveToStart().value;

        // occasionally inserting the new document adds a new line at the beginning of the value.
        // It's unclaer why this happens...
        const firstBlock = _bodyEditorValue.document.getBlocks().first();
        if (firstBlock.text === '') {
          _bodyEditorValue = session._mountedEditor.removeNodeByKey(firstBlock.key).value;
        }
      } else {
        // compute it again when it's asked for
        _bodyEditorValue = null;
      }
    },
  };

  draft.__bodyEditorValuePropDescriptor = {
    configurable: true,
    get: function() {
      if (_bodyEditorValue === null) {
        _bodyEditorValue = convertFromHTML(_bodyHTMLValue);
      }
      return _bodyEditorValue;
    },
    set: function(inValue) {
      if (_bodyEditorValue === inValue) return;
      _bodyHTMLValue = null;
      _bodyEditorValue = inValue;
    },
  };

  Object.defineProperty(draft, 'body', draft.__bodyPropDescriptor);
  Object.defineProperty(draft, 'bodyEditorState', draft.__bodyEditorValuePropDescriptor);
  draft.body = _bodyHTMLValue;

  return draft as MessageWithEditorState;
}

/**
 * Note: This method is intended to return a new Mesasge object so that lazy people doing
 * shallow equals get the correct basic behavior as the draft is modified in the session.
 *
 * However, this method does not deep clone array values (To:, etc.) and the hot-wired body
 * and bodyEditorValue are linked through the same internal state. Changing the body of
 * the cloned draft changes the body of the old draft too.
 *
 * At the moment these tradeoffs seem OK because we're really just trying to make
 * "props.draft !== nextProps.draft" work.
 */
function fastCloneDraft(draft: MessageWithEditorState) {
  const next = new Message({});
  for (const key of Object.getOwnPropertyNames(draft)) {
    if (key === 'body' || key === 'bodyEditorState') continue;
    next[key] = draft[key];
  }
  Object.defineProperty(next, 'body', (next as any).__bodyPropDescriptor);
  Object.defineProperty(next, 'bodyEditorState', (next as any).__bodyEditorValuePropDescriptor);
  return next as MessageWithEditorState;
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
export class DraftEditingSession extends MailspringStore {
  static DraftChangeSet = DraftChangeSet;

  _draft: MessageWithEditorState = null;
  _draftPromise: Promise<Message> = null;
  _destroyed: boolean = false;
  _mountedEditor: Editor | null = null;

  headerMessageId: string;
  changes = new DraftChangeSet({
    onAddChanges: changes => this.changeSetApplyChanges(changes),
    onCommit: () => this.changeSetCommit(), // for specs
  });

  constructor(headerMessageId: string, draft: Message = null) {
    super();

    this.headerMessageId = headerMessageId;

    DraftStore = DraftStore || require('./draft-store').default;
    this.listenTo(DraftStore, this._onDraftChanged);

    this._mountedEditor = null;

    if (draft && draft.body !== undefined) {
      this._draftPromise = Promise.resolve(draft);
      this._draft = hotwireDraftBodyState(draft, this);
    } else {
      this._draftPromise = DatabaseStore.findBy<Message>(Message, {
        headerMessageId: this.headerMessageId,
        draft: true,
      })
        .include(Message.attributes.body)
        .then(draft => {
          if (this._destroyed) {
            console.warn(`Draft loaded but session has been torn down.`);
            return;
          }
          if (!draft) {
            console.warn(`Draft ${this.headerMessageId} could not be found. Just deleted?`);
            return;
          }
          this._draft = hotwireDraftBodyState(draft, this);
          this.trigger();
          return draft;
        });
    }
  }

  // Public: Returns the draft object with the latest changes applied.
  //
  draft() {
    return this._draft;
  }

  prepare() {
    return this._draftPromise;
  }

  teardown() {
    this.stopListeningToAll();
    this.changes.clearDelayedCommit();
    this._destroyed = true;
    this._mountedEditor = null;
  }

  setMountedEditor(editor: Editor | null) {
    this._mountedEditor = editor;
  }

  validateDraftForSending() {
    const warnings = [];
    const errors = [];
    const allRecipients = [...this._draft.to, ...this._draft.cc, ...this._draft.bcc];
    const hasAttachment = this._draft.files && this._draft.files.length > 0;

    const allNames = [...Utils.commonlyCapitalizedSalutations];
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
        allNames.push(...name.toLowerCase().split('-')); // anne-marie => anne, marie
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
      errors.push(
        localized('You need to provide one or more recipients before sending the message.')
      );
    }

    if (errors.length > 0) {
      return { errors, warnings };
    }

    if (this._draft.subject.length === 0) {
      warnings.push(localized('The subject field is blank.'));
    }

    let cleaned = QuotedHTMLTransformer.removeQuotedHTML(this._draft.body.trim());
    const sigIndex = cleaned.search(RegExpUtils.mailspringSignatureRegex());
    cleaned = sigIndex > -1 ? cleaned.substr(0, sigIndex) : cleaned;

    const signatureIndex = cleaned.indexOf('<signature>');
    if (signatureIndex !== -1) {
      cleaned = cleaned.substr(0, signatureIndex - 1);
    }

    if (cleaned.toLowerCase().includes('attach') && !hasAttachment) {
      warnings.push(localized('The message mentions an attachment but none are attached.'));
    }

    if (!unnamedRecipientPresent) {
      // https://www.regexpal.com/?fam=99334
      // note: requires that the name is capitalized, to avoid catching "Hey guys"
      const englishSalutationPhrases = /(?:[y|Y]o|[h|H]ey|[h|H]i|[M|m]orning|[A|a]fternoon|[E|e]vening|[D|d]ear){1} ([A-Z][A-Za-zÀ-ÿ. -]+)[!_—,.\n\r< ]/;
      const match = englishSalutationPhrases.exec(cleaned);
      if (match) {
        let salutation = (match[1] || '').toLowerCase();
        if (salutation.endsWith('-')) salutation = salutation.substr(0, salutation.length - 1);

        if (!allNames.find(n => n === salutation || (n.length > 1 && salutation.includes(n)))) {
          warnings.push(
            localized(
              `The message is addressed to a name that doesn't appear to be a recipient ("%@")`,
              match[1]
            )
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

      const destroy =
        draft.id &&
        new DestroyDraftTask({
          messageIds: [draft.id],
          accountId: draft.accountId,
        });

      Actions.queueTask(create);
      await TaskQueue.waitForPerformLocal(create);
      if (destroy) Actions.queueTask(destroy);
    }

    return this;
  }

  _onDraftChanged = change => {
    if (change === undefined || change.type !== 'persist') {
      return;
    }
    if (!this._draft) {
      // We don't accept changes unless our draft object is loaded
      return;
    }

    // Some change events just tell us that the state of the draft (eg sending state)
    // have changed and don't include a payload.
    if (change.headerMessageId) {
      if (change.headerMessageId === this._draft.headerMessageId) {
        this.trigger();
      }
      return;
    }

    const nextDraft = change.objects
      .filter(obj => obj.headerMessageId === this._draft.headerMessageId)
      .pop();

    if (!nextDraft) {
      return;
    }

    // If the session has unsaved changes for a given field (eg: 'to' or 'body'),
    // we don't accept changes from the database. All changes to the draft should
    // be made through the editing session and we don't want to overwrite the user's
    // work under any scenario.
    const lockedFields = this.changes.dirtyFields();
    let changed = false;
    for (const [key] of Object.entries(Message.attributes)) {
      if (key === 'headerMessageId') continue;
      if (nextDraft[key] === undefined) continue;
      if (lockedFields.includes(key)) continue;
      if (this._draft[key] === nextDraft[key]) continue;

      if (changed === false) {
        this._draft = fastCloneDraft(this._draft);
        changed = true;
      }
      this._draft[key] = nextDraft[key];
    }

    if (changed) {
      this.trigger();
    }
  };

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

    this._draft = fastCloneDraft(this._draft);

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
