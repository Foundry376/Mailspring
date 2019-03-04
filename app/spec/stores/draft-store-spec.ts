import {
  Thread,
  Actions,
  Contact,
  Message,
  Account,
  DraftStore,
  DatabaseStore,
  SoundRegistry,
  DestroyDraftTask,
  ComposerExtension,
  ExtensionRegistry,
  FocusedContentStore,
} from 'mailspring-exports';

import { remote } from 'electron';
import DraftFactory from '../../src/flux/stores/draft-factory';

class TestExtension extends ComposerExtension {
  static prepareNewDraft({ draft }) {
    draft.body = `Edited by TestExtension! ${draft.body}`;
  }
}

xdescribe('DraftStore', function draftStore() {
  beforeEach(() => {
    this.fakeThread = new Thread({ id: 'fake-thread', headerMessageId: 'fake-thread' });
    this.fakeMessage = new Message({ id: 'fake-message', headerMessageId: 'fake-message' });

    spyOn(AppEnv, 'newWindow').andCallFake(() => {});
    spyOn(DatabaseStore, 'run').andCallFake(query => {
      if (query._klass === Thread) {
        return Promise.resolve(this.fakeThread);
      }
      if (query._klass === Message) {
        return Promise.resolve(this.fakeMessage);
      }
      if (query._klass === Contact) {
        return Promise.resolve(null);
      }
      return Promise.reject(new Error(`Not Stubbed for class ${query._klass.name}`));
    });

    for (const headerMessageId of Object.keys(DraftStore._draftSessions)) {
      const sess = DraftStore._draftSessions[headerMessageId];
      if (sess.teardown) {
        DraftStore._doneWithSession(sess);
      }
    }
    DraftStore._draftSessions = {};
  });

  describe('creating and opening drafts', () => {
    beforeEach(() => {
      const draft = new Message({ id: 'A', subject: 'B', headerMessageId: 'A', body: '123' });
      this.newDraft = draft;
      spyOn(DraftFactory, 'createDraftForReply').andReturn(Promise.resolve(draft));
      spyOn(DraftFactory, 'createOrUpdateDraftForReply').andReturn(Promise.resolve(draft));
      spyOn(DraftFactory, 'createDraftForForward').andReturn(Promise.resolve(draft));
      spyOn(DraftFactory, 'createDraft').andReturn(Promise.resolve(draft));
    });

    it('should always attempt to focus the new draft', () => {
      DraftStore._onComposeReply({
        threadId: this.fakeThread.id,
        messageId: this.fakeMessage.id,
        type: 'reply',
        behavior: 'prefer-existing',
      });
      advanceClock();
      advanceClock();
    });

    describe('context', () => {
      it('can accept IDs for thread and message arguments', () => {
        DraftStore._onComposeReply({
          threadId: this.fakeThread.id,
          messageId: this.fakeMessage.id,
          type: 'reply',
          behavior: 'prefer-existing',
        });
        advanceClock();
        expect(DraftFactory.createOrUpdateDraftForReply).toHaveBeenCalledWith({
          thread: this.fakeThread,
          message: this.fakeMessage,
          type: 'reply',
          behavior: 'prefer-existing',
        });
      });

      it('can accept models for thread and message arguments', () => {
        DraftStore._onComposeReply({
          thread: this.fakeThread,
          message: this.fakeMessage,
          type: 'reply',
          behavior: 'prefer-existing',
        });
        advanceClock();
        expect(DraftFactory.createOrUpdateDraftForReply).toHaveBeenCalledWith({
          thread: this.fakeThread,
          message: this.fakeMessage,
          type: 'reply',
          behavior: 'prefer-existing',
        });
      });

      it('can accept only a thread / threadId, and use the last message on the thread', () => {
        DraftStore._onComposeReply({
          thread: this.fakeThread,
          type: 'reply',
          behavior: 'prefer-existing',
        });
        advanceClock();
        expect(DraftFactory.createOrUpdateDraftForReply).toHaveBeenCalledWith({
          thread: this.fakeThread,
          message: this.fakeMessage,
          type: 'reply',
          behavior: 'prefer-existing',
        });
      });
    });

    describe('popout behavior', () => {
      it('can popout a reply', () => {
        runs(() => {
          DraftStore._onComposeReply({
            threadId: this.fakeThread.id,
            messageId: this.fakeMessage.id,
            type: 'reply',
            popout: true,
          });
        });
        waitsFor(() => {
          return DatabaseWriter.prototype.persistModel.callCount > 0;
        });
        runs(() => {
          expect(AppEnv.newWindow).toHaveBeenCalledWith({
            title: 'Message',
            hidden: true,
            windowKey: `composer-A`,
            windowType: 'composer',
            windowProps: { draftHeaderMessageId: 'A', draftJSON: this.newDraft.toJSON() },
          });
        });
      });

      it('can popout a forward', () => {
        runs(() => {
          DraftStore._onComposeForward({
            threadId: this.fakeThread.id,
            messageId: this.fakeMessage.id,
            popout: true,
          });
        });
        waitsFor(() => {
          return DatabaseWriter.prototype.persistModel.callCount > 0;
        });
        runs(() => {
          expect(AppEnv.newWindow).toHaveBeenCalledWith({
            title: 'Message',
            hidden: true,
            windowKey: `composer-A`,
            windowType: 'composer',
            windowProps: { draftHeaderMessageId: 'A', draftJSON: this.newDraft.toJSON() },
          });
        });
      });
    });
  });

  describe('onDestroyDraft', () => {
    beforeEach(() => {
      this.draftSessionTeardown = jasmine.createSpy('draft teardown');
      this.session = {
        draft() {
          return { pristine: false };
        },
        changes: {
          commit() {
            return Promise.resolve();
          },
          teardown() {},
        },
        teardown: this.draftSessionTeardown,
      };
      DraftStore._draftSessions = { abc: this.session };
      spyOn(Actions, 'queueTask');
    });

    it('should teardown the draft session, ensuring no more saves are made', () => {
      DraftStore._onDestroyDraft('abc');
      expect(this.draftSessionTeardown).toHaveBeenCalled();
    });

    it('should not throw if the draft session is not in the window', () => {
      expect(() => DraftStore._onDestroyDraft('other')).not.toThrow();
    });

    it('should queue a destroy draft task', () => {
      DraftStore._onDestroyDraft('abc');
      expect(Actions.queueTask).toHaveBeenCalled();
      expect(Actions.queueTask.mostRecentCall.args[0] instanceof DestroyDraftTask).toBe(true);
    });

    it('should clean up the draft session', () => {
      spyOn(DraftStore, '_doneWithSession');
      DraftStore._onDestroyDraft('abc');
      expect(DraftStore._doneWithSession).toHaveBeenCalledWith(this.session);
    });

    it("should close the window if it's a popout", () => {
      spyOn(AppEnv, 'close');
      spyOn(AppEnv, 'isComposerWindow').andReturn(true);
      DraftStore._onDestroyDraft('abc');
      expect(AppEnv.close).toHaveBeenCalled();
    });

    it("should NOT close the window if isn't a popout", () => {
      spyOn(AppEnv, 'close');
      spyOn(AppEnv, 'isComposerWindow').andReturn(false);
      DraftStore._onDestroyDraft('abc');
      expect(AppEnv.close).not.toHaveBeenCalled();
    });
  });

  describe('before unloading', () => {
    it('should destroy pristine drafts', () => {
      DraftStore._draftSessions = {
        abc: {
          changes: {},
          draft() {
            return { pristine: true };
          },
        },
      };

      spyOn(Actions, 'queueTask');
      DraftStore._onBeforeUnload(false);
      expect(Actions.queueTask).toHaveBeenCalled();
      expect(Actions.queueTask.mostRecentCall.args[0] instanceof DestroyDraftTask).toBe(true);
    });

    describe('when drafts return unresolved commit promises', () => {
      beforeEach(() => {
        this.resolve = null;
        DraftStore._draftSessions = {
          abc: {
            changes: {
              commit: () =>
                new Promise(resolve => {
                  this.resolve = resolve;
                }),
            },
            draft() {
              return { pristine: false };
            },
          },
        };
      });

      it('should return false and call window.close itself', () => {
        const callback = jasmine.createSpy('callback');
        expect(DraftStore._onBeforeUnload(callback)).toBe(false);
        expect(callback).not.toHaveBeenCalled();
        this.resolve();
        advanceClock(1000);
        advanceClock(1000);
        expect(callback).toHaveBeenCalled();
      });
    });

    describe('when drafts return immediately fulfilled commit promises', () => {
      beforeEach(() => {
        DraftStore._draftSessions = {
          abc: {
            changes: { commit: () => Promise.resolve() },
            draft() {
              return { pristine: false };
            },
          },
        };
      });

      it('should still wait one tick before firing AppEnv.close again', () => {
        const callback = jasmine.createSpy('callback');
        expect(DraftStore._onBeforeUnload(callback)).toBe(false);
        expect(callback).not.toHaveBeenCalled();
        advanceClock();
        advanceClock(1000);
        expect(callback).toHaveBeenCalled();
      });
    });

    describe('when there are no drafts', () => {
      beforeEach(() => {
        DraftStore._draftSessions = {};
      });

      it('should return true and allow the window to close', () => {
        expect(DraftStore._onBeforeUnload()).toBe(true);
      });
    });
  });

  describe('sending a draft', () => {
    beforeEach(() => {
      this.draft = new Message({
        headerMessageId: 'local-123',
        threadId: 'thread-123',
        replyToHeaderMessageId: 'message-123@localhost',
        files: ['stub'],
      });
      DraftStore._draftSessions = {};
      DraftStore._draftsSending = {};
      this.forceCommit = false;
      const session = {
        prepare() {
          return Promise.resolve(session);
        },
        teardown() {},
        draft: () => this.draft,
        changes: {
          commit: ({ force } = {}) => {
            this.forceCommit = force;
            return Promise.resolve();
          },
        },
      };

      DraftStore._draftSessions[this.draft.headerMessageId] = session;
      spyOn(DraftStore, '_doneWithSession').andCallThrough();
      spyOn(DraftStore, 'trigger');
      spyOn(SoundRegistry, 'playSound');
      spyOn(Actions, 'queueTask');
    });

    it('plays a sound immediately when sending draft', () => {
      spyOn(AppEnv.config, 'get').andReturn(true);
      DraftStore._onSendDraft(this.draft.headerMessageId);
      advanceClock();
      expect(AppEnv.config.get).toHaveBeenCalledWith('core.sending.sounds');
      expect(SoundRegistry.playSound).toHaveBeenCalledWith('hit-send');
    });

    it("doesn't plays a sound if the setting is off", () => {
      spyOn(AppEnv.config, 'get').andReturn(false);
      DraftStore._onSendDraft(this.draft.headerMessageId);
      advanceClock();
      expect(AppEnv.config.get).toHaveBeenCalledWith('core.sending.sounds');
      expect(SoundRegistry.playSound).not.toHaveBeenCalled();
    });

    it('sets the sending state when sending', () => {
      spyOn(AppEnv, 'isMainWindow').andReturn(true);
      DraftStore._onSendDraft(this.draft.headerMessageId);
      advanceClock();
      expect(DraftStore.isSendingDraft(this.draft.headerMessageId)).toBe(true);
    });

    // Since all changes haven't been applied yet, we want to ensure that
    // no view of the draft renders the draft as if its sending, but with
    // the wrong text.
    it('does NOT trigger until the latest changes have been applied', () => {
      spyOn(AppEnv, 'isMainWindow').andReturn(true);
      runs(() => {
        DraftStore._onSendDraft(this.draft.headerMessageId);
        expect(DraftStore.trigger).not.toHaveBeenCalled();
      });
      waitsFor(() => {
        return Actions.queueTask.calls.length > 0;
      });
      runs(() => {
        // Normally, the session.changes.commit will persist to the
        // Database. Since that's stubbed out, we need to manually invoke
        // to database update event to get the trigger (which we want to
        // test) to fire
        DraftStore._onDataChanged({
          objectClass: 'Message',
          objects: [{ draft: true }],
        });
        expect(DraftStore.isSendingDraft(this.draft.headerMessageId)).toBe(true);
        expect(DraftStore.trigger).toHaveBeenCalled();
        expect(DraftStore.trigger.calls.length).toBe(1);
      });
    });

    it("returns false if the draft hasn't been seen", () => {
      spyOn(AppEnv, 'isMainWindow').andReturn(true);
      expect(DraftStore.isSendingDraft(this.draft.headerMessageId)).toBe(false);
    });

    it("closes the window if it's a popout", () => {
      spyOn(AppEnv, 'getWindowType').andReturn('composer');
      spyOn(AppEnv, 'isMainWindow').andReturn(false);
      spyOn(AppEnv, 'close');
      runs(() => {
        return DraftStore._onSendDraft(this.draft.headerMessageId);
      });
      waitsFor('Mailspring to close', () => AppEnv.close.calls.length > 0);
    });

    it("doesn't close the window if it's inline", () => {
      spyOn(AppEnv, 'getWindowType').andReturn('other');
      spyOn(AppEnv, 'isMainWindow').andReturn(false);
      spyOn(AppEnv, 'close');
      spyOn(AppEnv, 'isComposerWindow').andCallThrough();
      runs(() => {
        DraftStore._onSendDraft(this.draft.headerMessageId);
      });
      waitsFor(() => AppEnv.isComposerWindow.calls.length > 0);
      runs(() => {
        expect(AppEnv.close).not.toHaveBeenCalled();
      });
    });

    it("resets the sending state if there's an error", () => {
      spyOn(AppEnv, 'isMainWindow').andReturn(false);
      DraftStore._draftsSending[this.draft.headerMessageId] = true;
      Actions.draftDeliveryFailed({
        errorMessage: 'boohoo',
        draftheaderMessageId: this.draft.headerMessageId,
      });
      expect(DraftStore.isSendingDraft(this.draft.headerMessageId)).toBe(false);
      expect(DraftStore.trigger).toHaveBeenCalledWith(this.draft.headerMessageId);
    });

    it("displays a popup in the main window if there's an error", () => {
      spyOn(AppEnv, 'isMainWindow').andReturn(true);
      spyOn(FocusedContentStore, 'focused').andReturn({ id: 't1' });
      spyOn(remote.dialog, 'showMessageBox');
      spyOn(Actions, 'composePopoutDraft');
      DraftStore._draftsSending[this.draft.headerMessageId] = true;
      Actions.draftDeliveryFailed({
        threadId: 't1',
        errorMessage: 'boohoo',
        draftheaderMessageId: this.draft.headerMessageId,
      });
      advanceClock(400);
      expect(DraftStore.isSendingDraft(this.draft.headerMessageId)).toBe(false);
      expect(DraftStore.trigger).toHaveBeenCalledWith(this.draft.headerMessageId);
      expect(remote.dialog.showMessageBox).toHaveBeenCalled();
      const dialogArgs = remote.dialog.showMessageBox.mostRecentCall.args[1];
      expect(dialogArgs.detail).toEqual('boohoo');
      expect(Actions.composePopoutDraft).not.toHaveBeenCalled();
    });

    it("re-opens the draft if you're not looking at the thread", () => {
      spyOn(AppEnv, 'isMainWindow').andReturn(true);
      spyOn(FocusedContentStore, 'focused').andReturn({ id: 't1' });
      spyOn(Actions, 'composePopoutDraft');
      DraftStore._draftsSending[this.draft.headerMessageId] = true;
      Actions.draftDeliveryFailed({
        threadId: 't2',
        errorMessage: 'boohoo',
        draftheaderMessageId: this.draft.headerMessageId,
      });
      advanceClock(400);
      expect(Actions.composePopoutDraft).toHaveBeenCalled();
      const call = Actions.composePopoutDraft.calls[0];
      expect(call.args[0]).toBe(this.draft.headerMessageId);
      expect(call.args[1]).toEqual({ errorMessage: 'boohoo' });
    });

    it('re-opens the draft if there is no thread id', () => {
      spyOn(AppEnv, 'isMainWindow').andReturn(true);
      spyOn(Actions, 'composePopoutDraft');
      DraftStore._draftsSending[this.draft.headerMessageId] = true;
      spyOn(FocusedContentStore, 'focused').andReturn(null);
      Actions.draftDeliveryFailed({
        errorMessage: 'boohoo',
        draftheaderMessageId: this.draft.headerMessageId,
      });
      advanceClock(400);
      expect(Actions.composePopoutDraft).toHaveBeenCalled();
      const call = Actions.composePopoutDraft.calls[0];
      expect(call.args[0]).toBe(this.draft.headerMessageId);
      expect(call.args[1]).toEqual({ errorMessage: 'boohoo' });
    });
  });

  describe('session teardown', () => {
    beforeEach(() => {
      spyOn(AppEnv, 'isMainWindow').andReturn(true);
      this.draftTeardown = jasmine.createSpy('draft teardown');
      this.session = {
        headerMessageId: 'abc',
        draft() {
          return { pristine: false };
        },
        changes: {
          commit() {
            return Promise.resolve();
          },
          reset() {},
        },
        teardown: this.draftTeardown,
      };
      DraftStore._draftSessions = { abc: this.session };
      DraftStore._doneWithSession(this.session);
    });

    it('removes from the list of draftSessions', () => {
      expect(DraftStore._draftSessions.abc).toBeUndefined();
    });

    it('Calls teardown on the session', () => {
      expect(this.draftTeardown).toHaveBeenCalled();
    });
  });

  describe('mailto handling', () => {
    beforeEach(() => {
      spyOn(AppEnv, 'isMainWindow').andReturn(true);
    });

    describe('extensions', () => {
      beforeEach(() => {
        ExtensionRegistry.Composer.register(TestExtension);
      });
      afterEach(() => {
        ExtensionRegistry.Composer.unregister(TestExtension);
      });

      it('should give extensions a chance to customize the draft via ext.prepareNewDraft', () => {
        waitsForPromise(() => {
          return DraftStore._onHandleMailtoLink({}, 'mailto:bengotow@gmail.com').then(() => {
            const received = DatabaseWriter.prototype.persistModel.mostRecentCall.args[0];
            expect(received.body.indexOf('Edited by TestExtension!')).toBe(0);
          });
        });
      });
    });

    it('should call through to DraftFactory and popout a new draft', () => {
      const draft = new Message({ headerMessageId: 'A', body: '123' });
      spyOn(DraftFactory, 'createDraftForMailto').andReturn(Promise.resolve(draft));
      spyOn(DraftStore, '_onPopoutDraft');
      waitsForPromise(() => {
        return DraftStore._onHandleMailtoLink({}, 'mailto:bengotow@gmail.com').then(() => {
          const received = DatabaseWriter.prototype.persistModel.mostRecentCall.args[0];
          expect(received).toEqual(draft);
          expect(DraftStore._onPopoutDraft).toHaveBeenCalled();
        });
      });
    });
  });

  describe('mailfiles handling', () => {
    it('should popout a new draft', () => {
      const defaultMe = new Contact();
      spyOn(DraftStore, '_onPopoutDraft');
      spyOn(Account.prototype, 'defaultMe').andReturn(defaultMe);
      spyOn(Actions, 'addAttachment').andCallFake(({ onCreated }) => onCreated());
      DraftStore._onHandleMailFiles({}, ['/Users/ben/file1.png', '/Users/ben/file2.png']);
      waitsFor(() => DatabaseWriter.prototype.persistModel.callCount > 0);
      runs(() => {
        const { body, subject, from } = DatabaseWriter.prototype.persistModel.calls[0].args[0];
        expect({ body, subject, from }).toEqual({ body: '', subject: '', from: [defaultMe] });
        expect(DraftStore._onPopoutDraft).toHaveBeenCalled();
      });
    });

    it('should call addAttachment for each provided file path', () => {
      spyOn(Actions, 'addAttachment');
      DraftStore._onHandleMailFiles({}, ['/Users/ben/file1.png', '/Users/ben/file2.png']);
      waitsFor(() => Actions.addAttachment.callCount === 2);
      runs(() => {
        expect(Actions.addAttachment.calls[0].args[0].filePath).toEqual('/Users/ben/file1.png');
        expect(Actions.addAttachment.calls[1].args[0].filePath).toEqual('/Users/ben/file2.png');
      });
    });
  });
});
