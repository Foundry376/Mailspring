import { WorkspaceStore, MailboxPerspective } from 'mailspring-exports';

/** The Views home: installed Views, starters and Create. Shares the Views sheet. */
export class ViewsHomePerspective extends MailboxPerspective {
  constructor(accountIds: string[]) {
    super(accountIds);
    this.name = 'Views';
  }

  sheet() {
    return WorkspaceStore.Sheet.Views;
  }
  threads() {
    return null;
  }
  canReceiveThreadsFromAccountIds() {
    return false;
  }
  unreadCount() {
    return 0;
  }
  isEqual(other: MailboxPerspective) {
    return other instanceof ViewsHomePerspective && super.isEqual(other);
  }
}
