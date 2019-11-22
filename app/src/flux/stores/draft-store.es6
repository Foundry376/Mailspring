import { ipcRenderer } from 'electron';
import MailspringStore from 'mailspring-store';
import DraftEditingSession from './draft-editing-session';
import DraftFactory from './draft-factory';
import DatabaseStore from './database-store';
import SendActionsStore from './send-actions-store';
import SyncbackDraftTask from '../tasks/syncback-draft-task';
import SyncbackMetadataTask from '../tasks/syncback-metadata-task';
import SendDraftTask from '../tasks/send-draft-task';
import DestroyDraftTask from '../tasks/destroy-draft-task';
import Thread from '../models/thread';
import Message from '../models/message';
import Contact from '../models/contact';
import Actions from '../actions';
import TaskQueue from './task-queue';
import MessageBodyProcessor from './message-body-processor';
import SoundRegistry from '../../registries/sound-registry';
import * as ExtensionRegistry from '../../registries/extension-registry';
import MessageStore from './message-store';
import UndoRedoStore from './undo-redo-store';
import TaskFactory from '../tasks/task-factory';
import ChangeDraftToFailingTask from '../tasks/change-draft-to-failing-task';
import ChangeDraftToFailedTask from '../tasks/change-draft-to-failed-task';
import FocusedContentStore from './focused-content-store';
const { DefaultSendActionKey } = SendActionsStore;
const SendDraftTimeout = 300000;
const DraftFailingBaseTimeout = 120000;

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
    this.listenTo(Actions.draftDeliveryFailed, this._onSendDraftFailed);
    this.listenTo(Actions.draftDeliverySucceeded, this._onSendDraftSuccess);
    this.listenTo(Actions.sendingDraft, this._onSendingDraft);
    this.listenTo(Actions.destroyDraftFailed, this._onDestroyDraftFailed);
    this.listenTo(Actions.destroyDraftSucceeded, this._onDestroyDraftSuccess);
    this.listenTo(Actions.destroyDraft, this._onDestroyDrafts);
    this.listenTo(Actions.changeDraftAccount, this._onDraftAccountChange);
    if (AppEnv.isMainWindow()) {
      this.listenTo(Actions.composeReply, this._onComposeReply);
      this.listenTo(Actions.composeForward, this._onComposeForward);
      this.listenTo(Actions.cancelOutboxDrafts, this._onOutboxCancelDraft);
      this.listenTo(Actions.resendDrafts, this._onResendDraft);
      this.listenTo(Actions.editOutboxDraft, this._onEditOutboxDraft);
      this.listenTo(Actions.composeFailedPopoutDraft, this._onPopoutDraft);
      this.listenTo(Actions.composePopoutDraft, this._onPopoutDraft);
      this.listenTo(Actions.composeNewBlankDraft, this._onPopoutBlankDraft);
      this.listenTo(Actions.composeNewDraftToRecipient, this._onPopoutNewDraftToRecipient);
      this.listenTo(Actions.composeFeedBackDraft, this._onPopoutFeedbackDraft);
      this.listenTo(Actions.sendQuickReply, this._onSendQuickReply);
      this.listenTo(Actions.sendDraft, this._onSendDraft);
      this.listenTo(Actions.failingDraft, this._startDraftFailingTimeout);
      this.listenTo(Actions.draftOpenCount, this._onDraftOpenCount);
      this.listenTo(Actions.draftWindowClosing, this._onDraftWindowClosing);
      this.listenTo(TaskQueue, this._restartTimerForOldSendDraftTasks);
      this._startTime = Date.now();
      ipcRenderer.on('new-message', () => {
        // From app menu and shortcut
        Actions.composeNewBlankDraft();
      });

      ipcRenderer.on('composeFeedBack', (event, data) => {
        Actions.composeFeedBackDraft(data);
      });

      // send mail Immediately
      ipcRenderer.on('action-send-now', (event, headerMessageId, actionKey) => {
        Actions.sendDraft(headerMessageId, { actionKey, delay: 0 });
      });
    }
    ipcRenderer.on('action-send-cancelled', (event, headerMessageId, actionKey) => {
      AppEnv.debugLog(`Undo Send received ${headerMessageId}`);
      if (AppEnv.isMainWindow()) {
        AppEnv.debugLog(`Undo Send received ${headerMessageId} main window sending draftDeliveryCancelled`);
        Actions.draftDeliveryCancelled({ headerMessageId, actionKey });
      }
      this._onSendDraftCancelled({ headerMessageId });
    });
    // popout closed
    // ipcRenderer.on('draft-close-window', this._onPopoutClosed);
    // ipcRenderer.on('draft-got-new-id', this._onDraftGotNewId);
    // ipcRenderer.on('draft-arp', this._onDraftArp);
    // ipcRenderer.on('draft-delete', this._onDraftDeleting);
    AppEnv.onBeforeUnload(this._onBeforeUnload);

    this._draftSessions = {};
    this._draftsSending = {};
    this._draftSendindTimeouts = {};
    this._draftFailingTimeouts = {};
    this._draftsDeleting = {}; //Using messageId and headerMessageId
    this._draftsDeleted = {};
    this._draftsOpenCount = {};
    ipcRenderer.on('mailto', this._onHandleMailtoLink);
    ipcRenderer.on('mailfiles', this._onHandleMailFiles);
  }

  findFailedByHeaderMessageId({ headerMessageId }) {
    return DatabaseStore.findBy(Message, {
      headerMessageId: headerMessageId,
      draft: true,
    }).where([
      Message.attributes.state.in([
        Message.messageState.failed,
      ]),
    ]);
  }

  findByHeaderMessageId({ headerMessageId }) {
    return DatabaseStore.findBy(Message, {
      headerMessageId: headerMessageId,
      draft: true,
    }).where([
      Message.attributes.state.in([
        Message.messageState.normal,
        Message.messageState.saving,
        Message.messageState.sending,
        Message.messageState.updatingNoUID,
        Message.messageState.updatingHasUID,
        Message.messageState.failing,
      ]),
    ]);
  }
  findFailedByHeaderMessageIdWithBody({ headerMessageId }) {
    return this.findFailedByHeaderMessageId({ headerMessageId }).linkDB(Message.attributes.body);
  }

  findByHeaderMessageIdWithBody({ headerMessageId }) {
    return this.findByHeaderMessageId({ headerMessageId });
  }

  findAllWithBodyInDescendingOrder() {
    return MessageStore.findAllWithBodyInDescendingOrder().where({ draft: true });
  }

  /**
   Fetch a {DraftEditingSession} for displaying and/or editing the
   draft with `headerMessageId`.

   @param {String} headerMessageId - The headerMessageId of the draft.
   @param options
   @returns {Promise} - Resolves to an {DraftEditingSession} for the draft once it has been prepared
   */
  async sessionForClientId(headerMessageId, options = {}) {
    if (!headerMessageId) {
      throw new Error('DraftStore::sessionForClientId requires a headerMessageId');
    }
    if (!this._draftSessions[headerMessageId]) {
      this._draftSessions[headerMessageId] = this._createSession(headerMessageId, null, options);
    } else {
      const draft = this._draftSessions[headerMessageId].draft();
      if (!draft) {
        AppEnv.reportWarning('session exist, but not draft');
      } else if (!this._draftsOpenCount[headerMessageId]) {
        AppEnv.reportLog(
          `draft and session exist, but draftOpenCount not available, ${headerMessageId}, ${this._getCurrentWindowLevel()}`
        );
      } else {
        const thread = FocusedContentStore.focused('thread');
        const inFocusedThread = thread && thread.id === draft.threadId;
        if (
          AppEnv.isMainWindow() &&
          inFocusedThread &&
          !this._draftsOpenCount[headerMessageId][1]
        ) {
          AppEnv.logDebug(
            `Only trigger open draft count if in main window, in focus thread, and current opencount is not set`
          );
          this._onDraftOpenCount({
            headerMessageId,
            windowLevel: this._getCurrentWindowLevel(),
            source: `draft store, session already exist ${headerMessageId}, ${this._getCurrentWindowLevel()}`,
          });
        }
      }
    }
    AppEnv.logDebug(`waiting for ${headerMessageId} session.prepare()`);
    await this._draftSessions[headerMessageId].prepare();
    AppEnv.logDebug(`${headerMessageId} session.prepare() returned`);
    return this._draftSessions[headerMessageId];
  }

  async sessionForServerDraft(draft){
    const newDraft = DraftFactory.createNewDraftForEdit(draft);
    await this._finalizeAndPersistNewMessage(newDraft);
    return this._draftSessions[newDraft.headerMessageId];
  }

  // Public: Look up the sending state of the given draft headerMessageId.
  // In popout windows the existance of the window is the sending state.
  isSendingDraft(headerMessageId) {
    return (
      !!this._draftsSending[headerMessageId] ||
      false
    );
  }

  _restartTimerForOldSendDraftTasks() {
    if (!this._startTime) {
      AppEnv.logDebug(`previous tasks restarted, stop listening to taskQueue change`);
      this.stopListeningTo(TaskQueue);
      return;
    }
    AppEnv.logDebug(`restarting previous send draft tasks`);
    const pastSendDraftTasks = TaskQueue.queue().filter(t => {
      if (t instanceof SendDraftTask) {
        return t.createdAt && this._startTime && t.createdAt.getTime() < this._startTime;
      }
      return false;
    });
    this._startTime = null;
    pastSendDraftTasks.forEach(t => {
      if (t && t.draft) {
        AppEnv.logDebug(`Restarted SendDraft for draft: ${t.draft.headerMessageId}`);
        this._startSendingDraftTimeout({ draft: t.draft, source: 'Restart SendDraft' });
      }
    });
  }

  _onDraftAccountChange = async ({
    originalMessageId,
    originalHeaderMessageId,
    newParticipants,
  }) => {
    const session = this._draftSessions[originalHeaderMessageId];
    if (AppEnv.isComposerWindow() || AppEnv.isThreadWindow()) {
      if(session){
        this._doneWithSession(session, 'draft account change');
      }
      return;
    }
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
    const draftCount = this._draftsOpenCount[originalHeaderMessageId];
    await this._finalizeAndPersistNewMessage(newDraft, { popout: !draftCount[3] });
    Actions.changeDraftAccountComplete({ newDraftJSON: newDraft.toJSON() });
    this._onDestroyDrafts(
      [
        new Message(
          Object.assign({}, oldDraft, {
            headerMessageId: originalHeaderMessageId,
            id: originalMessageId,
          })
        ),
      ],
      { switchingAccount: true, canBeUndone: false },
    );
  };

  _doneWithDraft(headerMessageId, reason = 'unknown') {
    const session = this._draftSessions[headerMessageId];
    if (session) {
      this._doneWithSession(session, reason);
    }
  }

  _doneWithSession(session, reason = 'unknown') {
    if (!session) {
      AppEnv.reportError(
        new Error('Calling _doneWithSession when session is null'),
        {
          errorData: {
            sending: this._draftsSending,
            deleting: this._draftsDeleting,
            deleted: this._draftsDeleted,
            openCount: this._draftsOpenCount,
            reason,
          },
        },
        { grabLogs: true }
      );
      return;
    }
    session.teardown();
    delete this._draftSessions[session.headerMessageId];
    AppEnv.debugLog(`Session for ${session.headerMessageId} removed, reason: ${reason}`);
  }

  _cleanupAllSessions() {
    Object.values(this._draftSessions).forEach(session => {
      this._doneWithSession(session, '_cleanupAllSessions');
    });
  }

  // _onPopoutClosed = (event, options = {}) => {
  //   if (options.headerMessageId && this._draftSessions[options.headerMessageId]) {
  //     // console.log(`popout closed with header ${options.headerMessageId}`);
  //     delete this._draftsOpenCount[options.headerMessageId];
  //     this._draftSessions[options.headerMessageId].setPopout(false);
  //   }
  // };

  _onOutboxCancelDraft = ({ messages = [], source } = {}) => {
    const tasks = TaskFactory.tasksForCancellingOutboxDrafts({ messages, source });
    if (tasks && tasks.length > 0) {
      Actions.queueTasks(tasks);
    } else {
      AppEnv.reportError(
        new Error('Tasks for cancellingOutboxDraft is empty'),
        {
          errorData: {
            messages,
            source,
          },
        },
        { grabLogs: true },
      );
    }
    messages.forEach(message => {
      if (message) {
        const session = this._draftSessions[message.headerMessageId];
        if (session) {
          this._doneWithSession(session, 'CancelDraft');
        }
        const sending = this._draftsSending[message.headerMessageId];
        if (sending) {
          this._onSendDraftCancelled({ headerMessageId: message.headerMessageId, resumeSession: false });
        }
        const deleting = this._draftsDeleting[message.headerMessageId];
        if (deleting) {
          delete this._draftsDeleting[message.headerMessageId];
        }
      }
    });
  };

  _onResendDraft = ({ messages = [], source= '' } = {}) => {
    const tasks = [];
    messages.forEach(message => {
      tasks.push(SendDraftTask.forSending(message));
    });
    if (tasks && tasks.length > 0) {
      Actions.queueTasks(tasks);
    } else {
      AppEnv.reportError(
        new Error('Tasks for cancellingOutboxDraft is empty'),
        {
          errorData: {
            messages,
            source,
          },
        },
        { grabLogs: true },
      );
    }
  };
  _onDraftOpenCount = ({ headerMessageId, windowLevel=0, source='' }) => {
    if (!AppEnv.isMainWindow()) {
      AppEnv.logWarning(`open count not main window source: ${source}`);
      return;
    }
    if (windowLevel === 0) {
      AppEnv.reportError(new Error('draftOpenCount action windowLevel is 0, wrong parameters'));
      return;
    }
    AppEnv.logDebug(`${headerMessageId} open count source: ${source} windowLevel: ${windowLevel}`);
    if (!this._draftsOpenCount[headerMessageId]) {
      this._draftsOpenCount[headerMessageId] = {
        1: false,
        2: false,
        3: false,
      };
    }
    this._draftsOpenCount[headerMessageId][windowLevel] = true;
    if (AppEnv.isMainWindow()) {
      if (windowLevel > 1) {
        const session = this._draftSessions[headerMessageId];
        if (session) {
          session.setPopout(true);
        } else {
          AppEnv.debugLog(
            `No session but draft is open in none main window, ${headerMessageId} from window ${windowLevel}`
          );
          this.sessionForClientId(headerMessageId).then(session => {
            AppEnv.debugLog(
              `Session created in main because none main window draft open ${headerMessageId}, window ${windowLevel}`
            );
            session.setPopout(true);
          });
        }
      }
      Actions.draftOpenCountBroadcast({
        headerMessageId,
        data: this._draftsOpenCount[headerMessageId],
      });
    }
  };

  _onDraftWindowClosing = ({ headerMessageIds = [], windowLevel = 0, source = '' } = {}) => {
    if (!AppEnv.isMainWindow()) {
      AppEnv.logDebug(`draft closing, not main window source: ${source}`);
      return;
    }
    AppEnv.logDebug(`draft closing ${source}, ${headerMessageIds}, window level ${windowLevel}`);
    headerMessageIds.forEach(headerMessageId => {
      if (this._draftsOpenCount[headerMessageId]) {
        this._draftsOpenCount[headerMessageId][windowLevel] = false;
      }
      const openDrafts = this._draftsOpenCount[headerMessageId];
      if(!openDrafts){
        return;
      }
      const allClosed = !openDrafts[`1`] && !openDrafts['2'] && !openDrafts['3'];
      if (allClosed) {
        delete this._draftsOpenCount[headerMessageId];
        this._onLastOpenDraftClosed(headerMessageId);
      } else {
        Actions.draftOpenCountBroadcast({
          headerMessageId,
          data: this._draftsOpenCount[headerMessageId],
        });
      }
    });
  };
  _onLastOpenDraftClosed = headerMessageId => {
    if (this._draftsDeleted[headerMessageId] || this._draftsDeleting[headerMessageId]) {
      AppEnv.logDebug(`lastOpenDraftClosed draft ${headerMessageId} was delete`);
      delete this._draftsDeleted[headerMessageId];
      this._doneWithDraft(headerMessageId, 'onLastOpenDraftClosed:reason draft was delete');
      return;
    }
    if (this._draftsSending[headerMessageId]) {
      AppEnv.logDebug(`lastOpenDraftClosed draft ${headerMessageId} was sending`);
      this._doneWithDraft(headerMessageId, 'onLastOpenDraftClosed:draft was sending');
      return;
    }
    const session = this._draftSessions[headerMessageId];
    if (!session) {
      AppEnv.reportError(
        `lastOpenDraftClosed draft session not available, headerMessageId ${headerMessageId}`,{
          errorData: {
            sending: this._draftsSending,
            deleting: this._draftsDeleting,
            deleted: this._draftsDeleted,
            openCount: this._draftsOpenCount,
          },
        },
        { grabLogs: true }
      );
      return;
    }
    const draft = session.draft();
    if (!draft) {
      AppEnv.reportError(
        new Error(`session has no draft, headerMessageId ${headerMessageId}`),
        {
          errorData: {
            sending: this._draftsSending,
            deleting: this._draftsDeleting,
            deleted: this._draftsDeleted,
            openCount: this._draftsOpenCount,
          },
        },
        { grabLogs: true }
      );
    }
    let cancelCommits = false;
    if (draft.pristine && !draft.hasRefOldDraftOnRemote) {
      if (
        this._draftsDeleting[draft.headerMessageId] ||
        this._draftsDeleted[draft.headerMessageId]
      ) {
        AppEnv.reportError(
          new Error(`Draft is deleting, should not have send delete again ${headerMessageId}`),
          {
            errorData: {
              sending: this._draftsSending,
              deleting: this._draftsDeleting,
              deleted: this._draftsDeleted,
              openCount: this._draftsOpenCount,
            },
          },
          { grabLogs: true }
        );
      } else if (this._draftsSending[draft.headerMessageId]) {
        AppEnv.reportError(
          new Error(`Draft is sending, should not have send delete again ${headerMessageId}`),
          {
            errorData: {
              sending: this._draftsSending,
              deleting: this._draftsDeleting,
              deleted: this._draftsDeleted,
              openCount: this._draftsOpenCount,
            },
          },
          { grabLogs: true }
        );
      } else {
        // console.log('draft have no change and not on remote, destroying');
        Actions.destroyDraft([draft], { canBeUndone: false, source: 'onLastOpenDraftClosed' });
        cancelCommits = true;
      }
    }
    session.closeSession({ cancelCommits, reason: 'onLastOpenDraftClosed' });
    this._doneWithDraft(headerMessageId, 'onLastOpenDraftClosed');
  };

  _onBeforeUnload = readyToUnload => {
    if (AppEnv.isOnboardingWindow() || AppEnv.isEmptyWindow()) {
      AppEnv.reportWarning(`Is not proper window and is empty window ${AppEnv.isEmptyWindow()}`);
      return true;
    }
    const promises = [];
    if (!AppEnv.isMainWindow()) {
      AppEnv.debugLog('closing none main window');
      if (AppEnv.isComposerWindow()) {
        const keys = Object.keys(this._draftSessions);
        if (keys.length > 1) {
          AppEnv.reportError(
            new Error(
              `More than one session remaining when closing composer window sessions: ${JSON.stringify(
                keys,
              )}`,
              {},
              { grabLogs: true },
            ),
          );
          return true;
        }
      }
      Actions.draftWindowClosing({
        headerMessageIds: Object.keys(this._draftSessions),
        source: 'beforeUnload',
        windowLevel: this._getCurrentWindowLevel(),
      });
    } else {
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

        // Only delete pristine drafts and is not from server, aka remoteUID=0.
        // Because we are moving all actions to main window,
        // thus if main window is closed, we should be closing all other windows.
        if (draft.pristine && !draft.remoteUID) {
          if (!this._draftsDeleting[draft.id]) {
            promises.push(Actions.destroyDraft([draft], { canBeUndone: false }));
          }
        } else {
          promises.push(session.closeSession({ reason: 'onBeforeUnload' }));
        }
        // else if (
        //   AppEnv.isMainWindow() &&
        //   (session.changes.isDirty() || session.needUpload()) &&
        //   !session.isPopout() &&
        //   !this._draftsDeleting[draft.id]
        // ) {
        //   promises.push(session.changes.commit('unload'));
        // } else if (
        //   !AppEnv.isMainWindow() &&
        //   (session.changes.isDirty() || session.needUpload()) &&
        //   !session.isPopout() &&
        //   !this._draftsDeleting[draft.id]
        // ) {
        //   promises.push(session.changes.commit('unload'));
        // }
        // promises.push(ipcRenderer.send('close-window', {
        //   headerMessageId: draft.headerMessageId,
        //   threadId: draft.threadId,
        //   windowLevel: this._getCurrentWindowLevel(),
        //   additionalChannelParam: 'draft',
        // }));
      });
    }
    if (promises.length > 0) {
      let done = () => {
        done = null;
        this._draftSessions = {};
        // We have to wait for accumulateAndTrigger() in the DatabaseStore to
        // send events to ActionBridge before closing the window.
        setTimeout(readyToUnload, 15);
        AppEnv.debugLog('running done()');
      };

      // Stop and wait before closing, but never wait for more than 700ms.
      // We may not be able to save the draft once the main window has closed
      // and the mailsync bridge is unavailable, don't want to hang forever.
      setTimeout(() => {
        if (done) {
          AppEnv.debugLog('we waited long enough');
          done();
        }
      }, 700);
      Promise.all(promises).then(() => {
        if (done) done();
      });
      return false;
    }

    // Continue closing
    return true;
  };
  // _onDraftIdChange = change => {
  //   const draftsHeaderMessageId = Object.keys(this._draftSessions);
  //   const nextDraft = change.objects
  //     .filter(obj => draftsHeaderMessageId.includes(obj.headerMessageId))
  //     .pop();
  //
  //   if (!nextDraft) {
  //     return;
  //   }
  //   if (
  //     this._draftSessions[nextDraft.headerMessageId] &&
  //     this._draftSessions[nextDraft.headerMessageId].draft() &&
  //     !this._draftSessions[nextDraft.headerMessageId].inView()
  //   ) {
  //     this._draftSessions[nextDraft.headerMessageId].updateDraftId(nextDraft.id);
  //   }
  // };

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
          this._cancelSendingDraftTimeout({ headerMessageId: draft.headerMessageId });
        }
      }
    }

    // allow draft editing sessions to update
    this.trigger(change);
    // update drafts that are not in view;
    // this._onDraftIdChange(change);
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

        // const t = new SyncbackDraftTask({ draft });
        // // console.error('send quickly');
        // Actions.queueTask(t);
        // TaskQueue.waitForPerformLocal(t)

        this._finalizeAndPersistNewMessage(draft).then(() => {
          Actions.sendDraft(draft.headerMessageId);
        }).catch(e =>{
          AppEnv.grabLogs()
            .then(filename => {
              if (typeof filename === 'string' && filename.length > 0) {
                AppEnv.reportError(new Error('SyncbackDraft Task not returned'), { errorData: e, files: [filename] });
              }
            })
            .catch(e => {
              AppEnv.reportError(new Error('Quick reply failed'));
            });
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
    Actions.queueTask(task);

    return TaskQueue.waitForPerformLocal(task)
      .then(() => {
        if (popout) {
          console.log('\n-------\n draft popout\n');
          this._onPopoutDraft(draft.headerMessageId);
        }
        if (originalMessageId) {
          Actions.draftReplyForwardCreated({ messageId: originalMessageId, type: messageType });
        }
        return { headerMessageId: draft.headerMessageId, draft };
      })
      .catch(t => {
        AppEnv.grabLogs()
          .then(filename => {
            if (typeof filename === 'string' && filename.length > 0) {
              AppEnv.reportError(new Error('SyncbackDraft Task not returned'), { errorData: task, files: [filename] });
            }
          })
          .catch(e => {
            AppEnv.reportError(new Error('SyncbackDraft Task not returned'));
          });
        return { headerMessageId: draft.headerMessageId, draft };
      });
  }

  _createSession(headerMessageId, draft, options = {}) {
    // console.error('creat draft session');
    this._draftSessions[headerMessageId] = new DraftEditingSession(headerMessageId, draft, options);
    return this._draftSessions[headerMessageId];
  }

  _onPopoutFeedbackDraft = async ({ to, subject = '' } = {}) => {
    const toContact = Contact.fromObject(to);
    const draft = await DraftFactory.createDraft({ to: [toContact], subject: subject });
    await this._finalizeAndPersistNewMessage(draft, { popout: true });
  };

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

  _onEditOutboxDraft = async (headerMessageId, options = {}) => {
    if (headerMessageId == null) {
      throw new Error('DraftStore::onPopoutDraftId - You must provide a headerMessageId');
    }
    this._onPopoutDraft(headerMessageId, {source: 'edit outbox draft', forceCommit: true, showFailed: true});
  };

  _onPopoutDraft = async (headerMessageId, options = {}) => {
    if (headerMessageId == null) {
      throw new Error('DraftStore::onPopoutDraftId - You must provide a headerMessageId');
    }
    if (options.source) {
      AppEnv.logDebug(`Draft ${headerMessageId} popedout because ${options.source}`);
    }
    const session = await this.sessionForClientId(headerMessageId, options);
    const draft = session.draft();
    if (!draft) {
      AppEnv.reportError(
        new Error(
          `DraftStore::onPopoutDraft - session.draft() is false, draft not ready. headerMessageId: ${headerMessageId}`,
        ),
      );
      return;
    }
    if (draft.savedOnRemote) {
      this._doneWithSession(session, 'savedOnRemote');
      this.sessionForServerDraft(draft).then(newSession => {
        const newDraft = newSession.draft();
        newSession.setPopout(true);
        newSession.needUpload = true;
        const draftJSON = newSession.draft().toJSON();
        AppEnv.newWindow({
          hidden: true, // We manually show in ComposerWithWindowProps::onDraftReady
          headerMessageId: newDraft.headerMessageId,
          windowType: 'composer',
          windowKey: `composer-${newDraft.headerMessageId}`,
          windowProps: Object.assign(options, { headerMessageId: newDraft.headerMessageId, draftJSON }),
          title: ' ',
          threadId: newSession.draft().threadId,
        });
      });
    } else {
      const messageId = session.draft().id;
      if (this._draftsDeleting[messageId] || this.isSendingDraft(headerMessageId)) {
        AppEnv.reportError(
          new Error(
            `Attempting to open draft-id:${messageId} when it is being deleted or sending. this._draftDeleting: ${this._draftsDeleting}, this._draftSending: ${this._draftsSending}`,
          ),
        );
        return;
      }
      if (options.forceCommit) {
        await session.changes.commit('force');
      } else {
        await session.changes.commit();
      }
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
        title: ' ',
        threadId: session.draft().threadId,
      });
    }
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

  _onDestroyDrafts = (messages = [], opts = {}) => {
    if (AppEnv.isThreadWindow()) {
      // console.log('on destroy draft is thread window');
      return;
    }
    if (AppEnv.isComposerWindow() && messages.length === 1) {
      if (this._draftSessions[messages[0].headerMessageId] && !opts.switchingAccount) {
        AppEnv.logDebug(`Closing composer because of destroy draft ${messages[0].headerMessageId}`);
        AppEnv.close({
          headerMessageId: messages[0].headerMessageId,
          threadId: messages[0].threadId,
          windowLevel: this._getCurrentWindowLevel(),
          additionalChannelParam: 'draft',
          deleting: true,
        });
      } else {
        AppEnv.logDebug(`${messages[0].headerMessageId} not this draft or is switching account ${opts.switchingAccount}`);
      }
      return;
    }
    if(!AppEnv.isMainWindow()){
      // console.log('on destroy draft is not main window');
      return;
    }
    // console.log('destroying draft');
    const tasks = [];
    if (!Array.isArray(messages) && messages instanceof Message) {
      messages = [messages];
      AppEnv.reportWarning(new Error('destroy draft still using single draft'));
    } else if (!Array.isArray(messages)) {
      return;
    }
    messages.forEach(message => {
      this._onDestroyDraft(message, opts);
    });
    tasks.push(
      ...TaskFactory.tasksForMessagesByAccount(messages, ({ accountId, messages: msgs }) => {
        const ids = [];
        msgs.forEach(msg => {
          ids.push(msg.id);
        });
        return new DestroyDraftTask({
          canBeUndone: opts.canBeUndone,
          accountId,
          messageIds: ids,
          source: opts.source || ''
        });
      }),
    );
    if (tasks.length > 0) {
      Actions.queueTasks(tasks);
    }
  };

  _onDestroyDraft = (message = {}, opts = {}) => {
    // console.log('on destroy draft');
    const { headerMessageId, id } = message;
    if(this._draftsDeleting[id] || this._draftsDeleted[headerMessageId]){
      AppEnv.reportError(new Error(`Draft is already deleting`), {
        errorData: { draftsDeleting: this._draftsDeleting, currentDraft: message },
      });
      return;
    }
    let draftDeleting = false;
    if (id) {
      draftDeleting = !!this._draftsDeleting[id];
      this._draftsDeleting[id] = headerMessageId;
      this._draftsDeleting[headerMessageId] = id;
    }
    const session = this._draftSessions[headerMessageId];
    if (session && !draftDeleting) {
      if (this._draftsSending[headerMessageId]) {
        return;
      }
      const openCount = this._draftsOpenCount[headerMessageId];
      if (!openCount) {
        if (opts.source !== 'onLastOpenDraftClosed') {
          AppEnv.logError(`no open count in destroy draft from source ${opts.source}`);
        }
      } else if (openCount['3'] && opts.allowNewDraft) {
        const oldDraft = session.draft();
        if (!oldDraft) {
          AppEnv.logError('session does not have draft for composer opened draft');
        } else {
          // const oldHeaderMessageId = oldDraft.headerMessageId;
          // const oldMessageId = oldDraft.id;
          const draft = DraftFactory.duplicateDraftBecauseOfNewId(oldDraft);
          if (draft) {
            this._finalizeAndPersistNewMessage(draft).then(() => {
              // console.log('new draft');
              this._onPopoutDraft(draft.headerMessageId, { newDraft: false });
            });
          }
        }
      }
      session.closeSession({ cancelCommits: true, reason: 'onDestroyDraft' });
    }
    if (id) {
      if (!draftDeleting) {
        this.trigger({ headerMessageId });
      }
    } else {
      AppEnv.reportError(new Error('Tried to delete a draft that had no ID assigned yet.'));
    }
  };
  // _onDraftDeleting = (event, options) => {
  //   if (Array.isArray(options.messageIds) && Array.isArray(options.headerMessageIds) && options.messageIds.length === options.headerMessageIds.length) {
  //     for(let i = 0; i< options.messageIds.length; i++){
  //       this._draftsDeleting[options.messageIds[i]] = options.headerMessageIds[i];
  //     }
  //   }
  // };
  _onDestroyDraftSuccess = ({ messageIds }) => {
    AppEnv.logDebug('destroy draft succeeded');
    if (Array.isArray(messageIds)) {
      const headerMessageIds = [];
      messageIds.forEach(id =>{
        if(id){
          const headerMessageId = this._draftsDeleting[id];
          headerMessageIds.push(headerMessageId);
          delete this._draftsDeleting[headerMessageId];
          delete this._draftsDeleting[id];
        }
      });
      this.trigger({ headerMessageIds });
      headerMessageIds.forEach(headerMessageId => {
        if(this._draftsOpenCount[headerMessageId]){
          this._draftsDeleted[headerMessageId] = true;
        }
      });
    }
  };

  _onDestroyDraftFailed = ({ messageIds, key, debuginfo }) => {
    AppEnv.logDebug('destroy draft failed');
    if (Array.isArray(messageIds)) {
      const headerMessageIds = [];
      messageIds.forEach(id =>{
        if(id){
          const headerMessageId = this._draftsDeleting[id];
          headerMessageIds.push(headerMessageId);
          delete this._draftsDeleting[headerMessageId];
          delete this._draftsDeleting[id];
        }
      });
      this.trigger({ headerMessageIds });
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
      AppEnv.grabLogs()
        .then(filename => {
          if (typeof filename === 'string' && filename.length > 0) {
            AppEnv.reportError(
              new Error(
                `Sending draft: ${headerMessageId}, took more than ${SendDraftTimeout /
                  1000} seconds`
              ),
              { files: [filename] }
            );
          }
        })
        .catch(e => {
          AppEnv.reportError(
            new Error(`Sending draft: ${headerMessageId}, took more than ${SendDraftTimeout / 1000} seconds`),
          );
        });
    }
    if (trigger) {
      this.trigger({ headerMessageId });
    }
  };
  _startSendingDraftTimeout = ({ draft, source = '' }) => {
    if (this._draftSendindTimeouts[draft.headerMessageId]) {
      clearTimeout(this._draftSendindTimeouts[draft.headerMessageId]);
    }
    this._startDraftFailingTimeout({ messages: [draft] });
    this._draftsSending[draft.headerMessageId] = true;
    console.log('setting draftsSending to true');
    this._draftSendindTimeouts[draft.headerMessageId] = setTimeout(() => {
      this._cancelSendingDraftTimeout({
        headerMessageId: draft.headerMessageId,
        trigger: true,
        changeSendStatus: false,
        source,
      });
      const task = new ChangeDraftToFailedTask({ headerMessageIds: [draft.headerMessageId], accountId: draft.accountId });
      Actions.queueTask(task);
    }, SendDraftTimeout);
  };
  _cancelDraftFailingTimeout = ({ headerMessageId, source = ''}) =>{
    if(this._draftFailingTimeouts[headerMessageId]){
      clearTimeout(this._draftFailingTimeouts[headerMessageId]);
      delete this._draftFailingTimeouts[headerMessageId];
    }
  };
  _startDraftFailingTimeout = ({ messages = [], source = ''}) => {
    messages.forEach(msg => {
      if (msg && msg.draft) {
        if (this._draftFailingTimeouts[msg.headerMessageId]) {
          clearTimeout(this._draftFailingTimeouts[msg.headerMessageId]);
        }
        this._draftFailingTimeouts[msg.headerMessageId] = setTimeout(() => {
          const task = new ChangeDraftToFailingTask({ messages: [msg], accountId: msg.accountId });
          Actions.queueTask(task);
        }, DraftFailingBaseTimeout);
      }
    });
  };
  _onSendingDraft = async ({ headerMessageId, windowLevel }) => {
    if (AppEnv.isComposerWindow()) {
      if (this._draftSessions[headerMessageId]) {
        AppEnv.close({
          headerMessageId,
          windowLevel: this._getCurrentWindowLevel(),
        });
      } else {
        AppEnv.logDebug(`${headerMessageId} not this draft sending`);
      }
      return;
    }
    if (this._getCurrentWindowLevel() !== windowLevel) {
      const session = await this.sessionForClientId(headerMessageId);
      if (session) {
        if (AppEnv.isMainWindow()) {
          const draft = session.draft();
          if (draft) {
            this._startSendingDraftTimeout({ draft: session.draft });
          } else {
            AppEnv.reportWarning(
              new Error(
                `session no longer have draft for ${headerMessageId} at window: ${windowLevel}`
              )
            );
          }
        } else {
          // At this point it is thread
          AppEnv.debugLog(`Thread window triggered send ${headerMessageId}`);
          this._draftsSending[headerMessageId] = true;
        }
        this._doneWithSession(session, 'onSendingDraft');
      } else {
        console.log('session not here');
        if (AppEnv.isMainWindow()) {
          AppEnv.reportError(
            new Error(`session not found for ${headerMessageId} at window: ${windowLevel}`)
          );
        }
      }
      this.trigger({ headerMessageId });
    }
  };

  _onSendDraft = async (headerMessageId, options = {}) => {
    if(!AppEnv.isMainWindow()){
      AppEnv.logDebug('send draft, not main window');
      return;
    }
    if (this._draftsSending[headerMessageId]) {
      AppEnv.reportError(
        new Error(
          `sending draft when draft is already sending ${headerMessageId} at window: ${this._getCurrentWindowLevel()}`
        ),
        {
          errorData: {
            sending: this._draftsSending,
            deleting: this._draftsDeleting,
            deleted: this._draftsDeleted,
            openCount: this._draftsOpenCount,
          },
        },
        { grabLogs: true }
      );
      return;
    }
    if (this._draftsDeleted[headerMessageId] || this._draftsDeleting[headerMessageId]) {
      AppEnv.reportError(
        new Error(
          `sending draft when draft is already deleting/deleted ${headerMessageId} at window: ${this._getCurrentWindowLevel()}`,
          {
            errorData: {
              sending: this._draftsSending,
              deleting: this._draftsDeleting,
              deleted: this._draftsDeleted,
              openCount: this._draftsOpenCount,
            },
          },
          { grabLogs: true }
        )
      );
      return;
    }
    const {
      delay = AppEnv.config.get('core.task.delayInMs'),
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
    const session = this._draftSessions[headerMessageId];
    if (!session) {
      AppEnv.reportError(
        new Error(`session missing ${headerMessageId}`),
        {
          errorData: {
            sending: this._draftsSending,
            deleting: this._draftsDeleting,
            deleted: this._draftsDeleted,
            openCount: this._draftsOpenCount,
          },
        },
        { grabLogs: true }
      );
      return;
    }
    session.cancelCommit();

    // get the draft session, apply any last-minute edits and get the final draft.
    // We need to call `changes.commit` here to ensure the body of the draft is
    // completely saved and the user won't see old content briefly.
    // const session = await this.sessionForClientId(headerMessageId);
    // if (session.isPopout()) {
    //   // Do nothing if session have popouts
    //   return;
    // }

    // move the draft to another account if necessary to match the from: field
    // await session.ensureCorrectAccount();

    let draft = session.draft();

    // remove inline attachments that are no longer in the body
    const files = draft.files.filter(f => {
      return !(f.contentId && f.isInline && !draft.body.includes(`cid:${f.contentId}`));
    });
    if (files.length !== draft.files.length) {
      session.changes.add({ files });
    }
    draft.files = files;

    // attach send-later metadata if a send delay is enabled
    if (sendLaterMetadataValue) {
      session.changes.addPluginMetadata('send-later', sendLaterMetadataValue);
    }
    await session.changes.commit('send draft');
    AppEnv.logDebug(`Committing draft before sending for ${headerMessageId}`);
    // ensureCorrectAccount / commit may assign this draft a new ID. To move forward
    // we need to have the final object with it's final ID.
    // draft = await DatabaseStore.findBy(Message, { headerMessageId, draft: true, state: 0 }).include(
    //   Message.attributes.body,
    // );
    // Directly update the message body cache so the user immediately sees
    // the new message text (and never old draft text or blank text) sending.
    await MessageBodyProcessor.updateCacheForMessage(draft);

    this._doneWithSession(session, 'onSendDraft');
    // Notify all windows that draft is being send out.
    Actions.sendingDraft({ headerMessageId, windowLevel: this._getCurrentWindowLevel() });
    this._startSendingDraftTimeout({ draft });
    // At this point the message UI enters the sending state and the composer is unmounted.
    this.trigger({ headerMessageId });
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
        taskPurged: () => {
          this._onSendDraftCancelled({ headerMessageId });
        },
      });
      Actions.queueUndoOnlyTask(undoTask);
      // ipcRenderer.send('send-later-manager', 'send-later', headerMessageId, delay, actionKey, draft.threadId);
    } else {
      // Immediately send the draft
      // await sendAction.performSendAction({ draft });
    }
  };

  _onSendDraftSuccess = ({ headerMessageId }) => {
    this._cancelSendingDraftTimeout({ headerMessageId });
    this._cancelDraftFailingTimeout({ headerMessageId });
    this.trigger({ headerMessageId });
  };
  _onSendDraftCancelled = ({ headerMessageId }) => {
    this._cancelSendingDraftTimeout({ headerMessageId });
    this._cancelDraftFailingTimeout({ headerMessageId });
    this.trigger({ headerMessageId });
  };

  _onSendDraftFailed = ({ headerMessageId, threadId, errorMessage, errorDetail }) => {
    this._cancelSendingDraftTimeout({ headerMessageId });
    this._cancelDraftFailingTimeout({ headerMessageId });
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
