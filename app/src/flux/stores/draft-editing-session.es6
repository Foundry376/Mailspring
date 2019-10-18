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
import FocusedContentStore from './focused-content-store';
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
    this._lastModifiedTimes = {};
    this._lastCommitTime = 0;
    this._draftDirty = false;
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
      changes.date = new Date();
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
    return this.dirtyFields().length > 0 || this._draftDirty;
  }
  onNewDraftFromOtherWindow(){
    this._draftDirty = true;
    this.debounceCommit();
  }

  dirtyFields() {
    return Object.keys(this._lastModifiedTimes).filter(
      key => this._lastModifiedTimes[key] > this._lastCommitTime
    );
  }

  debounceCommit() {
    if (!AppEnv.isMainWindow()) {
      return;
    }
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
    if (this.dirtyFields().length === 0 && !this._draftDirty && arg !== 'force') {
      return;
    }
    if (this._timer) {
      clearTimeout(this._timer);
    }
    await this.callbacks.onCommit(arg);
    this._lastCommitTime = Date.now();
    this._timer = null;
    this._lastModifiedTimes = {};
    this._draftDirty = false;
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
function cloneForSyncDraftData(draft){
  const next = new Message();
  for (const key of Object.getOwnPropertyNames(draft)) {
    if (key === 'body' || key === 'bodyEditorState') {
      continue;
    }
    next[key] = draft[key];
  }
  next['body'] = draft.body;
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

  constructor(headerMessageId, draft = null, options = {}) {
    super();
    this._draft = false;
    this._destroyed = false;
    this._popedOut = false;
    let currentWindowLevel = 3;
    if (AppEnv.isMainWindow()) {
      currentWindowLevel = 1;
    } else if (AppEnv.isThreadWindow()) {
      currentWindowLevel = 2;
    } else if (AppEnv.isComposerWindow()) {
      currentWindowLevel = 3;
    }
    // Because new draft window will first shown as main window type,
    // We need to check windowProps;
    const windowProps = AppEnv.getWindowProps();
    if (windowProps.draftJSON) {
      currentWindowLevel = 3;
    }

    this.headerMessageId = headerMessageId;
    this.changes = new DraftChangeSet({
      onAddChanges: changes => this.changeSetApplyChanges(changes),
      onCommit: arg => this.changeSetCommit(arg), // for specs
    });

    this._registerListeners();
    if (draft) {
      hotwireDraftBodyState(draft);
      this._draft = draft;
      this._draftPromise = Promise.resolve(draft);
      const thread = FocusedContentStore.focused('thread');
      const inFocusedThread = thread && thread.id === draft.threadId;
      if (currentWindowLevel === 3) {
        // Because new drafts can't be viewed in main window, we don't add it towards open count, if we are in mainWin
        // we want to trigger open count in composer window
        Actions.draftOpenCount({
          headerMessageId,
          windowLevel: currentWindowLevel,
          source: `draft-editing-session, with draft level: ${currentWindowLevel}`,
        });
      } else if (draft.replyOrForward !== Message.draftType.new) {
        if (currentWindowLevel === 2) {
          Actions.draftOpenCount({
            headerMessageId,
            windowLevel: currentWindowLevel,
            source: `draft-editing-session, with draft level: ${currentWindowLevel}`,
          });
        } else if (currentWindowLevel === 1 && inFocusedThread) {
          Actions.draftOpenCount({
            headerMessageId,
            windowLevel: currentWindowLevel,
            source: `draft-editing-session, with draft level: ${currentWindowLevel}`,
          });
        }
      }
    } else {
      let localPromise = DraftStore.findByHeaderMessageIdWithBody({
        headerMessageId: this.headerMessageId,
      }).limit(1);
      if (options.showFailed) {
        localPromise = DraftStore.findFailedByHeaderMessageIdWithBody({
          headerMessageId: this.headerMessageId,
        }).limit(1);
      }
      this._draftPromise = localPromise.then(draft => {
          if (this._destroyed) {
            AppEnv.reportWarning(`Draft loaded but session has been torn down.`);
            return;
          }
          if (!draft) {
            AppEnv.reportWarning(`Draft ${this.headerMessageId} could not be found. Just deleted?`);
            return;
          }
          // if (Message.compareMessageState(draft.state, Message.messageState.failed)) {
          //   AppEnv.logDebug(`Draft ${draft.headerMessageId} state is failed, setting it to normal`);
          //   draft.state = Message.messageState.normal;
          // }
          if (!draft.body) {
            draft.waitingForBody = true;
            Actions.fetchBodies({ messages: [draft], source: 'draft' });
          }
          if (Array.isArray(draft.from) && draft.from.length === 1) {
            if (draft.from[0].email.length === 0) {
              const currentAccount = AccountStore.accountForId(draft.accountId);
              if (currentAccount) {
                draft.from = [currentAccount.me()];
              }
            }
          }
          hotwireDraftBodyState(draft);
          if (draft.remoteUID) {
            draft.setOrigin(Message.EditExistingDraft);
          }
          this._draft = draft;
          this._threadId = draft.threadId;
          const thread = FocusedContentStore.focused('thread');
          const inFocusedThread = thread && thread.id === draft.threadId;
          if(currentWindowLevel === 2 || currentWindowLevel ===1 && inFocusedThread){
            Actions.draftOpenCount({
              headerMessageId,
              windowLevel: currentWindowLevel,
              source: `draft editing session, no draft ${currentWindowLevel}`,
            });
          }
          this.trigger();
        });
    }
  }

  get currentWindowLevel() {
    if (AppEnv.isMainWindow()) {
      return 1;
    } else if (AppEnv.isThreadWindow()) {
      return 2;
    } else if (AppEnv.isComposerWindow()) {
      return 3;
    } else {
      return 3;
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
  isDestroyed() {
    return this._destroyed;
  }
  // updateDraftId(id) {
  //   this._draft.id = id;
  //   ipcRenderer.send('draft-got-new-id', {
  //     newHeaderMessageId: this._draft.headerMessageId,
  //     oldHeaderMessageId: this._draft.headerMessageId,
  //     newMessageId: this._draft.id,
  //     threadId: this._draft.threadId,
  //     windowLevel: this.currentWindowLevel,
  //   });
  //   this.trigger();
  // }

  setPopout(val) {
    if (val !== this._popedOut) {
      if (this.changes && !val) {
        this.changes.cancelCommit();
        this.changeSetCommit();
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
  closeSession({ cancelCommits = false, reason = 'unknown' } = {}) {
    if (cancelCommits) {
      this.changes.cancelCommit();
    } else {
      if (this.changes.isDirty() || this.needUpload) {
        this.changeSetCommit('unload');
      }
    }
    AppEnv.logDebug(
      `closing session of ${this.headerMessageId} for ${reason} windowLevel: ${this.currentWindowLevel}`
    );
    this.teardown();
  }

  _registerListeners = () => {
    DraftStore = DraftStore || require('./draft-store').default;
    this.listenTo(DraftStore, this._onDraftChanged);
    // ipcRenderer.on('draft-arp-reply', this._onDraftARPReply);
    // ipcRenderer.on('draft-close-window', this._onDraftCloseWindow);
    // ipcRenderer.on('new-window', this._onDraftNewWindow);
    // ipcRenderer.on('draft-delete', this._onDraftDelete);
    // this.listenTo(Actions.popSheet, this._onThreadClose);
    this.listenTo(Actions.draftOpenCountBroadcast, this.onDraftOpenCountChange);
    if (!AppEnv.isMainWindow()) {
      this.listenTo(Actions.broadcastDraftData, this._applySyncDraftData);
    } else {
      this.listenTo(Actions.syncDraftDataToMain, this._applySyncDraftData);
    }
  };
  _removeListeners = () => {
    this.stopListeningToAll();
    this.changes.cancelCommit();
    // ipcRenderer.removeListener('new-window', this._onDraftNewWindow);
    // ipcRenderer.removeListener('draft-close-window', this._onDraftCloseWindow);
    // ipcRenderer.removeListener('draft-arp-reply', this._onDraftARPReply);
    // ipcRenderer.removeListener('draft-delete', this._onDraftDelete);
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
    // if (this._popedOut) {
      // We do nothing if session have popouts
      // console.log('we are poped out');
      // return;
    // }
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
      try {
        await TaskQueue.waitForPerformLocal(create);
        if (destroy) {
          // console.log('destroyed');
          Actions.destroyDraft([draft], { switchingAccount: true });
        }
      } catch (e) {
        AppEnv.reportError(new Error(e));
      }
    }
    return this;
  }

  _onDraftChanged = change => {
    if (change === undefined || change.type !== 'persist') {
      return;
    }
    if (!this._draft) {
      // We don't accept changes unless our draft object is loaded
      console.log(`draft not ready @ windowLevel ${this.currentWindowLevel}`);
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
    if (Array.isArray(change.headerMessageIds)) {
      if (change.headerMessageIds.includes(this.draft.headerMessageId)) {
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
    let changed = false;
    if (nextDraft.id !== this._draft.id) {
      this._draft.id = nextDraft.id;
      ipcRenderer.send('draft-got-new-id', {
        newHeaderMessageId: this._draft.headerMessageId,
        oldHeaderMessageId: this._draft.headerMessageId,
        newMessageId: this._draft.id,
        referenceMessageId: this._draft.referenceMessageId,
        threadId: this._draft.threadId,
        windowLevel: this.currentWindowLevel,
      });
      changed = true;
    }
    if (this._draft.waitingForBody || !this._draft.body) {
      DraftStore.findByHeaderMessageIdWithBody({
        headerMessageId: this.headerMessageId,
      })
        .limit(1)
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
    for (const [key] of Object.entries(Message.attributes)) {
      if (key === 'headerMessageId') continue;
      if (nextDraft[key] === undefined) continue;
      if (this._draft[key] === nextDraft[key]) continue;
      if (lockedFields.includes(key) && !this.isPopout()) continue;

      if (changed === false) {
        this._draft = fastCloneDraft(this._draft);
        changed = true;
      }
      if (key === 'body' && nextDraft[key].length === 0) {
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
  // onThreadChange = options => {
  //   // console.log(`on thread change listener: ${this._threadId}`, options);
  //   if (
  //     this._draft &&
  //     options.threadId &&
  //     this._draft.threadId === options.threadId &&
  //     !this._inView &&
  //     !this._destroyed
  //   ) {
  //     this._inView = true;
  //     this._registerListeners();
  //   } else if (
  //     this._draft &&
  //     options.threadId &&
  //     this._draft.threadId !== options.threadId &&
  //     this._inView &&
  //     !this.isPopout() &&
  //     !this._destroyed
  //   ) {
  //     if (this.needUpload()) {
  //       this.changeSetCommit('unload');
  //     }
  //     this._removeListeners();
  //     this._inView = false;
  //   }
  // };
  cancelCommit(){
    this.changes.cancelCommit();
  }

  async changeSetCommit(reason='') {
    // if (this._destroyed || !this._draft || this._popedOut) {
    //   return;
    // }
    if (!this._draft){
      return;
    }
    //if id is empty, we assign uuid to id;
    if (!this._draft.id || this._draft.id === '') {
      AppEnv.reportError(
        new Error(`Draft id is empty assigning new id for draft ${JSON.stringify(this._draft)}`)
      );
      this._draft.id = uuid();
    }
    // if (
    //   this._draft.remoteUID &&
    //   (!this._draft.msgOrigin ||
    //     (this._draft.msgOrigin === Message.EditExistingDraft && !this._draft.hasNewID)) &&
    //   reason === 'unload'
    // ) {
    //   this._draft.setOrigin(Message.EditExistingDraft);
    //   this._draft.referenceMessageId = this._draft.id;
    //   // this._draft.id = uuid();
    //   const oldHMsgId = this._draft.headerMessageId;
    //   // this._draft.headerMessageId = this._draft.id;
    //   this.headerMessageId = this._draft.headerMessageId;
    //   this._draft.hasNewID = true;
    //   ipcRenderer.send('draft-got-new-id', {
    //     newHeaderMessageId: this._draft.headerMessageId,
    //     oldHeaderMessageId: oldHMsgId,
    //     newMessageId: this._draft.id,
    //     referenceMessageId: this._draft.referenceMessageId,
    //     threadId: this._draft.threadId,
    //     windowLevel: this.currentWindowLevel,
    //   });
    // } else if (this._draft.remoteUID && this._draft.msgOrigin !== Message.EditExistingDraft) {
    //   // console.error('Message with remoteUID but origin is not edit existing draft');
    //   this._draft.setOrigin(Message.EditExistingDraft);
    // }
    if (reason === 'unload') {
      this._draft.hasNewID = false;
      this.needUpload = false;
      this._draft.savedOnRemote = true;
    }
    if(this.changes._draftDirty){
      this.changes._draftDirty = false;
    }
    const task = new SyncbackDraftTask({ draft: this._draft, source: reason });
    task.saveOnRemote = reason === 'unload';
    Actions.queueTask(task);
    try {
      await TaskQueue.waitForPerformLocal(task);
    } catch (e) {
      AppEnv.grabLogs()
        .then(filename => {
          if (typeof filename === 'string' && filename.length > 0) {
            AppEnv.reportError(new Error('SyncbackDraft Task not returned'), { errorData: task, files: [filename] });
          }
        })
        .catch(e => {
          AppEnv.reportError(new Error('SyncbackDraft Task not returned'));
        });
    }
  }
  set needUpload(val) {
    this._draft.needUpload = val;
  }

  get needUpload() {
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
    this._syncDraftDataToMain();
    this.trigger();
  };

  _applySyncDraftData({ syncData = {}, sourceLevel = 0 } = {}) {
    if (sourceLevel !== this.currentWindowLevel && syncData.id === this._draft.id) {
      AppEnv.logDebug('apply sync draft data');
      const nothingChanged =
        this._draft['body'] === syncData.body &&
        JSON.stringify(this._draft.from) === JSON.stringify(syncData.from) &&
        JSON.stringify(this._draft.to) === JSON.stringify(syncData.to) &&
        JSON.stringify(this._draft.bcc) === JSON.stringify(syncData.bcc) &&
        JSON.stringify(this._draft.cc) === JSON.stringify(syncData.cc) &&
        JSON.stringify(this._draft.files) === JSON.stringify(syncData.files) &&
        this._draft.subject === syncData.subject;
      for (const key of Object.getOwnPropertyNames(syncData)) {
        if (key === 'body' || key === 'bodyEditorState') {
          continue;
        }
        this._draft[key] = syncData[key];
      }
      this._draft['body'] = syncData.body;
      this.trigger();
      if (AppEnv.isMainWindow()) {
        Actions.broadcastDraftData({ syncData, sourceLevel });
        if(!nothingChanged){
          AppEnv.logDebug('things changed');
          this.needUpload = true;
          this.changes.onNewDraftFromOtherWindow();
        }
      }
    }
  }

  _syncDraftDataToMain = () => {
    if (!AppEnv.isMainWindow()) {
      AppEnv.logDebug('sync draft to main');
      const syncData = cloneForSyncDraftData(this._draft);
      Actions.syncDraftDataToMain({ syncData, sourceLevel: this.currentWindowLevel });
    }
  };
  onDraftOpenCountChange = ({ headerMessageId, data = {} }) => {
    AppEnv.logDebug(`draft open count change ${headerMessageId}`);
    if (this._draft && headerMessageId === this._draft.headerMessageId) {
      AppEnv.logDebug('draft open count change');
      let level = 3;
      let changedToTrue= false;
      while (level > this.currentWindowLevel) {
        if (data[level]) {
          this.setPopout(true);
          changedToTrue = true;
          break;
        }
        level = level - 1;
      }
      if(!changedToTrue){
        this.setPopout(false);
      }
    }
  };
}
