import { localized } from 'mailspring-exports';
import SendRemindersMailboxPerspective from './send-reminders-mailbox-perspective';

export const name = 'SendRemindersAccountSidebarExtension';

export function sidebarItem(accountIds) {
  return {
    id: 'Reminders',
    name: localized('Reminders'),
    iconName: 'reminders.png',
    perspective: new SendRemindersMailboxPerspective(accountIds),
    insertAtTop: true,
  };
}
