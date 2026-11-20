import { Thread, Message, DraftStore } from 'mailspring-exports';
import DraftFactory from '../../src/flux/stores/draft-factory';

const flushPromises = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

describe('DraftStore._onComposeReply', () => {
  const thread = new Thread({ id: 'thread-1', accountId: TEST_ACCOUNT_ID });
  const message = new Message({
    id: 'message-1',
    threadId: 'thread-1',
    accountId: TEST_ACCOUNT_ID,
  });
  const draft = new Message({ headerMessageId: 'reply-1', draft: true });
  const args = { thread, message, type: 'reply' as const, behavior: 'prefer-existing' as const };

  beforeEach(() => {
    DraftStore._pendingReplies.clear();
    spyOn(DraftStore, '_modelifyContext').andCallFake(async () => ({ thread, message }));
    spyOn(DraftFactory, 'createOrUpdateDraftForReply').andCallFake(async () => draft);
    // A local save that never completes, as when the sync engine isn't answering.
    spyOn(DraftStore, '_finalizeAndPersistNewMessage').andReturn(new Promise(() => {}));
  });

  it('creates one reply when the same reply is requested twice at once', async () => {
    DraftStore._onComposeReply(args);
    DraftStore._onComposeReply(args);
    await flushPromises();
    expect((DraftFactory.createOrUpdateDraftForReply as any).callCount).toBe(1);
    expect((DraftStore._finalizeAndPersistNewMessage as any).callCount).toBe(1);
  });

  it('does not keep a request that failed before its first await', async () => {
    (DraftStore._modelifyContext as any).andCallFake(() => {
      throw new Error('no thread');
    });
    let error = null;
    await DraftStore._onComposeReply(args).catch((e) => (error = e));
    expect(error.message).toBe('no thread');
    expect(DraftStore._pendingReplies.size).toBe(0);
  });

  it('stops sharing once the draft has a session, even if its save never completes', async () => {
    DraftStore._onComposeReply(args);
    await flushPromises();
    expect(DraftStore._pendingReplies.size).toBe(0);
    DraftStore._onComposeReply(args);
    await flushPromises();
    expect((DraftFactory.createOrUpdateDraftForReply as any).callCount).toBe(2);
  });
});
