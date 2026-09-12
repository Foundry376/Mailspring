/**
 * Custom dataTransfer types used for drag and drop within the app.
 *
 * A drop target can only read `dataTransfer.types` during dragenter/dragover —
 * the payload itself isn't readable until the drop lands. That's why the
 * account ids are encoded into a type name rather than the payload: a target
 * that can only accept threads from certain accounts has to decide before it
 * can call getData.
 */

/** JSON `{ threadIds, accountIds }`, set when threads are dragged. */
export const ThreadsDragType = 'mailspring-threads-data';

/** Prefix of a value-less type carrying the dragged threads' account ids. */
export const AccountsDragTypePrefix = 'mailspring-accounts=';

export function accountIdsForDragTypes(types: readonly string[]): string[] {
  const accountsType = types.find((t) => t.startsWith(AccountsDragTypePrefix));
  return (accountsType || '').replace(AccountsDragTypePrefix, '').split(',');
}
