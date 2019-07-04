import { ipcRenderer } from 'electron';
import MailspringStore from 'mailspring-store';
import DraftEditingSession from './draft-editing-session';
import DraftFactory from './draft-factory';
import DatabaseStore from './database-store';
import SendActionsStore from './send-actions-store';
// import FocusedContentStore from './focused-content-store';
import CategoryStore from './category-store';
import SyncbackDraftTask from '../tasks/syncback-draft-task';
import SyncbackMetadataTask from '../tasks/syncback-metadata-task';
import SendDraftTask from '../tasks/send-draft-task';
import DestroyDraftTask from '../tasks/destroy-draft-task';
import Thread from '../models/thread';
import Message from '../models/message';
import Actions from '../actions';
import TaskQueue from './task-queue';
import MessageBodyProcessor from './message-body-processor';
import SoundRegistry from '../../registries/sound-registry';
import * as ExtensionRegistry from '../../registries/extension-registry';
import MessageStore from './message-store';
import UndoRedoStore from './undo-redo-store';
import ChangeFolderTask from '../tasks/change-folder-task';

const { DefaultSendActionKey } = SendActionsStore;
const SendDraftTimeout = 300000;

/*
Public: DraftStore responds to Actions that interact with Drafts and exposes
public getter methods to return Draft objects and sessions.

It also creates and queues {Task} objects to persist changes to the Nylas
API.

Remember that a "Draft" is actually just a "Message" with `draft: true`.

Section: Drafts
*/
class DraftStore extends MailspringStore {
  constructor() {
    super();
    this.listenTo(DatabaseStore, this._onDataChanged);
    this.listenTo(Actions.composeReply, this._onComposeReply);
    this.listenTo(Actions.composeForward, this._onComposeForward);
    this.listenTo(Actions.composePopoutDraft, this._onPopoutDraft);
    this.listenTo(Actions.composeNewBlankDraft, this._onPopoutBlankDraft);
    this.listenTo(Actions.composeNewDraftToRecipient, this._onPopoutNewDraftToRecipient);
    this.listenTo(Actions.draftDeliveryFailed, this._onSendDraftFailed);
    this.listenTo(Actions.draftDeliverySucceeded, this._onSendDraftSuccess);
    this.listenTo(Actions.sendQuickReply, this._onSendQuickReply);
    this.listenTo(Actions.sendingDraft, this._onSendingDraft);
    this.listenTo(Actions.destroyDraftFailed, this._onDestroyDraftFailed);
    this.listenTo(Actions.destroyDraftSucceeded, this._onDestroyDraftSuccess);
    this.listenTo(Actions.changeDraftAccount, this._onDraftAccountChange);    // Remember that these two actions only fire in the current window and
    // are picked up by the instance of the DraftStore in the current
    // window.
    this.listenTo(Actions.sendDraft, this._onSendDraft);
    this.listenTo(Actions.destroyDraft, this._onDestroyDraft);

    if (AppEnv.isMainWindow()) {
      ipcRenderer.on('new-message', () => {
        Actions.composeNewBlankDraft();
      });

      // send mail Immediately
      ipcRenderer.on('action-send-now', (event, headerMessageId, actionKey) => {
        Actions.sendDraft(headerMessageId, { actionKey, delay: 0 });
      });
      ipcRenderer.on('thread-arp', this._onThreadChange);
    }
    ipcRenderer.on('action-send-cancelled', (event, headerMessageId, actionKey) => {
      if (AppEnv.isMainWindow()) {
        Actions.draftDeliveryCancelled({ headerMessageId, actionKey });
      }
      this._onSendDraftCancelled({ headerMessageId });
    });
    // popout closed
    ipcRenderer.on('draft-close-window', this._onPopoutClosed);
    // ipcRenderer.on('draft-got-new-id', this._onDraftGotNewId);
    ipcRenderer.on('draft-arp', this._onDraftArp);
    ipcRenderer.on('draft-delete', this._onDraftDeleting);


    AppEnv.onBeforeUnload(this._onBeforeUnload);

    this._draftSessions = {};
    this._draftsSending = {};
    this._draftSendindTimeouts = {};
    this._draftsDeleting = {};

    this._draftsPopedOut = {};
    ipcRenderer.on('mailto', this._onHandleMailtoLink);
    ipcRenderer.on('mailfiles', this._onHandleMailFiles);
  }

  findByHeaderMessageId({ headerMessageId }) {
    return DatabaseStore.findBy(Message, {
      headerMessageId: headerMessageId,
      draft: true,
    }).where([Message.attributes.state.in([Message.messageState.normal, Message.messageState.saving, Message.messageState.sending])]);
  }

  findByHeaderMessageIdWithBody({ headerMessageId }) {
    return this.findByHeaderMessageId({ headerMessageId }).include(Message.attributes.body);
  }

  findAllWithBodyInDescendingOrder() {
    return MessageStore.findAllWithBodyInDescendingOrder().where({ draft: true });
  }

  /**
   Fetch a {DraftEditingSession} for displaying and/or editing the
   draft with `headerMessageId`.

   @param {String} headerMessageId - The headerMessageId of the draft.
   @returns {Promise} - Resolves to an {DraftEditingSession} for the draft once it has been prepared
   */
  async sessionForClientId(headerMessageId) {
    if (!headerMessageId) {
      throw new Error('DraftStore::sessionForClientId requires a headerMessageId');
    }
    if (!this._draftSessions[headerMessageId]) {
      this._draftSessions[headerMessageId] = this._createSession(headerMessageId);
    }
    await this._draftSessions[headerMessageId].prepare();
    ipcRenderer.send('draft-arp', { headerMessageId });
    return this._draftSessions[headerMessageId];
  }

  // Public: Look up the sending state of the given draft headerMessageId.
  // In popout windows the existance of the window is the sending state.
  isSendingDraft(headerMessageId) {
    return (
      !!this._draftsSending[headerMessageId] ||
      false
    );
  }

  _onDraftAccountChange = async ({
                                   originalMessageId,
                                   originalHeaderMessageId,
                                   newParticipants,
                                 }) => {
    const session = this._draftSessions[originalHeaderMessageId];
    await session.changes.commit();
    session.freezeSession();
    const oldDraft = session.draft();
    if (!oldDraft) {
      console.error('How can old not available');
      return;
    }
    oldDraft.cc = newParticipants.cc;
    oldDraft.bcc = newParticipants.bcc;
    const newDraft = await DraftFactory.copyDraftToAccount(oldDraft, newParticipants.from);
    await this._finalizeAndPersistNewMessage(newDraft);
    Actions.changeDraftAccountComplete({ newDraftJSON: newDraft.toJSON() });
    this._onDestroyDraft(
      {
        accountId: oldDraft.accountId,
        headerMessageId: originalHeaderMessageId,
        id: originalMessageId,
        threadId: oldDraft.threadId,
      },
      { switchingAccount: true, canBeUndone: false},
    );
  };

  //on Thread changed
  _onThreadChange = (event, options = {}) => {
    if (options.threadId) {
      for (let headerMessageId in this._draftSessions) {
        if (this._draftsDeleting[headerMessageId] || this._draftsSending[headerMessageId]) {
          // If draft is sending or deleting, we don't do anything
          continue;
        }
        if (
          this._draftSessions[headerMessageId] &&
          this._draftSessions[headerMessageId].draft()
        ) {
          this._draftSessions[headerMessageId].onThreadChange(options);
        }
      }
    }
  };

  // Check if current store already have session
  _onDraftArp = (event, options = {}) => {
    // console.log(`draft arp ${JSON.stringify(options)} @ windowLevel ${this._getCurrentWindowLevel()}`);
    if (options.headerMessageId && options.threadId && options.windowLevel) {
      const currenttWindowsLevel = this._getCurrentWindowLevel();
      if (
        this._draftSessions[options.headerMessageId]
      ) {
        ipcRenderer.send('draft-arp-reply', {
          headerMessageId: options.headerMessageId,
          threadId: options.threadId,
          windowLevel: currenttWindowsLevel,
        });
      }
    }
  };

  _doneWithSession(session) {
    session.teardown();
    delete this._draftSessions[session.headerMessageId];
  }

  _cleanupAllSessions() {
    Object.values(this._draftSessions).forEach(session => {
      this._doneWithSession(session);
    });
  }

  _onPopoutClosed = (event, options = {}) => {
    if (options.headerMessageId && this._draftSessions[options.headerMessageId]) {
      // console.log(`popout closed with header ${options.headerMessageId}`);
      delete this._draftsPopedOut[options.headerMessageId];
      this._draftSessions[options.headerMessageId].setPopout(false);
    }
  };

  _onBeforeUnload = readyToUnload => {
    // console.log(`draft store close window @ window ${this._getCurrentWindowLevel()}`);
    const promises = [];

    // Normally we'd just append all promises, even the ones already
    // fulfilled (nothing to save), but in this case we only want to
    // block window closing if we have to do real work. Calling
    // window.close() within on onbeforeunload could do weird things.
    Object.values(this._draftSessions).forEach(session => {
      const draft = session.draft();
      // if draft.id is empty, use headerMessageId
      if (!draft.id && draft.headerMessageId) {
        draft.id = draft.headerMessageId;
      }
      if (!draft || !draft.id) {
        return;
      }

      // Only delete pristine drafts if we're in popouts and is not from server, aka remoteUID=0.
      if (draft.pristine && !session.isPopout() && !draft.remoteUID) {
        // console.log(`draft to be destroyed @ ${this._getCurrentWindowLevel()}`);
        if (!this._draftsDeleting[draft.id]){
          console.log('sending out destroy draft in onbefore load');
          promises.push(Actions.destroyDraft(draft, { canBeUndone: false }));
        }
      } else if (
        AppEnv.isMainWindow() &&
        (session.changes.isDirty() || session.needUpload()) &&
        !session.isPopout() &&
        !this._draftsDeleting[draft.id]
      ) {
        promises.push(session.changes.commit('unload'));
      } else if (
        !AppEnv.isMainWindow() &&
        (session.changes.isDirty() || session.needUpload()) &&
        !session.isPopout() &&
        !this._draftsDeleting[draft.id]
      ) {
        promises.push(session.changes.commit('unload'));
      }
      promises.push(ipcRenderer.send('close-window', {
        headerMessageId: draft.headerMessageId,
        threadId: draft.threadId,
        windowLevel: this._getCurrentWindowLevel(),
        additionalChannelParam: 'draft',
      }));
    });

    if (promises.length > 0) {
      let done = () => {
        done = null;
        this._draftSessions = {};
        // We have to wait for accumulateAndTrigger() in the DatabaseStore to
        // send events to ActionBridge before closing the window.
        setTimeout(readyToUnload, 15);
      };

      // Stop and wait before closing, but never wait for more than 700ms.
      // We may not be able to save the draft once the main window has closed
      // and the mailsync bridge is unavailable, don't want to hang forever.
      setTimeout(() => {
        if (done) done();
      }, 700);
      Promise.all(promises).then(() => {
        if (done) done();
      });
      return false;
    }

    // Continue closing
    return true;
  };
  _onDraftIdChange = change => {
    const draftsHeaderMessageId = Object.keys(this._draftSessions);
    const nextDraft = change.objects
      .filter(obj => draftsHeaderMessageId.includes(obj.headerMessageId))
      .pop();

    if (!nextDraft) {
      return;
    }
    if (
      this._draftSessions[nextDraft.headerMessageId] &&
      this._draftSessions[nextDraft.headerMessageId].draft() &&
      !this._draftSessions[nextDraft.headerMessageId].inView()
    ) {
      this._draftSessions[nextDraft.headerMessageId].updateDraftId(nextDraft.id);
    }
  };

  _onDataChanged = change => {
    if (change.objectClass !== Message.name) {
      return;
    }
    const drafts = change.objects.filter(msg => msg.draft && !msg.calendarReply);
    if (drafts.length === 0) {
      return;
    }

    // if the user has canceled an undo send, ensure we no longer show "sending..."
    // this is a fake status!
    for (const draft of drafts) {
      if (this._draftsSending[draft.headerMessageId]) {
        const m = draft.metadataForPluginId('send-later');
        if (m && m.isUndoSend && !m.expiration) {
          this._cancelSendingDraftTimeout({ headerMessageId });
        }
      }
    }

    // allow draft editing sessions to update
    this.trigger(change);
    // update drafts that are not in view;
    this._onDraftIdChange(change);
  };

  _onSendQuickReply = ({ thread, threadId, message, messageId }, body) => {
    if (AppEnv.config.get('core.sending.sounds')) {
      SoundRegistry.playSound('hit-send');
    }
    return Promise.props(this._modelifyContext({ thread, threadId, message, messageId }))
      .then(({ message: m, thread: t }) => {
        return DraftFactory.createDraftForReply({ message: m, thread: t, type: 'reply' });
      })
      .then(draft => {
        draft.body = `${body}\n\n${draft.body}`;
        draft.pristine = false;
        const t = new SyncbackDraftTask({ draft });
        // console.error('send quickly');
        Actions.queueTask(t);
        TaskQueue.waitForPerformLocal(t).then(() => {
          Actions.sendDraft(draft.headerMessageId);
        });
      });
  };

  _onComposeReply = ({ thread, threadId, message, messageId, popout, type, behavior }) => {
    return Promise.props(this._modelifyContext({ thread, threadId, message, messageId }))
      .then(({ message: m, thread: t }) => {
        return DraftFactory.createOrUpdateDraftForReply({ message: m, thread: t, type, behavior });
      })
      .then(draft => {
        return this._finalizeAndPersistNewMessage(draft, { popout }, {
          originalMessageId: message ? message.id : null,
          messageType: type,
        });
      });
  };

  _onComposeForward = async ({ thread, threadId, message, messageId, popout }) => {
    return Promise.props(this._modelifyContext({ thread, threadId, message, messageId }))
      .then(({ thread: t, message: m }) => {
        return DraftFactory.createDraftForForward({ thread: t, message: m });
      })
      .then(draft => {
        return this._finalizeAndPersistNewMessage(draft, { popout }, {
          originalMessageId: message ? message.id : null,
          messageType: 'forward',
        });
      });
  };

  _modelifyContext({ thread, threadId, message, messageId }) {
    const queries = {};
    if (thread) {
      if (!(thread instanceof Thread)) {
        throw new Error(
          'newMessageWithContext: `thread` present, expected a Model. Maybe you wanted to pass `threadId`?',
        );
      }
      queries.thread = thread;
    } else if (threadId != null) {
      queries.thread = DatabaseStore.find(Thread, threadId);
    } else {
      throw new Error('newMessageWithContext: `thread` or `threadId` is required.');
    }

    if (message) {
      if (!(message instanceof Message)) {
        throw new Error(
          'newMessageWithContext: `message` present, expected a Model. Maybe you wanted to pass `messageId`?',
        );
      }
      queries.message = message;
    } else if (messageId != null) {
      queries.message = MessageStore.findByMessageIdWithBody({ messageId });
    } else {
      queries.message = MessageStore.findAllByThreadIdWithBodyInDescendingOrder({
        threadId: threadId || thread.id,
      })
        .limit(10)
        .then(messages => {
          return messages.find(m => !m.isHidden());
        });
    }

    return queries;
  }

  _finalizeAndPersistNewMessage(draft, { popout } = {}, { originalMessageId, messageType } = {}) {
    // Give extensions an opportunity to perform additional setup to the draft
    ExtensionRegistry.Composer.extensions().forEach(extension => {
      if (!extension.prepareNewDraft) {
        return;
      }
      extension.prepareNewDraft({ draft });
    });

    // Optimistically create a draft session and hand it the draft so that it
    // doesn't need to do a query for it a second from now when the composer wants it.
    this._createSession(draft.headerMessageId, draft);
    const task = new SyncbackDraftTask({ draft });
    // console.error('sync back from finalize');
    Actions.queueTask(task);

    return TaskQueue.waitForPerformLocal(task).then(() => {
      if (popout) {
        this._onPopoutDraft(draft.headerMessageId);
      }
      if (originalMessageId) {
        Actions.draftReplyForwardCreated({ messageId: originalMessageId, type: messageType });
      }
      return { headerMessageId: draft.headerMessageId, draft };
    });
  }

  _createSession(headerMessageId, draft) {
    this._draftSessions[headerMessageId] = new DraftEditingSession(headerMessageId, draft);
    ipcRenderer.send('draft-arp', { headerMessageId });
    return this._draftSessions[headerMessageId];
  }

  _onPopoutNewDraftToRecipient = async contact => {
    const draft = await DraftFactory.createDraft({ to: [contact] });
    await this._finalizeAndPersistNewMessage(draft, { popout: true });
  };

  _onPopoutBlankDraft = async () => {
    const draft = await DraftFactory.createDraft();
    const { headerMessageId } = await this._finalizeAndPersistNewMessage(draft);
    await this._onPopoutDraft(headerMessageId, { newDraft: true });
    Actions.composedNewBlankDraft();
  };

  _onPopoutDraft = async (headerMessageId, options = {}) => {
    if (headerMessageId == null) {
      throw new Error('DraftStore::onPopoutDraftId - You must provide a headerMessageId');
    }

    const session = await this.sessionForClientId(headerMessageId);
    if (!session.draft()) {
      AppEnv.reportError(
        new Error(
          `DraftStore::onPopoutDraft - session.draft() is false, draft not ready. headerMessageId: ${headerMessageId}`,
        ),
      );
      return;
    }
    const messageId = session.draft().id;
    if (this._draftsDeleting[messageId] || this.isSendingDraft(headerMessageId)) {
      AppEnv.reportError(
        new Error(
          `Attempting to open draft-id:${messageId} when it is being deleted or sending. this._draftDeleting: ${this._draftsDeleting}, this._draftSending: ${this._draftsSending}`
        )
      );
      return;
    }
    await session.changes.commit();
    this._draftsPopedOut[headerMessageId] = true;
    session.setPopout(true);
    const draftJSON = session.draft().toJSON();
    // Since we pass a windowKey, if the popout composer draft already
    // exists we'll simply show that one instead of spawning a whole new
    // window.
    // console.log(`popout draft ${headerMessageId}`);
    AppEnv.newWindow({
      hidden: true, // We manually show in ComposerWithWindowProps::onDraftReady
      headerMessageId: headerMessageId,
      windowType: 'composer',
      windowKey: `composer-${headerMessageId}`,
      windowProps: Object.assign(options, { headerMessageId, draftJSON }),
      title: options.newDraft ? 'New Message' : 'Message',
      threadId: session.draft().threadId,
    });
  };

  _onHandleMailtoLink = async (event, urlString) => {
    // returned promise is just used for specs
    const draft = await DraftFactory.createDraftForMailto(urlString);
    try {
      await this._finalizeAndPersistNewMessage(draft, { popout: true });
    } catch (err) {
      AppEnv.showErrorDialog(err.toString());
    }
  };

  _onHandleMailFiles = async (event, paths) => {
    // returned promise is just used for specs
    const draft = await DraftFactory.createDraft();
    const { headerMessageId } = await this._finalizeAndPersistNewMessage(draft);

    let remaining = paths.length;
    const callback = () => {
      remaining -= 1;
      if (remaining === 0) {
        this._onPopoutDraft(headerMessageId);
      }
    };

    paths.forEach(path => {
      Actions.addAttachment({
        filePath: path,
        headerMessageId: headerMessageId,
        onCreated: callback,
      });
    });
  };
  cancelDraftTasks = ({ headerMessageId }) => {
    if (headerMessageId) {
      TaskQueue.queue().forEach(task => {
        if (task instanceof SyncbackDraftTask && task.headerMessageId === headerMessageId) {
          Actions.cancelTask(task);
        }
        if (task instanceof SendDraftTask && task.headerMessageId === headerMessageId) {
          Actions.cancelTask(task);
        }
      });
    }
  };

  _onDraftGotNewId = (event, options) => {
    console.log(`draft got new id ${options} @ window ${this._getCurrentWindowLevel()}`);
    if (options.windowLevel && options.windowLevel === this._getCurrentWindowLevel()) {
      if (this._draftSessions[options.oldHeaderMessageId] && options.newHeaderMessageId) {
        if (!this._draftSessions[options.newHeaderMessageId]) {
          this._draftSessions[options.newHeaderMessageId] = Object.assign(
            {},
            this._draftSessions[options.oldHeaderMessageId],
          );
        }
        this._doneWithSession(this._draftSessions[options.oldHeaderMessageId]);
      }
    }
  };

  _onDestroyDraft = (message = {}, opts = {}) => {
    // console.log('on destroy draft');
    const { accountId, headerMessageId, id, threadId } = message;
    let draftDeleting = false;
    if(id){
      draftDeleting = !!this._draftsDeleting[id];
      this._draftsDeleting[id] = headerMessageId;
    }
    const session = this._draftSessions[headerMessageId];
    // Immediately reset any pending changes so no saves occur
    if (session && !draftDeleting) {
      if (this._draftsSending[headerMessageId]) {
        return;
      }
      if (session.isPopout()) {
        const { draft, oldHeaderMessageId, oldMessageId } = session.duplicateCurrentDraft();
        if (draft) {
          this._finalizeAndPersistNewMessage(draft).then(() => {
            ipcRenderer.send('draft-got-new-id', {
              newHeaderMessageId: draft.headerMessageId,
              oldHeaderMessageId,
              newMessageId: draft.id,
              oldMessageId,
              referenceMessageId: draft.referenceMessageId,
              threadId: draft.threadId,
              windowLevel: this._getCurrentWindowLevel(),
            });
          })
        }
      }
      this._doneWithSession(session);
    }

    // Stop any pending tasks related to the draft
    this.cancelDraftTasks({ headerMessageId });
    // Queue the task to destroy the draft
    if (id) {
      if (!draftDeleting) {
        delete this._draftsPopedOut[headerMessageId];
        this.trigger({ headerMessageId });
        Actions.queueTask(
          new DestroyDraftTask({
            canBeUndone: opts.canBeUndone,
            accountId,
            messageIds: [id],
            headerMessageId,
            needToBroadcastBeforeSendTask: {
              channel: 'draft-delete',
              options: {
                accountId,
                messageIds: [id],
                threadId,
                headerMessageId: headerMessageId,
                windowLevel: this._getCurrentWindowLevel(),
              },
            },
          }),
        );
      }
    } else {
      AppEnv.reportError(new Error('Tried to delete a draft that had no ID assigned yet.'));
    }
    if (AppEnv.isComposerWindow() && !opts.switchingAccount) {
      AppEnv.close({
        headerMessageId,
        threadId,
        windowLevel: this._getCurrentWindowLevel(),
        additionalChannelParam: 'draft',
        deleting: true,
      });
    }
  };
  _onDraftDeleting = (event, options) => {
    if (Array.isArray(options.messageIds) && options.headerMessageId) {
      this._draftsDeleting[options.messageIds[0]]=options.headerMessageId;
    }
  };
  _onDestroyDraftSuccess = ({ messageIds }) => {
    if (Array.isArray(messageIds)) {
      const headerMessageId = this._draftsDeleting[messageIds[0]];
      delete this._draftsDeleting[messageIds[0]];
      this.trigger({ headerMessageId });
    }
  };

  _onDestroyDraftFailed = ({ messageIds, key, debuginfo }) => {
    if (Array.isArray(messageIds)) {
      const headerMessageId = this._draftsDeleting[messageIds[0]];
      delete this._draftsDeleting[messageIds[0]];
      this.trigger({ headerMessageId });
    }
  };
  _cancelSendingDraftTimeout = ({ headerMessageId, trigger = false, changeSendStatus = true }) => {
    if (this._draftSendindTimeouts[headerMessageId]) {
      clearTimeout(this._draftSendindTimeouts[headerMessageId]);
      delete this._draftSendindTimeouts[headerMessageId];
    }
    if (changeSendStatus) {
      delete this._draftsSending[headerMessageId];
    } else {
      AppEnv.reportError(
        new Error(`Sending draft: ${headerMessageId}, took more than ${SendDraftTimeout/1000} seconds`),
      );
    }
    if (trigger) {
      this.trigger({ headerMessageId });
    }
  };
  _startSendingDraftTimeout = ({ headerMessageId }) => {
    if (this._draftSendindTimeouts[headerMessageId]) {
      clearTimeout(this._draftSendindTimeouts[headerMessageId]);
    }
    this._draftsSending[headerMessageId] = true;
    this._draftSendindTimeouts[headerMessageId] = setTimeout(() => {
      this._cancelSendingDraftTimeout({ headerMessageId, trigger: true, changeSendStatus: false });
    }, SendDraftTimeout);
  };
  _onSendingDraft = async ({ headerMessageId, windowLevel }) => {
    // console.log(`headerMessageId: ${headerMessageId}, from window: ${windowLevel}, at window ${this._getCurrentWindowLevel()}`);
    if (this._getCurrentWindowLevel() !== windowLevel) {
      const session = await this.sessionForClientId(headerMessageId);
      if (session) {
        this._doneWithSession(session);
      } else {
        console.error(`session not found for ${headerMessageId} at window: ${windowLevel}`);
      }
      this._startSendingDraftTimeout({ headerMessageId });
      this.trigger({ headerMessageId });
    }
  };

  _onSendDraft = async (headerMessageId, options = {}) => {
    if (this._draftsSending[headerMessageId]) {
      if (AppEnv.isComposerWindow()) {
        AppEnv.close({
          headerMessageId,
          threadId: this._draftsSending[headerMessageId].threadId,
          additionalChannelParam: 'draft',
          windowLevel: this._getCurrentWindowLevel(),
        });
      }
      // delete this._draftsPendingSending[headerMessageId];
      return;
    }
    // this._draftsPendingSending[headerMessageId] = true;
    const {
      delay = AppEnv.config.get('core.sending.undoSend'),
      actionKey = DefaultSendActionKey,
    } = options;

    const sendAction = SendActionsStore.sendActionForKey(actionKey);

    if (!sendAction) {
      throw new Error(`Cant find send action ${actionKey} `);
    }

    const sendLaterMetadataValue = {
      expiration: new Date(Date.now() + delay),
      isUndoSend: true,
      actionKey: actionKey,
    };

    // get the draft session, apply any last-minute edits and get the final draft.
    // We need to call `changes.commit` here to ensure the body of the draft is
    // completely saved and the user won't see old content briefly.
    const session = await this.sessionForClientId(headerMessageId);
    // if (session.isPopout()) {
    //   // Do nothing if session have popouts
    //   return;
    // }

    // move the draft to another account if necessary to match the from: field
    await session.ensureCorrectAccount();

    let draft = session.draft();

    this._startSendingDraftTimeout({ headerMessageId });

    // remove inline attachments that are no longer in the body
    const files = draft.files.filter(f => {
      return !(f.contentId && !draft.body.includes(`cid:${f.contentId}`));
    });
    if (files.length !== draft.files.length) {
      session.changes.add({ files });
    }
    draft.files = files;

    // attach send-later metadata if a send delay is enabled
    if (sendLaterMetadataValue) {
      session.changes.addPluginMetadata('send-later', sendLaterMetadataValue);
    }
    await session.changes.commit();
    await session.teardown();

    // ensureCorrectAccount / commit may assign this draft a new ID. To move forward
    // we need to have the final object with it's final ID.
    // draft = await DatabaseStore.findBy(Message, { headerMessageId, draft: true, state: 0 }).include(
    //   Message.attributes.body,
    // );
    // Directly update the message body cache so the user immediately sees
    // the new message text (and never old draft text or blank text) sending.
    await MessageBodyProcessor.updateCacheForMessage(draft);

    // At this point the message UI enters the sending state and the composer is unmounted.
    this.trigger({ headerMessageId });
    this._doneWithSession(session);
    // Notify all windows that draft is being send out.
    Actions.sendingDraft({ headerMessageId, windowLevel: this._getCurrentWindowLevel() });
    // To be able to undo the send, we need to pretend that we added the send-later
    // metadata as it's own task so that the undo action is clear. We don't actually
    // want a separate SyncbackMetadataTask to be queued because a stray SyncbackDraftTask
    // could overwrite the metadata value back to null.
    if (sendLaterMetadataValue) {
      const undoTask = SyncbackMetadataTask.forSaving({
        pluginId: 'send-later',
        model: draft,
        value: sendLaterMetadataValue,
        undoValue: { expiration: null, isUndoSend: true },
        lingerAfterTimeout: true,
        priority: UndoRedoStore.priority.critical,
        delayedTasks: [SendDraftTask.forSending(draft)],
      });
      Actions.queueUndoOnlyTask(undoTask);
      // ipcRenderer.send('send-later-manager', 'send-later', headerMessageId, delay, actionKey, draft.threadId);
    } else {
      // Immediately send the draft
      // await sendAction.performSendAction({ draft });
    }

    if (AppEnv.isComposerWindow()) {
      AppEnv.close({
        headerMessageId,
        threadId: draft.threadId,
        additionalChannelParam: 'draft',
        windowLevel: this._getCurrentWindowLevel(),
      });
    }
  };

  _onSendDraftSuccess = ({ headerMessageId }) => {
    this._cancelSendingDraftTimeout({ headerMessageId });
    this.trigger({ headerMessageId });
  };
  _onSendDraftCancelled = ({ headerMessageId }) => {
    this._cancelSendingDraftTimeout({ headerMessageId });
    this.trigger({ headerMessageId });
  };

  _onSendDraftFailed = ({ headerMessageId, threadId, errorMessage, errorDetail }) => {
    this._cancelSendingDraftTimeout({ headerMessageId });
    this.trigger({ headerMessageId });

    // if (AppEnv.isMainWindow()) {
    // We delay so the view has time to update the restored draft. If we
    // don't delay the modal may come up in a state where the draft looks
    // like it hasn't been restored or has been lost.
    //
    // We also need to delay because the old draft window needs to fully
    // close. It takes windows currently (June 2016) 100ms to close by
    // setTimeout(() => {
    //   const focusedThread = FocusedContentStore.focused('thread');
    //   if (threadId && focusedThread && focusedThread.id === threadId) {
    //     AppEnv.showErrorDialog(errorMessage, { detail: errorDetail });
    //   } else {
    //     Actions.composePopoutDraft(headerMessageId, { errorMessage, errorDetail });
    //   }
    // }, 300);
    // }
  };
  _getCurrentWindowLevel = () => {
    if (AppEnv.isComposerWindow()) {
      return 3;
    } else if (AppEnv.isThreadWindow()) {
      return 2;
    } else {
      return 1;
    }
  };
}

export default new DraftStore();
