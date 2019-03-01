import {
  Thread,
  localized,
  MailboxPerspective,
  MutableQuerySubscription,
  DatabaseStore,
} from 'mailspring-exports';

import { PLUGIN_ID } from './send-reminders-constants';

class SendRemindersMailboxPerspective extends MailboxPerspective {
  name = localized('Reminders');
  iconName = 'reminders.png';

  accountIds: string[];

  constructor(accountIds: string[]) {
    super(accountIds);
    this.accountIds = accountIds;
  }

  get isReminders() {
    return true;
  }

  emptyMessage() {
    return localized('No reminders set');
  }

  threads() {
    let query = DatabaseStore.findAll<Thread>(Thread)
      .where(Thread.attributes.pluginMetadata.contains(PLUGIN_ID))
      .order(Thread.attributes.lastMessageReceivedTimestamp.descending());

    if (this.accountIds.length === 1) {
      query = query.where({ accountId: this.accountIds[0] });
    }

    return new MutableQuerySubscription(query, { emitResultSet: true });
  }

  canReceiveThreadsFromAccountIds() {
    return false;
  }

  canArchiveThreads() {
    return false;
  }

  canTrashThreads() {
    return false;
  }

  canMoveThreadsTo() {
    return false;
  }
}

export default SendRemindersMailboxPerspective;
