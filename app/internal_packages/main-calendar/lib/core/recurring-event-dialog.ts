import { localized } from 'mailspring-exports';

export type RecurringEventChoice = 'this-occurrence' | 'all-occurrences' | 'cancel';

export type RecurringEventOperation = 'move' | 'resize' | 'delete' | 'edit';

/**
 * Shows a dialog asking whether to modify this occurrence or all occurrences
 * of a recurring event.
 *
 * @param operation - The type of operation being performed
 * @param eventTitle - The event title for display in the dialog
 * @returns Promise resolving to the user's choice
 */
export function showRecurringEventDialog(
  operation: RecurringEventOperation,
  eventTitle: string
): Promise<RecurringEventChoice> {
  return new Promise((resolve) => {
    const remote = require('@electron/remote');

    const operationText: Record<RecurringEventOperation, string> = {
      move: localized('Move'),
      resize: localized('Resize'),
      delete: localized('Delete'),
      edit: localized('Edit'),
    };

    const operationVerb: Record<RecurringEventOperation, string> = {
      move: localized('move'),
      resize: localized('resize'),
      delete: localized('delete'),
      edit: localized('edit'),
    };

    const response = remote.dialog.showMessageBoxSync({
      type: 'question',
      buttons: [
        localized('This occurrence only'),
        localized('All occurrences'),
        localized('Cancel'),
      ],
      defaultId: 0,
      cancelId: 2,
      title: localized('Recurring Event'),
      message: localized('%1$@ recurring event "%2$@"?', operationText[operation], eventTitle),
      detail: localized(
        'This is a recurring event. Do you want to %1$@ only this occurrence, or all occurrences in the series?',
        operationVerb[operation]
      ),
    });

    const choices: RecurringEventChoice[] = ['this-occurrence', 'all-occurrences', 'cancel'];
    resolve(choices[response]);
  });
}
