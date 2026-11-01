import { AccountStore } from 'mailspring-exports';
import { ActivityEvent } from '../activity-events';
import { exportCsv } from '../csv-export';

/** One row per open, in the order the feed currently displays them. */
export function exportActivityEventsCsv(events: ActivityEvent[]) {
  exportCsv(
    'activity.csv',
    [
      'Timestamp',
      'Recipient Name',
      'Recipient Email',
      'Event',
      'Occurrences',
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
          'open',
          event.occurrences,
          event.subject || '',
          account ? account.emailAddress : '',
          event.messageId,
          event.threadId,
        ]);
      }
    }
  );
}
