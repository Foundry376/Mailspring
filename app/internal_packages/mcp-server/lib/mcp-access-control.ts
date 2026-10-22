import { DatabaseStore, Thread, Message } from 'mailspring-exports';
import {
  Grant,
  allowedAccountIds,
  isAccountAllowed as grantIsAccountAllowed,
  isFolderAllowed as grantIsFolderAllowed,
  isThreadAllowed as grantIsThreadAllowed,
  isMessageAllowed as grantIsMessageAllowed,
} from '../../../src/services/mail-access/grant';

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
// MCP's view of the shared capability grant (src/services/mail-access/grant.ts). `mcpGrant()` is the one
// place that interprets `core.mcp.enabledAccounts`; every check below, the batch asserts,
// and the serializers in mcp-serializers.ts are built on it.

export function mcpGrant(): Grant {
  const { enabledAccounts } = getMcpConfig();
  const configured = Object.keys(enabledAccounts);
  const excludedFolderIds: Grant['excludedFolderIds'] = {};
  for (const accountId of configured) {
    excludedFolderIds[accountId] = enabledAccounts[accountId]?.excludedFolderIds || [];
  }
  return {
    // If no account configuration exists, all accounts are enabled by default.
    accountIds:
      configured.length === 0 ? null : configured.filter((id) => !!enabledAccounts[id]?.enabled),
    excludedFolderIds,
  };
}

export function isAccountAllowed(accountId: string): boolean {
  return grantIsAccountAllowed(mcpGrant(), accountId);
}

export function isFolderAllowed(accountId: string, folderId: string): boolean {
  return grantIsFolderAllowed(mcpGrant(), accountId, folderId);
}

export function isThreadAllowed(thread: Pick<Thread, 'accountId' | 'categories'>): boolean {
  return grantIsThreadAllowed(mcpGrant(), thread);
}

export function isMessageAllowed(message: Pick<Message, 'accountId' | 'folderIds'>): boolean {
  return grantIsMessageAllowed(mcpGrant(), message);
}

/**
 * Messages the grant allows, judged by their own folders and by their thread's categories.
 * Gmail labels exist only on the thread, so `isMessageAllowed` alone can't see a label
 * exclusion. A message whose thread isn't stored (some drafts) is judged by its folders.
 */
export async function allowedMessages<T extends Message>(messages: T[]): Promise<T[]> {
  const candidates = messages.filter((m) => isMessageAllowed(m));
  const grant = mcpGrant();
  if (!Object.values(grant.excludedFolderIds).some((ids) => ids.length > 0)) return candidates;
  const threadIds = [...new Set(candidates.map((m) => m.threadId).filter(Boolean))];
  if (threadIds.length === 0) return candidates;
  const threads = await DatabaseStore.findAll<Thread>(Thread).where(
    Thread.attributes.id.in(threadIds)
  );
  const blocked = new Set(threads.filter((t) => !isThreadAllowed(t)).map((t) => t.id));
  return candidates.filter((m) => !blocked.has(m.threadId));
}

export async function isMessageVisible(message: Message | null): Promise<boolean> {
  return !!message && (await allowedMessages([message])).length === 1;
}

// Returns the subset of `allAccountIds` permitted for MCP access. Used to scope DB queries
// (e.g. `Thread.attributes.accountId.in(...)`) and to filter account/folder listings before
// they're returned to the caller.
export function getAllowedAccountIds(allAccountIds: string[]): string[] {
  return allowedAccountIds(mcpGrant(), allAccountIds);
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
