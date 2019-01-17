import { ipcRenderer } from 'electron';
import MailspringStore from 'mailspring-store';
import DraftEditingSession from './draft-editing-session';
import DraftFactory from './draft-factory';
import DatabaseStore from './database-store';
import SendActionsStore from './send-actions-store';
import FocusedContentStore from './focused-content-store';
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

const { DefaultSendActionKey } = SendActionsStore;
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
    this.listenTo(Actions.destroyDraftFailed,this._onDestroyDraftFailed);
    this.listenTo(Actions.destroyDraftSucceeded, this._onDestroyDraftSuccess);

    if (AppEnv.isMainWindow()) {
      ipcRenderer.on('new-message', () => {
        Actions.composeNewBlankDraft();
      });

      // send mail Immediately
      ipcRenderer.on('action-send-now', (event, headerMessageId, actionKey) => {
        Actions.sendDraft(headerMessageId, { actionKey, delay: 0 });
      });

      // popout closed
      // ipcRenderer.on('close-window', this._onPopoutClosed);
    }
      // popout closed
      ipcRenderer.on('close-window', this._onPopoutClosed);
    if(!AppEnv.isMainWindow()){
      ipcRenderer.on('draft-arp', this._onDraftArp);
    }

    // Remember that these two actions only fire in the current window and
    // are picked up by the instance of the DraftStore in the current
    // window.
    this.listenTo(Actions.sendDraft, this._onSendDraft);
    this.listenTo(Actions.destroyDraft, this._onDestroyDraft);

    AppEnv.onBeforeUnload(this._onBeforeUnload);

    this._draftSessions = {};
    this._draftsSending = {};
    this._draftsDeleting = {};
    this._draftsPopedOut = {};

    ipcRenderer.on('mailto', this._onHandleMailtoLink);
    ipcRenderer.on('mailfiles', this._onHandleMailFiles);
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
    return this._draftSessions[headerMessageId];
  }

  // Public: Look up the sending state of the given draft headerMessageId.
  // In popout windows the existance of the window is the sending state.
  isSendingDraft(headerMessageId) {
    return this._draftsSending[headerMessageId] || false;
  }

  // Check if current store already have session
  _onDraftArp = (event, options = {}) => {
    if (options.headerMessageId && options.threadId && options.windowLevel) {
      let currenttWindowsLevel = 1;
      if (AppEnv.isComposerWindow()) {
        currenttWindowsLevel = 3;
      } else if (AppEnv.isThreadWindow()) {
        currenttWindowsLevel = 2;
      }
      if (
        currenttWindowsLevel > options.windowLevel &&
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
    if(options.headerMessageId && this._draftSessions[options.headerMessageId]){
      // console.log(`popout closed with header ${options.headerMessageId}`);
      delete this._draftsPopedOut[options.headerMessageId];
      this._draftSessions[options.headerMessageId].setPopout(false);
    }
  };

  _onBeforeUnload = readyToUnload => {
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

      // Only delete pristine drafts if we're in popout composers. From the
      // main window we can't know if the draft session may also be open in
      // a popout and have content there.
      if (draft.pristine && !AppEnv.isMainWindow()) {
        Actions.destroyDraft(draft);
        // Actions.queueTask(
        //   new DestroyDraftTask({
        //     messageIds: [draft.id],
        //     accountId: draft.accountId,
        //   })
        // );
      } else if (session.changes.isDirty() && !this._draftsDeleting[draft.id]) {
        promises.push(session.changes.commit('unload'));
      }
      let windowLevel = 1;
      if(AppEnv.isComposerWindow()){
        windowLevel = 3;
      }else if(AppEnv.isThreadWindow()){
        windowLevel = 2;
      }
      ipcRenderer.send('close-window', { headerMessageId: draft.headerMessageId, threadId: draft.threadId, windowLevel: windowLevel});
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

  _onDataChanged = change => {
    if (change.objectClass !== Message.name) {
      return;
    }
    const drafts = change.objects.filter(msg => msg.draft);
    if (drafts.length === 0) {
      return;
    }

    // if the user has canceled an undo send, ensure we no longer show "sending..."
    // this is a fake status!
    for (const draft of drafts) {
      if (this._draftsSending[draft.headerMessageId]) {
        const m = draft.metadataForPluginId('send-later');
        if (m && m.isUndoSend && !m.expiration) {
          delete this._draftsSending[draft.headerMessageId];
        }
      }
    }

    // allow draft editing sessions to update
    this.trigger(change);
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
        return this._finalizeAndPersistNewMessage(draft, { popout });
      });
  };

  _onComposeForward = async ({ thread, threadId, message, messageId, popout }) => {
    return Promise.props(this._modelifyContext({ thread, threadId, message, messageId }))
      .then(({ thread: t, message: m }) => {
        return DraftFactory.createDraftForForward({ thread: t, message: m });
      })
      .then(draft => {
        return this._finalizeAndPersistNewMessage(draft, { popout });
      });
  };

  _modelifyContext({ thread, threadId, message, messageId }) {
    const queries = {};
    if (thread) {
      if (!(thread instanceof Thread)) {
        throw new Error(
          'newMessageWithContext: `thread` present, expected a Model. Maybe you wanted to pass `threadId`?'
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
          'newMessageWithContext: `message` present, expected a Model. Maybe you wanted to pass `messageId`?'
        );
      }
      queries.message = message;
    } else if (messageId != null) {
      queries.message = DatabaseStore.find(Message, messageId).include(Message.attributes.body);
    } else {
      queries.message = DatabaseStore.findAll(Message, { threadId: threadId || thread.id })
        .order(Message.attributes.date.descending())
        .include(Message.attributes.body)
        .limit(10)
        .then(messages => messages.find(m => !m.isHidden()));
    }

    return queries;
  }

  _finalizeAndPersistNewMessage(draft, { popout } = {}) {
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
    Actions.queueTask(task);

    return TaskQueue.waitForPerformLocal(task).then(() => {
      if (popout) {
        this._onPopoutDraft(draft.headerMessageId);
      }
      return { headerMessageId: draft.headerMessageId, draft };
    });
  }

  _createSession(headerMessageId, draft) {
    this._draftSessions[headerMessageId] = new DraftEditingSession(headerMessageId, draft);
    ipcRenderer.send('draft-arp', {headerMessageId});
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
  };

  _onPopoutDraft = async (headerMessageId, options = {}) => {
    if (headerMessageId == null) {
      throw new Error('DraftStore::onPopoutDraftId - You must provide a headerMessageId');
    }

    const session = await this.sessionForClientId(headerMessageId);
    this._draftsPopedOut[headerMessageId] = true;
    session.setPopout(true);
    await session.changes.commit();
    const draftJSON = session.draft().toJSON();
    // Since we pass a windowKey, if the popout composer draft already
    // exists we'll simply show that one instead of spawning a whole new
    // window.
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

  _onDestroyDraft = ({ accountId, headerMessageId, id, threadId }) => {
    const session = this._draftSessions[headerMessageId];

    // Immediately reset any pending changes so no saves occur
    if (session) {
      this._doneWithSession(session);
    }

    // Stop any pending tasks related to the draft
    this.cancelDraftTasks({ headerMessageId });

    // Queue the task to destroy the draft
    if (id) {
      this._draftsDeleting[id] = headerMessageId;
      delete this._draftsPopedOut[headerMessageId];
      this.trigger({ headerMessageId });
      Actions.queueTask(new DestroyDraftTask({ accountId, messageIds: [id], headerMessageId: headerMessageId }));
    } else {
      console.warn('Tried to delete a draft that had no ID assigned yet.');
    }
    if (AppEnv.isComposerWindow()) {
      AppEnv.close({ headerMessageId, threadId, windowLevel: 3 });
    }
  };
  _onDestroyDraftSuccess = ({ messageIds }) => {
    if (Array.isArray(messageIds)) {
      const headerMessageId = this._draftsDeleting[messageIds[0]];
      delete this._draftsDeleting[messageIds[0]];
      this.trigger({ headerMessageId });
    }
  };

  _onDestroyDraftFailed = ({ messageIds }) => {
    if (Array.isArray(messageIds)) {
      const headerMessageId = this._draftsDeleting[messageIds[0]];
      delete this._draftsDeleting[messageIds[0]];
      this.trigger({ headerMessageId });
    }
  };

  _onSendDraft = async (headerMessageId, options = {}) => {
    const {
      delay = AppEnv.config.get('core.sending.undoSend'),
      actionKey = DefaultSendActionKey,
    } = options;

    this._draftsSending[headerMessageId] = true;
    const sendAction = SendActionsStore.sendActionForKey(actionKey);
    if (!sendAction) {
      throw new Error(`Cant find send action ${actionKey} `);
    }

    const sendLaterMetadataValue = delay > 0 && {
      expiration: new Date(Date.now() + delay),
      isUndoSend: true,
      actionKey: actionKey,
    };

    // get the draft session, apply any last-minute edits and get the final draft.
    // We need to call `changes.commit` here to ensure the body of the draft is
    // completely saved and the user won't see old content briefly.
    const session = await this.sessionForClientId(headerMessageId);

    // move the draft to another account if necessary to match the from: field
    await session.ensureCorrectAccount();

    // remove inline attachments that are no longer in the body
    let draft = session.draft();
    const files = draft.files.filter(f => {
      return !(f.contentId && !draft.body.includes(`cid:${f.contentId}`));
    });
    if (files.length !== draft.files.length) {
      session.changes.add({ files });
    }

    // attach send-later metadata if a send delay is enabled
    if (sendLaterMetadataValue) {
      session.changes.addPluginMetadata('send-later', sendLaterMetadataValue);
    }
    await session.changes.commit();
    await session.teardown();

    // ensureCorrectAccount / commit may assign this draft a new ID. To move forward
    // we need to have the final object with it's final ID.
    draft = await DatabaseStore.findBy(Message, { headerMessageId, draft: true }).include(
      Message.attributes.body
    );
    // Directly update the message body cache so the user immediately sees
    // the new message text (and never old draft text or blank text) sending.
    await MessageBodyProcessor.updateCacheForMessage(draft);

    // At this point the message UI enters the sending state and the composer is unmounted.
    this.trigger({ headerMessageId });
    this._doneWithSession(session);

    // To be able to undo the send, we need to pretend that we added the send-later
    // metadata as it's own task so that the undo action is clear. We don't actually
    // want a separate SyncbackMetadataTask to be queued because a stray SyncbackDraftTask
    // could overwrite the metadata value back to null.
    if (sendLaterMetadataValue) {
      Actions.queueUndoOnlyTask(
        SyncbackMetadataTask.forSaving({
          pluginId: 'send-later',
          model: draft,
          value: sendLaterMetadataValue,
          undoValue: { expiration: null, isUndoSend: true },
        })
      );
      ipcRenderer.send('send-later-manager', 'send-later', headerMessageId, delay, actionKey);
    } else {
      // Immediately send the draft
      await sendAction.performSendAction({ draft });
    }

    if (AppEnv.isComposerWindow()) {
      AppEnv.close({ headerMessageId });
    }
  };

  _onSendDraftSuccess = ({ headerMessageId }) => {
    delete this._draftsSending[headerMessageId];
    this.trigger({ headerMessageId });
  };

  _onSendDraftFailed = ({ headerMessageId, threadId, errorMessage, errorDetail }) => {
    this._draftsSending[headerMessageId] = false;
    this.trigger({ headerMessageId });

    if (AppEnv.isMainWindow()) {
      // We delay so the view has time to update the restored draft. If we
      // don't delay the modal may come up in a state where the draft looks
      // like it hasn't been restored or has been lost.
      //
      // We also need to delay because the old draft window needs to fully
      // close. It takes windows currently (June 2016) 100ms to close by
      setTimeout(() => {
        const focusedThread = FocusedContentStore.focused('thread');
        if (threadId && focusedThread && focusedThread.id === threadId) {
          AppEnv.showErrorDialog(errorMessage, { detail: errorDetail });
        } else {
          Actions.composePopoutDraft(headerMessageId, { errorMessage, errorDetail });
        }
      }, 300);
    }
  };
}

export default new DraftStore();
