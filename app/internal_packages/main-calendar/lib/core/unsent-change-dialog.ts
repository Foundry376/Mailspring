import { getCurrentLocale, localized } from 'mailspring-exports';
import { ChangeScope, EventPropertyEdit } from './recurring-event-actions';
import { UnsentChange, unsentEdit } from './unsent-change';
import { EventOccurrence } from './calendar-data-source';
import { asksScope } from './calendar-helpers';

export type UnsentChangeChoice = 'send' | ChangeScope | 'discard' | 'keep-editing';

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
 * there it can't keep editing. A series' change is saved from the panel, where its scope is
 * picked, except on quit, which asks for the scope here.
 */
export function showUnsentChangeDialog(
  change: UnsentChange,
  event: EventOccurrence | undefined,
  { canKeepEditing = true } = {}
): UnsentChangeChoice {
  const changed = new Intl.ListFormat(getCurrentLocale(), { type: 'conjunction' }).format([
    ...(change.times ? [localized('time')] : []),
    ...change.edits.map((edit) => changedName(edit.property)),
  ]);
  const title = event?.title ?? '';

  let choices: [UnsentChangeChoice, string][];
  let message: string;
  let detail: string;
  if (event && asksScope(event)) {
    const scopes: [UnsentChangeChoice, string][] = [
      ['this-occurrence', localized('This occurrence only')],
      ['all-occurrences', localized('All occurrences')],
    ];
    // One occurrence can't carry a repeat rule of its own.
    if (unsentEdit(change, 'rrule')) scopes.shift();
    choices = [...(canKeepEditing ? [] : scopes), ['discard', localized('Discard')]];
    message = localized('"%@" has unsaved changes.', title);
    detail = canKeepEditing
      ? localized('You changed the %@. Pick a scope in the panel to save them.', changed)
      : localized('You changed the %@.', changed);
  } else {
    choices = [
      ['send', localized('Send update')],
      ['discard', localized('Discard')],
    ];
    message = localized('Send this update to guests?');
    detail = localized('You changed the %1$@ of "%2$@".', changed, title);
  }
  if (canKeepEditing) choices.push(['keep-editing', localized('Keep editing')]);

  const response = require('@electron/remote').dialog.showMessageBoxSync({
    type: 'question',
    buttons: choices.map(([, label]) => label),
    // Return keeps the change.
    defaultId: choices.findIndex(([choice]) => choice !== 'discard'),
    cancelId: choices.length - 1,
    message,
    detail,
  });
  return choices[response][0];
}
