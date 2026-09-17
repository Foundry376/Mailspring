import { AccountStore } from 'mailspring-exports';
import { ActivityEvent } from '../activity-events';
import { LINK_TRACKING_ID } from '../plugin-helpers';
import { exportCsv } from '../csv-export';

/** One row per open or click, in the order the feed currently displays them. */
export function exportActivityEventsCsv(events: ActivityEvent[]) {
  exportCsv(
    'activity.csv',
    [
      'Timestamp',
      'Recipient Name',
      'Recipient Email',
      'Event',
      'Occurrences',
      'Link',
      'Subject',
      'Account',
      'Message ID',
      'Thread ID',
    ],
    async (write) => {
      for (const event of events) {
        const account = AccountStore.accountForId(event.accountId);
        await write([
          new Date(event.timestamp * 1000).toISOString(),
          event.recipient ? event.recipient.name || '' : '',
          event.recipientEmail || '',
          event.pluginId === LINK_TRACKING_ID ? 'click' : 'open',
          event.occurrences,
          event.linkUrl || '',
          event.subject || '',
          account ? account.emailAddress : '',
          event.messageId,
          event.threadId,
        ]);
      }
    }
  );
}
