import { Thread, FocusedPerspectiveStore, DateUtils, localized } from 'mailspring-exports';

export function threadAriaLabel(thread: Thread): string {
  const parts: string[] = [];

  if (thread.unread) parts.push(localized('Unread'));

  const participants = thread.participants || [];
  const names = participants
    .filter(c => !c.isMe())
    .slice(0, 3)
    .map(c => c.displayName({ compact: false }))
    .join(', ');
  if (names) parts.push(names);

  const subj = (thread.subject || '').trim() || localized('No Subject');
  parts.push(subj);

  const isSent = FocusedPerspectiveStore.current().isSent?.();
  const rawTs = isSent ? thread.lastMessageSentTimestamp : thread.lastMessageReceivedTimestamp;
  if (rawTs) parts.push(DateUtils.shortTimeString(rawTs));

  const msgCount = (thread as any).__messages?.length || 0;
  if (msgCount > 1) parts.push(localized('%1$@ messages', msgCount));

  if (thread.attachmentCount > 0) parts.push(localized('has attachment'));
  if (thread.starred) parts.push(localized('starred'));

  return parts.join(', ');
}
