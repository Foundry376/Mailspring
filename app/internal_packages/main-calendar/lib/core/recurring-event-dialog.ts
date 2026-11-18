import { localized } from 'mailspring-exports';

export type RecurringEventChoice = 'this-occurrence' | 'all-occurrences' | 'cancel';

export type RecurringEventOperation = 'move' | 'resize' | 'edit' | 'answer';

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
      edit: localized('Edit'),
      answer: localized('Answer'),
    };

    const operationVerb: Record<RecurringEventOperation, string> = {
      move: localized('move'),
      resize: localized('resize'),
      edit: localized('edit'),
      answer: localized('answer'),
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

export type DeleteRole = 'own' | 'organizer' | 'guest';

export interface DeleteDialogItem {
  title: string;
  role: DeleteRole;
  /** Groups the selected dates of one series under one title. */
  eventId: string;
  day?: string;
}

const LISTED_TITLES = 8;

function listedTitles(items: DeleteDialogItem[]): string {
  const days = new Map<string, { title: string; days: string[] }>();
  for (const item of items) {
    const entry = days.get(item.eventId) || { title: item.title, days: [] };
    if (item.day) entry.days.push(item.day);
    days.set(item.eventId, entry);
  }
  const lines = [...days.values()].map(({ title, days }) =>
    days.length ? `• ${title} · ${days.join('; ')}` : `• ${title}`
  );
  if (lines.length <= LISTED_TITLES) return lines.join('\n');
  return [
    ...lines.slice(0, LISTED_TITLES),
    localized('and %@ more', lines.length - LISTED_TITLES),
  ].join('\n');
}

export function showDeleteDialog(
  items: DeleteDialogItem[],
  { series, skipped }: { series: boolean; skipped: number }
): RecurringEventChoice {
  const declined = items.filter((i) => i.role === 'guest');
  const deleted = items.filter((i) => i.role !== 'guest');
  const guestsTold = deleted.some((i) => i.role === 'organizer');

  let message: string;
  let confirm: string;
  const detail: string[] = [];
  if (items.length === 1) {
    const [{ title, role }] = items;
    if (role === 'guest') {
      message = localized('Decline and remove "%@"?', title);
      confirm = localized('Decline and Remove');
      detail.push(localized('The organizer will be told you declined.'));
    } else {
      message = localized('Delete "%@"?', title);
      confirm = localized('Delete');
      if (role === 'organizer') detail.push(localized("Guests will be told it's cancelled."));
    }
  } else if (declined.length === 0) {
    message = localized('Delete %@ events?', items.length);
    confirm = localized('Delete');
    detail.push(listedTitles(items));
    if (guestsTold) detail.push(localized("Guests will be told they're cancelled."));
  } else if (deleted.length === 0) {
    message = localized('Decline and remove %@ events?', items.length);
    confirm = localized('Decline and Remove');
    detail.push(listedTitles(items));
    detail.push(localized('Organizers will be told you declined.'));
  } else {
    message = localized('Delete or decline %@ events?', items.length);
    confirm = localized('Delete and Decline');
    detail.push(`${localized('Delete')}\n${listedTitles(deleted)}`);
    detail.push(`${localized('Decline and remove')}\n${listedTitles(declined)}`);
    detail.push(
      guestsTold
        ? localized('Guests and organizers will be told.')
        : localized('Organizers will be told you declined.')
    );
  }
  if (skipped) {
    detail.push(
      localized(
        "%1$@ of the %2$@ selected events will be deleted. The rest are on read-only calendars and can't be changed.",
        items.length,
        items.length + skipped
      )
    );
  }

  const buttons = series
    ? [localized('This occurrence only'), localized('All occurrences'), localized('Cancel')]
    : [confirm, localized('Cancel')];
  const choices: RecurringEventChoice[] = series
    ? ['this-occurrence', 'all-occurrences', 'cancel']
    : ['this-occurrence', 'cancel'];
  const response = require('@electron/remote').dialog.showMessageBoxSync({
    type: 'warning',
    buttons,
    defaultId: 0,
    cancelId: buttons.length - 1,
    message,
    detail: detail.join('\n\n'),
  });
  return choices[response];
}
