import { WorkspaceStore, MailboxPerspective } from 'mailspring-exports';

export class ViewMailboxPerspective extends MailboxPerspective {
  viewId: string;

  constructor(accountIds: string[], viewId: string, name: string) {
    super(accountIds);
    this.viewId = viewId;
    this.name = name;
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
    return super.isEqual(other) && (other as ViewMailboxPerspective).viewId === this.viewId;
  }
}
