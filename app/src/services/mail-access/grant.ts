import type { Thread, Message } from 'mailspring-exports';

/**
 * The account and folder scope one consumer of mail data is allowed to see. MCP builds its
 * grant from `core.mcp.*` config (mcp-access-control.ts) and each View builds one from its
 * manifest (views/lib/bridge/grant.ts), so both are checked by the same predicates below.
 */
export interface Grant {
  /** null means every account. */
  accountIds: string[] | null;
  excludedFolderIds: { [accountId: string]: string[] };
}

export const FULL_GRANT: Grant = { accountIds: null, excludedFolderIds: {} };

export function isAccountAllowed(grant: Grant, accountId: string): boolean {
  return grant.accountIds === null || grant.accountIds.includes(accountId);
}

export function isFolderAllowed(grant: Grant, accountId: string, folderId: string): boolean {
  if (!isAccountAllowed(grant, accountId)) return false;
  return !(grant.excludedFolderIds[accountId] || []).includes(folderId);
}

// A thread can carry multiple categories/labels (e.g. Gmail). Exclusion wins: if ANY
// category on the thread is excluded, the thread is blocked, even if it also carries an
// allowed category. Otherwise exclusion could be bypassed trivially by any thread that also
// happens to carry an unrelated allowed label (e.g. most Gmail threads also carry "INBOX").
export function isThreadAllowed(
  grant: Grant,
  thread: Pick<Thread, 'accountId' | 'categories'>
): boolean {
  if (!isAccountAllowed(grant, thread.accountId)) return false;
  const excluded = grant.excludedFolderIds[thread.accountId] || [];
  if (excluded.length === 0) return true;
  return !(thread.categories || []).some((c) => excluded.includes(c.id));
}

// Same exclusion-wins rule as `isThreadAllowed`: a message with a copy in any excluded
// folder is blocked, even if another copy sits in an allowed folder.
export function isMessageAllowed(
  grant: Grant,
  message: Pick<Message, 'accountId' | 'folderIds'>
): boolean {
  if (!isAccountAllowed(grant, message.accountId)) return false;
  const excluded = grant.excludedFolderIds[message.accountId] || [];
  if (excluded.length === 0) return true;
  return !message.folderIds().some((id) => excluded.includes(id));
}

/** The subset of `allAccountIds` the grant permits, for scoping DB queries up front. */
export function allowedAccountIds(grant: Grant, allAccountIds: string[]): string[] {
  return allAccountIds.filter((id) => isAccountAllowed(grant, id));
}
