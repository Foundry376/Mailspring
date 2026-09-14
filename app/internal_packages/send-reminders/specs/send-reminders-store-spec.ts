import { Actions, Thread, SyncbackMetadataTask } from 'mailspring-exports';

import SendRemindersStore from '../lib/send-reminders-store';
import { PLUGIN_ID } from '../lib/send-reminders-constants';

const LAST_RECEIVED = new Date('2026-09-01T12:00:00Z');
const LAST_RECEIVED_SECONDS = LAST_RECEIVED.getTime() / 1000;
const EXPIRATION = new Date('2026-09-20T12:00:00Z');

function threadWithReminder(value: Record<string, unknown>) {
  const thread = new Thread({
    id: 't1',
    accountId: 'a1',
    lastMessageReceivedTimestamp: LAST_RECEIVED,
  });
  thread.directlyAttachMetadata(PLUGIN_ID, value);
  return thread;
}

async function dispatch(thread: Thread, type = 'persist') {
  (SendRemindersStore as any)._onDatabaseChanged({
    type,
    objectClass: Thread.name,
    objects: [thread],
  });
  // updateReminderMetadata queues its task after an awaited feature-usage check;
  // timers are frozen in specs, so drain microtasks instead of using setTimeout.
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

function queuedMetadataValue() {
  const calls = (Actions.queueTask as jasmine.Spy).calls;
  const task = calls.length ? calls[calls.length - 1].args[0] : null;
  expect(task instanceof SyncbackMetadataTask).toBe(true);
  expect(task.pluginId).toBe(PLUGIN_ID);
  expect(task.modelId).toBe('t1');
  return task.value;
}

describe('SendRemindersStore', function sendRemindersStore() {
  beforeEach(() => {
    spyOn(AppEnv, 'isMainWindow').andReturn(true);
    spyOn(Actions, 'queueTask');
    spyOn(SendRemindersStore as any, '_sendReminderEmail');
  });

  describe('when the sync engine promotes reminder metadata from a sent draft', () => {
    // The composer writes only {expiration, sentHeaderMessageId} to the draft; the
    // sync engine copies that verbatim onto the thread when the message sends.
    const promoted = { expiration: EXPIRATION, sentHeaderMessageId: 'sent-1' };

    it('records the reply baseline instead of clearing the reminder', async () => {
      await dispatch(threadWithReminder(promoted));

      const value = queuedMetadataValue();
      expect(value.expiration).toBe(EXPIRATION.getTime() / 1000);
      expect(value.sentHeaderMessageId).toBe('sent-1');
      expect(value.lastReplyTimestamp).toBe(LAST_RECEIVED_SECONDS);
      expect(value.shouldNotify).toBe(false);
    });

    it('still fires the reminder if the expiration event arrives before a baseline was recorded', async () => {
      await dispatch(
        threadWithReminder({ ...promoted, expiration: new Date(Date.now() - 1000) }),
        'metadata-expiration'
      );

      expect((SendRemindersStore as any)._sendReminderEmail).toHaveBeenCalled();
      const value = queuedMetadataValue();
      expect(value.expiration).toBeNull();
      expect(value.shouldNotify).toBe(true);
    });
  });

  describe('when reminder metadata already has a reply baseline', () => {
    it('leaves the reminder alone if no reply has arrived', async () => {
      await dispatch(
        threadWithReminder({
          expiration: EXPIRATION,
          sentHeaderMessageId: 'sent-1',
          shouldNotify: false,
          lastReplyTimestamp: LAST_RECEIVED_SECONDS,
        })
      );
      expect(Actions.queueTask).not.toHaveBeenCalled();
    });

    it('clears the reminder when a new message has arrived on the thread', async () => {
      await dispatch(
        threadWithReminder({
          expiration: EXPIRATION,
          sentHeaderMessageId: 'sent-1',
          shouldNotify: false,
          lastReplyTimestamp: LAST_RECEIVED_SECONDS - 3600,
        })
      );
      expect(queuedMetadataValue()).toEqual({});
    });
  });
});
