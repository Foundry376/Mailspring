import type { Thread, Message } from 'mailspring-exports';

type AccessLevel = 'read-only' | 'read-write' | 'read-write-send';

interface AccountConfig {
  enabled: boolean;
  excludedFolderIds?: string[];
}

function getMcpConfig(): {
  accessLevel: AccessLevel;
  enabledAccounts: { [accountId: string]: AccountConfig };
} {
  return {
    accessLevel: AppEnv.config.get('core.mcp.accessLevel') || 'read-only',
    enabledAccounts: AppEnv.config.get('core.mcp.enabledAccounts') || {},
  };
}

export function checkAccessLevel(category: 'read' | 'write' | 'send'): string | null {
  const { accessLevel } = getMcpConfig();
  if (category === 'read') return null;
  if (category === 'write' && (accessLevel === 'read-write' || accessLevel === 'read-write-send')) {
    return null;
  }
  if (category === 'send' && accessLevel === 'read-write-send') return null;
  return `Access denied: '${category}' operations require access level '${category === 'send' ? 'read-write-send' : 'read-write'}', but current level is '${accessLevel}'.`;
}

// ── Pure predicates ──────────────────────────────────────────────────────
// Single source of truth for account/folder access. Every other check in
// this file (string-returning helpers, batch asserts) and the serializers in
// mcp-serializers.ts are built on top of these, so there is exactly one
// place that interprets `core.mcp.enabledAccounts`.

export function isAccountAllowed(accountId: string): boolean {
  const { enabledAccounts } = getMcpConfig();
  // If no account configuration exists, all accounts are enabled by default.
  if (Object.keys(enabledAccounts).length === 0) return true;
  return !!enabledAccounts[accountId]?.enabled;
}

export function isFolderAllowed(accountId: string, folderId: string): boolean {
  if (!isAccountAllowed(accountId)) return false;
  const { enabledAccounts } = getMcpConfig();
  const excluded = enabledAccounts[accountId]?.excludedFolderIds || [];
  return !excluded.includes(folderId);
}

// A thread can carry multiple categories/labels (e.g. Gmail). Exclusion
// wins: if ANY category on the thread is excluded, the thread is blocked,
// even if it also carries an allowed category. Otherwise exclusion could be
// bypassed trivially by any thread that also happens to carry an unrelated
// allowed label (e.g. most Gmail threads also carry "INBOX").
export function isThreadAllowed(thread: Pick<Thread, 'accountId' | 'categories'>): boolean {
  if (!isAccountAllowed(thread.accountId)) return false;
  const { enabledAccounts } = getMcpConfig();
  const excluded = enabledAccounts[thread.accountId]?.excludedFolderIds || [];
  if (excluded.length === 0) return true;
  return !(thread.categories || []).some((c) => excluded.includes(c.id));
}

export function isMessageAllowed(message: Pick<Message, 'accountId' | 'folder'>): boolean {
  if (!isAccountAllowed(message.accountId)) return false;
  const { enabledAccounts } = getMcpConfig();
  const excluded = enabledAccounts[message.accountId]?.excludedFolderIds || [];
  if (excluded.length === 0 || !message.folder) return true;
  return !excluded.includes(message.folder.id);
}

// Returns the subset of `allAccountIds` permitted for MCP access. When no
// account configuration exists, every account is allowed — mirrors
// `isAccountAllowed`'s default-open behavior. Used to scope DB queries
// (e.g. `Thread.attributes.accountId.in(...)`) and to filter account/folder
// listings before they're returned to the caller.
export function getAllowedAccountIds(allAccountIds: string[]): string[] {
  const { enabledAccounts } = getMcpConfig();
  if (Object.keys(enabledAccounts).length === 0) return allAccountIds;
  return allAccountIds.filter(isAccountAllowed);
}

// Fail-closed batch check used by mutating tools: if any thread in the batch
// is disallowed (account or folder), the whole operation is rejected rather
// than silently partially applied.
export function assertThreadsAllowed(
  threads: Pick<Thread, 'id' | 'accountId' | 'categories'>[]
): string | null {
  const blocked = threads.find((t) => !isThreadAllowed(t));
  if (!blocked) return null;
  return `Access denied: thread '${blocked.id}' is not accessible (its account or folder is excluded from MCP access).`;
}

// ── Scalar, message-returning helpers ───────────────────────────────────
// For "on the way in" checks where a single account/folder id is a direct
// tool parameter and a specific, actionable error message should be
// returned to the caller.

export function checkAccountAccess(accountId: string): string | null {
  return isAccountAllowed(accountId)
    ? null
    : `Access denied: account '${accountId}' is not enabled for MCP access.`;
}

export function checkFolderAccess(accountId: string, folderId: string): string | null {
  const accountErr = checkAccountAccess(accountId);
  if (accountErr) return accountErr;
  return isFolderAllowed(accountId, folderId)
    ? null
    : `Access denied: folder '${folderId}' is excluded from MCP access.`;
}
