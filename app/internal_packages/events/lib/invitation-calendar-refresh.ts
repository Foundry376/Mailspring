import _ from 'underscore';
import { DatabaseChangeRecord, Message } from 'mailspring-exports';
import { bestICSAttachment } from './ics-attachment';

const REFRESH_INTERVAL_MS = 60 * 1000;

/**
 * Re-reads an account's calendars when an invitation, update, cancellation or reply arrives in
 * it. The calendar server applies those to the user's copy itself, and the engine's periodic
 * sync (every 15 minutes) can leave the old copy on screen long enough for an answer to be
 * written over a version the server has replaced, which it rejects as an etag-conflict.
 *
 * The message is only a trigger: nothing in it is fetched or trusted, and the only request made
 * is the one the periodic sync makes to the user's own calendar server. An account refreshes at
 * most once a minute, plus once at the end of a minute in which more invitations arrived.
 */
export class InvitationCalendarRefresh {
  private refreshers = new Map<string, () => void>();

  constructor(
    private refresh: (accountId: string) => void,
    private since = Date.now()
  ) {}

  // The engine sets rulesReady once per incoming message, on the delta that carries its body
  // and attachments, and never for the user's own sent copy.
  onDatabaseChanged = (record: DatabaseChangeRecord<Message>) => {
    const arrived = new Set(
      record.objectsRawJSON.filter((json) => json.rulesReady).map((json) => json.id)
    );
    for (const message of record.objects) {
      if (
        arrived.has(message.id) &&
        message.date.valueOf() > this.since &&
        bestICSAttachment(message.files)
      ) {
        this.refresherFor(message.accountId)();
      }
    }
  };

  private refresherFor(accountId: string) {
    if (!this.refreshers.has(accountId)) {
      this.refreshers.set(
        accountId,
        _.throttle(() => this.refresh(accountId), REFRESH_INTERVAL_MS)
      );
    }
    return this.refreshers.get(accountId);
  }
}
