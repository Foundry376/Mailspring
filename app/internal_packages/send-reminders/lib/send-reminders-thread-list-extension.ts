import { PLUGIN_ID } from './send-reminders-constants';
import { SendRemindersMetadata } from './types';

export const name = 'SendRemindersThreadListExtension';

export function cssClassNamesForThreadListItem(thread) {
  const { shouldNotify } = thread.metadataForPluginId(PLUGIN_ID) || ({} as SendRemindersMetadata);
  if (shouldNotify) {
    return 'thread-list-reminder-item';
  }
  return '';
}

export function cssClassNamesForThreadListIcon(thread) {
  const { expiration, shouldNotify } =
    thread.metadataForPluginId(PLUGIN_ID) || ({} as SendRemindersMetadata);
  if (shouldNotify) {
    return 'thread-icon-reminder-triggered';
  }
  if (expiration) {
    return 'thread-icon-reminder-pending';
  }
  return '';
}
