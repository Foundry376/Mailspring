import { Actions, DraftStore } from 'mailspring-exports';

// The send task finishes in the main window. A thread popout that sent the draft only learns
// the outcome from these two actions.
describe('DraftStore sending state in a window other than the main one', () => {
  const headerMessageId = 'sent-from-popout';

  beforeEach(() => {
    spyOn(AppEnv, 'isMainWindow').andReturn(false);
    spyOn(AppEnv, 'showErrorDialog');
    spyOn(Actions, 'composePopoutDraft');
    spyOn(DraftStore, 'trigger');
    DraftStore._draftsSending = { [headerMessageId]: true };
  });

  afterEach(() => {
    DraftStore._draftsSending = {};
  });

  it('clears once the draft is delivered', () => {
    Actions.draftDeliverySucceeded({ headerMessageId });

    expect(DraftStore.isSendingDraft(headerMessageId)).toBe(false);
    expect(DraftStore.trigger).toHaveBeenCalledWith({ headerMessageId });
  });

  it('clears when delivery fails, and leaves the error to the main window', () => {
    Actions.draftDeliveryFailed({ headerMessageId, threadId: 't1', errorMessage: 'boohoo' });
    advanceClock(400);

    expect(DraftStore.isSendingDraft(headerMessageId)).toBe(false);
    expect(DraftStore.trigger).toHaveBeenCalledWith({ headerMessageId });
    expect(AppEnv.showErrorDialog).not.toHaveBeenCalled();
    expect(Actions.composePopoutDraft).not.toHaveBeenCalled();
  });
});
