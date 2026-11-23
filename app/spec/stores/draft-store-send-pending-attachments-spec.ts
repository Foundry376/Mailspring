import { Actions, Message, DraftStore, AttachmentStore, DatabaseStore } from 'mailspring-exports';
import { SendActionsStore } from '../../src/flux/stores/send-actions-store';
import MessageBodyProcessor from '../../src/flux/stores/message-body-processor';

const flushPromises = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

describe('DraftStore._onSendDraft with attachments still being added', () => {
  const headerMessageId = 'pending-attachment-draft';
  let draft: Message;
  let session: any;
  let addsSettled: (outcome: 'attached' | 'failed' | 'timed-out') => void;
  let performSendAction: jasmine.Spy;

  beforeEach(() => {
    draft = new Message({ headerMessageId, draft: true, body: 'Hello', files: [] });
    session = {
      headerMessageId,
      prepare: () => Promise.resolve(session),
      teardown: () => Promise.resolve(),
      draft: () => draft,
      applyMountedEditorValue: jasmine.createSpy('applyMountedEditorValue'),
      ensureCorrectAccount: () => Promise.resolve(),
      changes: {
        add: jasmine.createSpy('add'),
        addPluginMetadata: jasmine.createSpy('addPluginMetadata'),
        dirtyFields: () => [],
        commit: jasmine.createSpy('commit').andReturn(Promise.resolve()),
      },
    };
    DraftStore._draftSessions[headerMessageId] = session;
    DraftStore._draftsSending = {};

    spyOn(AttachmentStore, 'hasPendingAdds').andReturn(true);
    spyOn(AttachmentStore, 'waitForPendingAdds').andCallFake(
      () => new Promise((resolve) => (addsSettled = resolve))
    );
    performSendAction = jasmine.createSpy('performSendAction');
    spyOn(SendActionsStore, 'sendActionForKey').andReturn({ performSendAction } as any);
    spyOn(AppEnv.config, 'get').andReturn(0);
    spyOn(AppEnv, 'isComposerWindow').andReturn(false);
    spyOn(DatabaseStore, 'findBy').andReturn({ include: () => Promise.resolve(draft) } as any);
    spyOn(MessageBodyProcessor, 'updateCacheForMessage').andReturn(Promise.resolve());
    spyOn(DraftStore, 'trigger');
    spyOn(Actions, 'queueUndoOnlyTask');
  });

  afterEach(() => {
    delete DraftStore._draftSessions[headerMessageId];
    DraftStore._draftsSending = {};
    DraftStore._draftsAwaitingAddsToSend.clear();
  });

  it('commits and sends only after the adds settle', async () => {
    const sending = DraftStore._onSendDraft(headerMessageId);
    await flushPromises();

    expect(AttachmentStore.waitForPendingAdds).toHaveBeenCalledWith(headerMessageId, 20000);
    expect(session.changes.commit).not.toHaveBeenCalled();
    expect(performSendAction).not.toHaveBeenCalled();

    addsSettled('attached');
    await sending;
    expect(session.applyMountedEditorValue).toHaveBeenCalled();
    expect(session.changes.commit).toHaveBeenCalled();
    expect(performSendAction).toHaveBeenCalledWith({ draft });
  });

  it('sends at once, without entering the waiting state, when no adds are in flight', async () => {
    (AttachmentStore.hasPendingAdds as jasmine.Spy).andReturn(false);
    await DraftStore._onSendDraft(headerMessageId);
    expect(AttachmentStore.waitForPendingAdds).not.toHaveBeenCalled();
    expect((DraftStore.trigger as jasmine.Spy).callCount).toBe(1); // the one that shows the draft as sending
    expect(performSendAction).toHaveBeenCalledWith({ draft });
  });

  // The composer goes read-only and shows Send as busy while the draft is awaiting its adds.
  it('triggers when the wait starts and when it ends without sending', async () => {
    const sending = DraftStore._onSendDraft(headerMessageId);
    expect(DraftStore.trigger).toHaveBeenCalledWith({ headerMessageId });
    expect((DraftStore.trigger as jasmine.Spy).callCount).toBe(1);

    addsSettled('failed');
    await sending;
    expect((DraftStore.trigger as jasmine.Spy).callCount).toBe(2);
  });

  describe('when an add is still running after 20 seconds', () => {
    beforeEach(() => {
      (AttachmentStore.waitForPendingAdds as jasmine.Spy).andCallThrough();
      AttachmentStore._pendingAddsByDraft[headerMessageId] = new Promise(() => {});
      spyOn(AppEnv, 'showErrorDialog');
    });

    afterEach(() => {
      delete AttachmentStore._pendingAddsByDraft[headerMessageId];
    });

    it('gives up without sending, says why, and waits again on the next Send', async () => {
      const sending = DraftStore._onSendDraft(headerMessageId);
      await flushPromises();
      advanceClock(19999);
      await flushPromises();
      expect(DraftStore.isAwaitingAddsToSend(headerMessageId)).toBe(true);
      expect(AppEnv.showErrorDialog).not.toHaveBeenCalled();

      advanceClock(1);
      await sending;
      expect(AppEnv.showErrorDialog).toHaveBeenCalled();
      expect(DraftStore.isAwaitingAddsToSend(headerMessageId)).toBe(false);
      expect(DraftStore.isSendingDraft(headerMessageId)).toBe(false);
      expect(session.changes.commit).not.toHaveBeenCalled();
      expect(performSendAction).not.toHaveBeenCalled();

      DraftStore._onSendDraft(headerMessageId);
      expect(DraftStore.isAwaitingAddsToSend(headerMessageId)).toBe(true);
    });
  });

  // The message list swaps an inline composer for the sending message once isSendingDraft is
  // true, which would unmount it before the files it is waiting for are inserted.
  it('is not marked as sending while it waits, but refuses a second Send', async () => {
    const sending = DraftStore._onSendDraft(headerMessageId);
    expect(DraftStore.isAwaitingAddsToSend(headerMessageId)).toBe(true);
    await flushPromises();
    expect(DraftStore.isSendingDraft(headerMessageId)).toBe(false);

    await DraftStore._onSendDraft(headerMessageId);
    expect((AttachmentStore.waitForPendingAdds as jasmine.Spy).callCount).toBe(1);

    addsSettled('attached');
    await sending;
    expect(DraftStore.isAwaitingAddsToSend(headerMessageId)).toBe(false);
    expect(DraftStore.isSendingDraft(headerMessageId)).toBe(true);
    expect(performSendAction.callCount).toBe(1);
  });

  it('starts the undo-send window once the adds settle', async () => {
    (AppEnv.config.get as jasmine.Spy).andReturn(5000);
    spyOn(Date, 'now').andReturn(1000);
    const sending = DraftStore._onSendDraft(headerMessageId);
    await flushPromises();

    (Date.now as jasmine.Spy).andReturn(4000);
    addsSettled('attached');
    await sending;
    const [pluginId, value] = session.changes.addPluginMetadata.argsForCall[0];
    expect(pluginId).toBe('send-later');
    expect(Number(value.expiration)).toBe(9000);
  });

  it('stays in the composer, not sending, when an add fails', async () => {
    const sending = DraftStore._onSendDraft(headerMessageId);
    await flushPromises();

    addsSettled('failed');
    await sending;
    expect(DraftStore.isSendingDraft(headerMessageId)).toBe(false);
    expect(DraftStore.isAwaitingAddsToSend(headerMessageId)).toBe(false);
    expect(session.changes.commit).not.toHaveBeenCalled();
    expect(performSendAction).not.toHaveBeenCalled();
  });

  describe('when the draft is discarded during the wait', () => {
    beforeEach(() => {
      spyOn(Actions, 'queueTask');
      spyOn(DraftStore, 'sessionForClientId').andCallThrough();
    });

    const discard = () =>
      DraftStore._onDestroyDraft({ accountId: 'account-1', headerMessageId, id: 'draft-1' });

    it('does not reopen or send it', async () => {
      const sending = DraftStore._onSendDraft(headerMessageId);
      await flushPromises();
      discard();

      addsSettled('attached');
      await sending;
      expect(DraftStore.sessionForClientId).not.toHaveBeenCalled();
      expect(DraftStore._draftSessions[headerMessageId]).toBeUndefined();
      expect(DraftStore.isSendingDraft(headerMessageId)).toBe(false);
      expect(DraftStore.isAwaitingAddsToSend(headerMessageId)).toBe(false);
      expect(performSendAction).not.toHaveBeenCalled();
    });

    it('does not send it when it had no session before the wait', async () => {
      delete DraftStore._draftSessions[headerMessageId];
      const sending = DraftStore._onSendDraft(headerMessageId);
      await flushPromises();
      discard();

      addsSettled('attached');
      await sending;
      expect(DraftStore.sessionForClientId).not.toHaveBeenCalled();
      expect(performSendAction).not.toHaveBeenCalled();
    });
  });

  it('does not send when its session was closed and replaced during the wait', async () => {
    const sending = DraftStore._onSendDraft(headerMessageId);
    await flushPromises();
    DraftStore._draftSessions[headerMessageId] = { ...session };

    addsSettled('attached');
    await sending;
    expect(performSendAction).not.toHaveBeenCalled();
  });

  it('sends a draft with no session before the wait once an add has opened one', async () => {
    delete DraftStore._draftSessions[headerMessageId];
    const sending = DraftStore._onSendDraft(headerMessageId);
    await flushPromises();
    DraftStore._draftSessions[headerMessageId] = session;

    addsSettled('attached');
    await sending;
    expect(performSendAction).toHaveBeenCalledWith({ draft });
  });
});
