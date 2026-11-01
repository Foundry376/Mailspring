import { Contact, Message } from 'mailspring-exports';
import { eventsForMessage } from '../lib/activity-events';
import { OPEN_TRACKING_ID } from '../lib/plugin-helpers';

describe('Read receipt activity', () => {
  function message() {
    const result = new Message({
      id: 'activity-message',
      accountId: 'activity-account',
      threadId: 'activity-thread',
      subject: 'Project update',
      date: new Date(1000),
      to: [new Contact({ email: 'reader@example.test', name: 'Reader' })],
      cc: [],
      bcc: [],
    });
    result.directlyAttachMetadata(OPEN_TRACKING_ID, {
      open_count: 2,
      open_data: [
        { recipient: 'reader@example.test', timestamp: 10 },
        { recipient: 'reader@example.test', timestamp: 20 },
      ],
    });
    return result;
  }

  it('preserves attributed opens and folds repeated opens when requested', () => {
    const events = eventsForMessage(message(), { includeRepeats: true });
    expect(events.length).toBe(2);
    expect(events[0].recipientEmail).toBe('reader@example.test');
    expect(events[0].pluginId).toBe(OPEN_TRACKING_ID);
    const folded = eventsForMessage(message(), { includeRepeats: false });
    expect(folded.length).toBe(1);
    expect(folded[0].timestamp).toBe(10);
    expect(folded[0].occurrences).toBe(2);
  });

  it('does not consult unrelated plugin metadata', () => {
    const result = message();
    const metadata = spyOn(result, 'metadataForPluginId').andCallThrough();
    eventsForMessage(result, { includeRepeats: true });
    expect(metadata.calls.length).toBe(1);
    expect(metadata.mostRecentCall.args).toEqual([OPEN_TRACKING_ID]);
  });
});
