import EventEmitter from 'events';
import MailspringStore from 'mailspring-store';
import { Conversion } from '../../components/composer-editor/composer-support';
import RegExpUtils from '../../regexp-utils';

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
import uuid from 'uuid';
import { ipcRenderer } from 'electron';

const { convertFromHTML, convertToHTML } = Conversion;
const MetadataChangePrefix = 'metadata.';
let DraftStore = null;

/**
 Public: As the user interacts with the draft, changes are accumulated in the
 DraftChangeSet associated with the store session.

 This class used to be more complex - now it's mostly a holdover from when
 we implemented undo/redo manually and just functions as a pass-through.

 Section: Drafts
 */
const SaveAfterIdleMSec = 10000;
const SaveAfterIdleSlushMSec = 2000;

class DraftChangeSet extends EventEmitter {
  constructor(callbacks) {
    super();
    this.callbacks = callbacks;
    this._timer = null;
    this._timerTime = null;
    this._lastModifiedTimes = {};
    this._lastCommitTime = 0;
    this._lastUploadTime = 0;
  }

  cancelCommit() {
    // console.log('cancel commits');
    if (this._timer) {
      clearTimeout(this._timer);
      this._timerStarted = null;
      this._timer = null;
    } else {
      console.log('no timer');
    }
  }

  add(changes, { skipSaving = false } = {}) {
    if (!skipSaving) {
      changes.pristine = false;
      changes.needUpload = true;
      // update the per-attribute flags that track our dirty state
      for (const key of Object.keys(changes)) this._lastModifiedTimes[key] = Date.now();
      if (changes.bodyEditorState) this._lastModifiedTimes.body = Date.now();
      if (changes.body) this._lastModifiedTimes.bodyEditorState = Date.now();
      this.debounceCommit();
    }

    this.callbacks.onAddChanges(changes);
  }

  addPluginMetadata(pluginId, metadata) {
    this._lastModifiedTimes.pluginMetadata = Date.now();
    this.callbacks.onAddChanges({ [`${MetadataChangePrefix}${pluginId}`]: metadata });
    this.debounceCommit();
  }

  isDirty() {
    return this.dirtyFields().length > 0;
  }

  dirtyFields() {
    return Object.keys(this._lastModifiedTimes).filter(
      key => this._lastModifiedTimes[key] > this._lastCommitTime,
    );
  }

  debounceCommit() {
    const now = Date.now();

    // If there's already a timer going and we started it recently,
    // it means it'll fire a bit early but that's ok. It's actually
    // pretty expensive to re-create a timer on every keystroke.
    if (this._timer && now - this._timerStarted < SaveAfterIdleSlushMSec) {
      return;
    }
    this.cancelCommit();
    this._timerStarted = now;
    this._timer = setTimeout(() => this.commit(), SaveAfterIdleMSec);
  }

  async commit(arg) {
    if (this.dirtyFields().length === 0) {
      return;
    }
    if (this._timer) clearTimeout(this._timer);
    await this.callbacks.onCommit(arg);
    this._lastCommitTime = Date.now();
    this._lastModifiedTimes = {};
  }
}

function hotwireDraftBodyState(draft) {
  // Populate the bodyEditorState and override the draft properties
  // so that they're kept in sync with minimal recomputation
  // DC-107 work around when draft doesn't have body
  let _bodyHTMLCache = draft.body || '';
  let _bodyEditorState = null;

  draft.__bodyPropDescriptor = {
    configurable: true,
    get: function() {
      if (!_bodyHTMLCache) {
        console.log('building HTML body cache');
        _bodyHTMLCache = convertToHTML(_bodyEditorState);
      }
      return _bodyHTMLCache;
    },
    set: function(inHTML) {
      let nextValue = convertFromHTML(inHTML);
      if (draft.bodyEditorState) {
        nextValue = draft.bodyEditorState
          .change()
          .selectAll()
          .delete()
          .insertFragment(nextValue.document)
          .selectAll()
          .collapseToStart().value;
      }
      draft.bodyEditorState = nextValue;
      _bodyHTMLCache = inHTML;
    },
  };

  draft.__bodyEditorStatePropDescriptor = {
    configurable: true,
    get: function() {
      return _bodyEditorState;
    },
    set: function(next) {
      if (_bodyEditorState !== next) {
        _bodyHTMLCache = null;
      }
      _bodyEditorState = next;
    },
  };

  Object.defineProperty(draft, 'body', draft.__bodyPropDescriptor);
  Object.defineProperty(draft, 'bodyEditorState', draft.__bodyEditorStatePropDescriptor);
  draft.body = _bodyHTMLCache;
}

function fastCloneDraft(draft) {
  const next = new Message();
  for (const key of Object.getOwnPropertyNames(draft)) {
    if (key === 'body' || key === 'bodyEditorState') {
      continue;
    }
    next[key] = draft[key];
  }
  Object.defineProperty(next, 'body', next.__bodyPropDescriptor);
  Object.defineProperty(next, 'bodyEditorState', next.__bodyEditorStatePropDescriptor);
  return next;
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

  constructor(headerMessageId, draft = null, popout = false) {
    super();
    this._draft = false;
    this._destroyed = false;
    this._popedOut = popout;
    this._popOutOrigin = {};
    this._inView = true;
    if (AppEnv.isMainWindow()) {
      this._currentWindowLevel = 1;
    } else if (AppEnv.isThreadWindow()) {
      this._currentWindowLevel = 2;
    } else if (AppEnv.isComposerWindow()) {
      this._currentWindowLevel = 3;
    }

    this.headerMessageId = headerMessageId;
    this.changes = new DraftChangeSet({
      onAddChanges: changes => this.changeSetApplyChanges(changes),
      onCommit: (arg) => this.changeSetCommit(arg), // for specs
    });

    DraftStore = DraftStore || require('./draft-store').default;
    this.listenTo(DraftStore, this._onDraftChanged);
    ipcRenderer.on('draft-arp-reply', this._onDraftARPReply);
    ipcRenderer.on('draft-close-window', this._onDraftCloseWindow);
    ipcRenderer.on('new-window', this._onDraftNewWindow);
    ipcRenderer.on('draft-delete', this._onDraftDelete);

    if (draft) {
      hotwireDraftBodyState(draft);
      this._draft = draft;
      this._draftPromise = Promise.resolve(draft);
    } else {
      this._draftPromise = DraftStore.findByHeaderMessageIdWithBody({
        headerMessageId: this.headerMessageId,
      }).limit(1)
        .then(draft => {
          if (this._destroyed) {
            console.warn(`Draft loaded but session has been torn down.`);
            return;
          }
          if (!draft) {
            console.warn(`Draft ${this.headerMessageId} could not be found. Just deleted?`);
            return;
          }
          if (!draft.body) {
            draft.waitingForBody = true;
            Actions.fetchBodies([draft]);
          }
          hotwireDraftBodyState(draft);
          if (draft.remoteUID) {
            draft.setOrigin(Message.EditExistingDraft);
          }
          this._draft = draft;
          this._threadId = draft.threadId;
          // console.log(`sending out draft-arp @ windowLevel ${this._currentWindowLevel}`);
          ipcRenderer.send('draft-arp', {
            headerMessageId: this.headerMessageId,
            referenceMessageId: draft.referenceMessageId,
            threadId: draft.threadId,
            windowLevel: this._currentWindowLevel,
          });
          this.trigger(); // will this cause a race condition between draft arp and trigger?
        });
    }
  }

  // Public: Returns the draft object with the latest changes applied.
  //
  draft() {
    return this._draft;
  }

  threadId() {
    return this._threadId;
  }

  prepare() {
    return this._draftPromise;
  }

  isPopout() {
    return this._popedOut;
  }

  setPopout(val) {
    if (val !== this._popedOut) {
      if (this.changes) {
        this.changes.cancelCommit();
      }
      this._popedOut = val;
      this.trigger();
    }
  }

  teardown() {
    this._destroyed = true;
    this._removeListeners();
  }

  freezeSession() {
    this._removeListeners();
  }

  resumeSession() {
    this._registerListeners();
  }

  _registerListeners = () => {
    DraftStore = DraftStore || require('./draft-store').default;
    this.listenTo(DraftStore, this._onDraftChanged);
    ipcRenderer.on('draft-arp-reply', this._onDraftARPReply);
    ipcRenderer.on('draft-close-window', this._onDraftCloseWindow);
    ipcRenderer.on('new-window', this._onDraftNewWindow);
    ipcRenderer.on('draft-delete', this._onDraftDelete);
  };
  _removeListeners = () => {
    this.stopListeningToAll();
    this.changes.cancelCommit();
    ipcRenderer.removeListener('new-window', this._onDraftNewWindow);
    ipcRenderer.removeListener('draft-close-window', this._onDraftCloseWindow);
    ipcRenderer.removeListener('draft-arp-reply', this._onDraftARPReply);
    ipcRenderer.removeListener('draft-delete', this._onDraftDelete);
  };

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
          `${contact.email} is not a valid email address - please remove or edit it before sending.`,
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
    const sigIndex = cleaned.search(RegExpUtils.mailspringSignatureRegex());
    cleaned = sigIndex > -1 ? cleaned.substr(0, sigIndex) : cleaned;

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
            `addressed to a name that doesn't appear to be a recipient ("${salutation}")`,
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
    if (this._popedOut) {
      // We do nothing if session have popouts
      // console.log('we are poped out');
      return;
    }
    const draft = this.draft();
    const account = AccountStore.accountForEmail(draft.from[0].email);
    if (!account) {
      throw new Error(
        'DraftEditingSession::ensureCorrectAccount - you can only send drafts from a configured account.',
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
      const newId = uuid();
      const create = new SyncbackDraftTask({
        headerMessageId: draft.headerMessageId,
        draft: new Message({
          id: newId,
          from: draft.from,
          version: 0,
          to: draft.to,
          cc: draft.cc,
          bcc: draft.bcc,
          body: draft.body,
          files: draft.files,
          replyTo: draft.replyTo,
          subject: draft.subject,
          headerMessageId: newId,
          // referenceMessageId: draft.id,
          hasNewID: draft.hasNewID,
          accountId: account.id,
          msgOrigin: draft.msgOrigin,
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
      // console.log('syncback draft from ensure account');
      Actions.queueTask(create);
      await TaskQueue.waitForPerformLocal(create);
      if (destroy) {
        // console.log('destroyed');
        Actions.destroyDraft(draft, { switchingAccount: true });
      } else {
        // console.log('did not destroy', draft);
      }
    }
    return this;
  }

  _onDraftARPReply = (event, options = {}) => {
    if (
      options.headerMessageId &&
      this.headerMessageId === options.headerMessageId &&
      options.windowLevel > this._currentWindowLevel
    ) {
      if (options.windowLevel === 2) {
        this._popOutOrigin['threadPopout'] = true;
      } else if (options.windowLevel === 3) {
        this._popOutOrigin['composer'] = true;
      }
      this.setPopout(true);
    }
  };

  _onDraftCloseWindow = (event, options = {}) => {
    // console.log('session on close window', options);
    if (options.headerMessageId && this.headerMessageId === options.headerMessageId) {
      if (options.deleting) {
        this._destroyed = true;
      }
      if (this._currentWindowLevel === 2) {
        delete this._popOutOrigin['composer'];
        this.setPopout(false);
      } else if (this._currentWindowLevel === 1) {
        if (options.windowLevel === 3) {
          delete this._popOutOrigin['composer'];
        } else if (options.windowLevel === 2) {
          delete this._popOutOrigin['threadPopout'];
        }
        this.setPopout(Object.keys(this._popOutOrigin).length > 0);
      }
    }
  };

  _onDraftNewWindow = (event, options = {}) => {
    if (
      options.headerMessageId &&
      this._currentWindowLevel < 3 &&
      this.headerMessageId === options.headerMessageId
    ) {
      this._popOutOrigin['composer'] = true;
      this.setPopout(true);
    } else if (
      !options.headerMessageId &&
      options.threadId &&
      this._draft &&
      options.windowType === 'thread-popout' &&
      this._draft.threadId === options.threadId &&
      this._currentWindowLevel === 1
    ) {
      this._popOutOrigin['threadPopout'] = true;
      this.setPopout(true);
    }
  };

  _onDraftDelete = (event, options) => {
    if (options.headerMessageId && this.headerMessageId === options.headerMessageId) {
      this.changes.cancelCommit();
      this._destroyed = true;
    }
  };

  _onDraftChanged = change => {
    if (change === undefined || change.type !== 'persist') {
      return;
    }
    if (!this._draft) {
      // We don't accept changes unless our draft object is loaded
      console.log(`draft not ready @ windowLevel ${this._currentWindowLevel}`);
      return;
    }

    // Some change events just tell us that the state of the draft (eg sending state)
    // have changed and don't include a payload.
    if (change.headerMessageId) {
      if (change.headerMessageId === this.draft.headerMessageId) {
        // console.log('triggered data change');
        this.trigger();
      } else {
        // console.log('header message id not equal');
      }
      return;
    }

    const nextDraft = change.objects
      .filter(obj => obj.headerMessageId === this._draft.headerMessageId)
      .pop();

    if (!nextDraft) {
      return;
    }
    if (this._draft.waitingForBody || !this._draft.body) {
      DraftStore.findByHeaderMessageIdWithBody({
        headerMessageId: this.headerMessageId,
      }).limit(1)
        .then(draft => {
          if (this._destroyed) {
            console.warn(`Draft loaded but session has been torn down.`);
            return;
          }
          if (!draft) {
            console.warn(`Draft ${this.headerMessageId} could not be found. Just deleted?`);
            return;
          }
          hotwireDraftBodyState(draft);
          this._draft = draft;
          this.trigger();
        });
      return;
    }

    // If the session has unsaved changes for a given field (eg: 'to' or 'body'),
    // we don't accept changes from the database. All changes to the draft should
    // be made through the editing session and we don't want to overwrite the user's
    // work under any scenario.
    // Above does not apply when current session is "poped out",
    // meaning user is not changing session in current window,
    // thus we should reflect all changes from database
    const lockedFields = this.changes.dirtyFields();

    let changed = false;
    for (const [key] of Object.entries(Message.attributes)) {
      if (key === 'headerMessageId') continue;
      if (nextDraft[key] === undefined) continue;
      if (this._draft[key] === nextDraft[key]) continue;
      if (lockedFields.includes(key) && !this.isPopout()) continue;

      if (changed === false) {
        this._draft = fastCloneDraft(this._draft);
        changed = true;
      }
      if (key === 'body' && nextDraft[key].length === 0){
        console.log('body is empty, ignoring');
        continue;
      }
      this._draft[key] = nextDraft[key];
    }

    if (changed) {
      // console.log('triggered data change');
      this.trigger();
    } else {
      // console.log('no changes');
    }
  };

  // We assume that when thread changes, we are switching view
  onThreadChange = (options) => {
    // console.log(`on thread change listener: ${this._threadId}`, options);
    if (
      this._draft &&
      options.threadId &&
      this._draft.threadId === options.threadId &&
      !this._inView &&
      !this._destroyed
    ) {
      this._inView = true;
      this._registerListeners();
    } else if (
      this._draft &&
      options.threadId &&
      this._draft.threadId !== options.threadId &&
      this._inView &&
      !this._destroyed
    ) {
      if (this.needUpload()) {
        this.changeSetCommit('unload');
      }
      this._removeListeners();
      this._inView = false;
    }
  };

  async changeSetCommit(arg) {
    if (this._destroyed || !this._draft || this._popedOut) {
      return;
    }
    //if id is empty, we assign uuid to id;
    if (!this._draft.id || this._draft.id === '') {
      AppEnv.reportError(new Error(`Draft id is empty assigning new id for draft ${JSON.stringify(this._draft)}`));
      this._draft.id = uuid();
    }
    if (
      this._draft.remoteUID &&
      (!this._draft.msgOrigin ||
        (this._draft.msgOrigin === Message.EditExistingDraft && !this._draft.hasNewID)) &&
      arg === 'unload'
    ) {
      this._draft.setOrigin(Message.EditExistingDraft);
      this._draft.referenceMessageId = this._draft.id;
      this._draft.id = uuid();
      const oldHMsgId = this._draft.headerMessageId;
      this._draft.headerMessageId = this._draft.id;
      this.headerMessageId = this._draft.headerMessageId;
      this._draft.hasNewID = true;
      ipcRenderer.send('draft-got-new-id', {
        newHeaderMessageId: this._draft.headerMessageId,
        oldHeaderMessageId: oldHMsgId,
        newMessageId: this._draft.id,
        referenceMessageId: this._draft.referenceMessageId,
        threadId: this._draft.threadId,
        windowLevel: this._currentWindowLevel,
      });
    } else if (this._draft.remoteUID && this._draft.msgOrigin !== Message.EditExistingDraft) {
      // console.error('Message with remoteUID but origin is not edit existing draft');
      this._draft.setOrigin(Message.EditExistingDraft);
    }
    if (arg === 'unload') {
      this._draft.hasNewID = false;
      this._draft.needUpload = false;
    }
    // console.error('commit sync back draft');
    const task = new SyncbackDraftTask({ draft: this._draft });
    task.saveOnRemote = arg === 'unload';
    Actions.queueTask(task);
    await TaskQueue.waitForPerformLocal(task);
  }

  needUpload() {
    return this._draft.needUpload;
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
