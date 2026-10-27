import { getCurrentLocale, localized } from 'mailspring-exports';
import { EventPropertyEdit } from './recurring-event-actions';
import { UnsentChange } from './unsent-change';

export type UnsentChangeChoice = 'send' | 'discard' | 'keep-editing';

const changedName = (property: EventPropertyEdit['property']) =>
  ({
    summary: localized('title'),
    location: localized('location'),
    description: localized('notes'),
    transp: localized('show as'),
    rrule: localized('repeat'),
  })[property];

/**
 * Asks what to do with a held change before leaving its event. Quitting can't be stopped, so
 * there it can't keep editing.
 */
export function showUnsentChangeDialog(
  change: UnsentChange,
  eventTitle: string,
  { canKeepEditing = true } = {}
): UnsentChangeChoice {
  const changed = [
    ...(change.times ? [localized('time')] : []),
    ...change.edits.map((edit) => changedName(edit.property)),
  ];
  const buttons = [localized('Send update'), localized('Discard')];
  if (canKeepEditing) buttons.push(localized('Keep editing'));

  const response = require('@electron/remote').dialog.showMessageBoxSync({
    type: 'question',
    buttons,
    defaultId: 0,
    cancelId: buttons.length - 1,
    message: localized('Send this update to guests?'),
    detail: localized(
      'You changed the %1$@ of "%2$@".',
      new Intl.ListFormat(getCurrentLocale(), { type: 'conjunction' }).format(changed),
      eventTitle
    ),
  });
  return (['send', 'discard', 'keep-editing'] as const)[response];
}
