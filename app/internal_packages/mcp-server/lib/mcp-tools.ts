import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  AccountStore,
  CategoryStore,
  DatabaseStore,
  Thread,
  Message,
  Contact,
  Label,
  DraftFactory,
  SyncbackDraftTask,
  SendDraftTask,
  SyncbackMetadataTask,
  SendActionsStore,
  ChangeStarredTask,
  ChangeLabelsTask,
  ChangeFolderTask,
  TaskFactory,
  TaskQueue,
  Actions,
  SearchQueryParser,
} from 'mailspring-exports';
import {
  checkAccessLevel,
  checkAccountAccess,
  checkFolderAccess,
  isFolderAllowed,
  isThreadAllowed,
  isMessageAllowed,
  getAllowedAccountIds,
  assertThreadsAllowed,
} from './mcp-access-control';
import {
  serializeThreadSummary,
  serializeThreadDetail,
  serializeMessageDetail,
} from './mcp-serializers';

// Plugin IDs used by the built-in open-tracking and link-tracking packages
// (see app/internal_packages/open-tracking/package.json and link-tracking/package.json).
const OPEN_TRACKING_ID = 'open-tracking';
const LINK_TRACKING_ID = 'link-tracking';

// Plugin ID used by the built-in send-later package
// (see app/internal_packages/send-later/package.json).
const SEND_LATER_ID = 'send-later';

interface SendLaterMetadata {
  expiration?: Date;
  actionKey?: string;
  isUndoSend?: boolean;
}

interface OpenTrackingMetadata {
  uid: string;
  open_count: number;
  open_data: { recipient: string; timestamp: number }[];
}

interface LinkTrackingMetadata {
  uid: string;
  links: {
    url: string;
    redirect_url: string;
    click_count: number;
    click_data: { recipient: string; timestamp: number }[];
  }[];
}

function messageTrackingSummary(message: Message) {
  const openMeta = message.metadataForPluginId(OPEN_TRACKING_ID) as OpenTrackingMetadata | null;
  const linkMeta = message.metadataForPluginId(LINK_TRACKING_ID) as LinkTrackingMetadata | null;

  const opens = openMeta
    ? {
        count: openMeta.open_count || 0,
        events: (openMeta.open_data || []).map((o) => ({
          recipient: o.recipient,
          timestamp: o.timestamp,
        })),
      }
    : null;

  const links = linkMeta
    ? {
        links: (linkMeta.links || []).map((l) => ({
          url: l.url,
          clickCount: l.click_count || 0,
          events: (l.click_data || []).map((c) => ({
            recipient: c.recipient,
            timestamp: c.timestamp,
          })),
        })),
      }
    : null;

  return { opens, links };
}

export interface AuditEntry {
  timestamp: number;
  toolName: string;
  params: string;
  resultSummary: string;
  durationMs: number;
}

let auditLog: AuditEntry[] = [];
let auditListeners: (() => void)[] = [];

export function getAuditLog(): AuditEntry[] {
  return auditLog;
}

export function clearAuditLog() {
  auditLog = [];
  auditListeners.forEach((fn) => fn());
}

export function onAuditLogChanged(fn: () => void) {
  auditListeners.push(fn);
  return () => {
    auditListeners = auditListeners.filter((l) => l !== fn);
  };
}

function addAuditEntry(entry: AuditEntry) {
  auditLog.push(entry);
  if (auditLog.length > 50) auditLog.shift();
  auditListeners.forEach((fn) => fn());
}

function textResult(data: any) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

function errorResult(message: string) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ error: message }) }],
    isError: true,
  };
}

type ToolResult = { content: { type: 'text'; text: string }[]; isError?: boolean };

async function withAudit(
  toolName: string,
  params: Record<string, any>,
  fn: () => Promise<ToolResult>
) {
  const start = Date.now();
  try {
    const result = await fn();
    addAuditEntry({
      timestamp: Date.now(),
      toolName,
      params: JSON.stringify(params).slice(0, 200),
      resultSummary: result.isError ? 'error' : 'ok',
      durationMs: Date.now() - start,
    });
    return result;
  } catch (err) {
    addAuditEntry({
      timestamp: Date.now(),
      toolName,
      params: JSON.stringify(params).slice(0, 200),
      resultSummary: `error: ${(err as Error).message}`.slice(0, 100),
      durationMs: Date.now() - start,
    });
    return errorResult((err as Error).message);
  }
}

// Thin wrapper around `withAudit` + `checkAccessLevel` so every tool gets
// audit logging and the read/write/send gate for free, without repeating
// `let err = checkAccessLevel(...); if (err) return errorResult(err);` at
// the top of every handler. Account/folder authorization still happens
// inside each handler (via mcp-access-control's predicates and
// mcp-serializers) since it depends on params or fetched data that vary per
// tool and can't be expressed declaratively here.
function defineTool(
  server: McpServer,
  name: string,
  description: string,
  schema: z.ZodRawShape,
  accessCategory: 'read' | 'write' | 'send',
  handler: (args: any) => Promise<ToolResult>
) {
  server.tool(name, description, schema, (args: any) =>
    withAudit(name, args, async () => {
      const err = checkAccessLevel(accessCategory);
      if (err) return errorResult(err);
      return handler(args);
    })
  );
}

export function registerTools(server: McpServer) {
  // ── Read Tools ──

  defineTool(
    server,
    'list_accounts',
    'List all email accounts configured in Mailspring',
    {},
    'read',
    async () => {
      const allAccounts = AccountStore.accounts();
      const allowedIds = new Set(getAllowedAccountIds(allAccounts.map((a) => a.id)));
      const accounts = allAccounts
        .filter((a) => allowedIds.has(a.id))
        .map((a) => ({
          id: a.id,
          name: a.name,
          email: a.emailAddress,
          provider: a.provider,
          usesLabels: a.usesLabels(),
        }));
      return textResult(accounts);
    }
  );

  defineTool(
    server,
    'list_folders',
    'List all folders/labels for an email account. Each entry includes a `role` — a provider-agnostic identifier (e.g. "inbox", "sent", "drafts", "trash", "spam", "archive", "all", "important", "snoozed") for standard folders, or null for user-created ones. Use `role` rather than `name` to find a standard folder like Sent or Trash, since the display name varies by provider (e.g. "Sent Mail" vs "Sent Items" vs Gmail\'s SENT label).',
    { accountId: z.string().describe('The account ID to list folders for') },
    'read',
    async ({ accountId }) => {
      const err = checkAccountAccess(accountId);
      if (err) return errorResult(err);
      const categories = CategoryStore.categories(accountId)
        .filter((c) => isFolderAllowed(accountId, c.id))
        .map((c) => ({
          id: c.id,
          name: c.displayName || c.name,
          role: (c as any).role || null,
          path: (c as any).path || c.name,
        }));
      return textResult(categories);
    }
  );

  defineTool(
    server,
    'search_mail',
    'Search for email threads using query syntax. Keywords: from:<email>, to:<email>, subject:<text>, in:<folder> (matches a folder/label\'s standard role when it has one, e.g. "in:sent", "in:inbox", "in:trash", "in:drafts", "in:spam", "in:archive" — this works across providers without needing to look up folder names first; falls back to matching the folder/path name for custom folders/labels), is:unread|read|starred|unstarred, has:attachment, before:<date>/since:<date>/after:<date> (accepts natural language like "yesterday", "2 days ago", "last week", or an exact date like "2018/05/31"). Combine terms with AND (the default between adjacent terms), OR, and NOT; use parentheses to group and "quoted phrases" for exact matches. Examples: \'in:sent project alpha\', \'from:alice is:unread\', \'(to:bob OR to:carol) has:attachment\'.',
    {
      query: z.string().describe('Search query string'),
      accountId: z.string().optional().describe('Optional account ID to scope the search'),
      limit: z.number().optional().default(150).describe('Max results to return (default 150)'),
      offset: z
        .number()
        .optional()
        .default(0)
        .describe('Number of results to skip for pagination (default 0)'),
    },
    'read',
    async ({ query, accountId, limit, offset }) => {
      if (accountId) {
        const err = checkAccountAccess(accountId);
        if (err) return errorResult(err);
      }

      let dbQuery = DatabaseStore.findAll<Thread>(Thread);
      if (accountId) {
        dbQuery = dbQuery.where({ accountId });
      } else {
        // Scope the query to allowed accounts up front so pagination
        // (`.limit()` below) counts against already-allowed rows.
        const allowedIds = getAllowedAccountIds(AccountStore.accounts().map((a) => a.id));
        dbQuery = dbQuery.where(Thread.attributes.accountId.in(allowedIds));
      }
      try {
        const parsed = SearchQueryParser.parse(query);
        dbQuery = dbQuery.structuredSearch(parsed);
      } catch {
        dbQuery = dbQuery.search(query);
      }
      dbQuery = dbQuery
        .order(Thread.attributes.lastMessageReceivedTimestamp.descending())
        .offset(offset || 0)
        .limit(limit || 150);

      const threads = await dbQuery;
      // Folder-level exclusion can't be pushed into this query cheaply (it's
      // not a simple equality match against a thread's categories), so it's
      // applied here as a post-fetch filter via the shared serializer. This
      // means a page can return fewer than `limit` results when folders are
      // excluded — a known, accepted tradeoff.
      const results = threads
        .map((t) => serializeThreadSummary(t, { includeMessageCount: true }))
        .filter((r): r is Record<string, any> => r !== null);
      return textResult(results);
    }
  );

  defineTool(
    server,
    'list_threads',
    'List threads in a specific folder/label. To find a standard folder like Sent or Trash, call list_folders first and pick the entry whose `role` matches ("inbox", "sent", "drafts", "trash", "spam", "archive", "all", "important", "snoozed") — the exact folder name varies by provider, so don\'t guess it from `name`.',
    {
      folderId: z
        .string()
        .describe('The folder/label ID (from list_folders — match by `role` for standard folders)'),
      accountId: z.string().describe('The account ID'),
      limit: z.number().optional().default(25).describe('Max results (default 25)'),
      offset: z.number().optional().default(0).describe('Offset for pagination'),
      unread: z.boolean().optional().describe('Filter to unread only'),
    },
    'read',
    async ({ folderId, accountId, limit, offset, unread }) => {
      const err = checkFolderAccess(accountId, folderId);
      if (err) return errorResult(err);

      let dbQuery = DatabaseStore.findAll<Thread>(Thread)
        .where([Thread.attributes.categories.contains(folderId)])
        .order(Thread.attributes.lastMessageReceivedTimestamp.descending())
        .limit(limit || 25)
        .offset(offset || 0);

      if (unread !== undefined) {
        dbQuery = dbQuery.where({ unread });
      }

      const threads = await dbQuery;
      const results = threads
        .map((t) => serializeThreadSummary(t))
        .filter((r): r is Record<string, any> => r !== null);
      return textResult(results);
    }
  );

  defineTool(
    server,
    'get_thread',
    'Get a thread with all its messages and full body content',
    { threadId: z.string().describe('The thread ID') },
    'read',
    async ({ threadId }) => {
      const thread = await DatabaseStore.find<Thread>(Thread, threadId);
      // Deliberately the same "not found" message whether the thread
      // doesn't exist or is blocked by account/folder rules — distinguishing
      // the two would confirm the existence of data the caller can't see.
      if (!thread || !isThreadAllowed(thread)) return errorResult(`Thread '${threadId}' not found`);

      const messages = await DatabaseStore.findAll<Message>(Message, { threadId })
        .include(Message.attributes.body)
        .order(Message.attributes.date.ascending());

      const result = serializeThreadDetail(thread, messages);
      if (!result) return errorResult(`Thread '${threadId}' not found`);
      return textResult(result);
    }
  );

  defineTool(
    server,
    'get_message',
    'Get a single message with full body content',
    { messageId: z.string().describe('The message ID') },
    'read',
    async ({ messageId }) => {
      const message = await DatabaseStore.find<Message>(Message, messageId).include(
        Message.attributes.body
      );
      if (!message) return errorResult(`Message '${messageId}' not found`);

      const result = serializeMessageDetail(message);
      if (!result) return errorResult(`Message '${messageId}' not found`);
      return textResult(result);
    }
  );

  // ── Tracking Tools (open-tracking / link-tracking plugins) ──

  defineTool(
    server,
    'get_message_tracking',
    'Get open-tracking and link-tracking data for a single sent message: total open count, per-recipient open timestamps, and per-link click counts with per-recipient click timestamps.',
    { messageId: z.string().describe('The message ID') },
    'read',
    async ({ messageId }) => {
      const message = await DatabaseStore.find<Message>(Message, messageId);
      if (!message || !isMessageAllowed(message)) {
        return errorResult(`Message '${messageId}' not found`);
      }

      const { opens, links } = messageTrackingSummary(message);
      if (!opens && !links) {
        return errorResult(`Message '${messageId}' has no open-tracking or link-tracking data`);
      }

      return textResult({
        id: message.id,
        threadId: message.threadId,
        subject: message.subject,
        date: message.date,
        accountId: message.accountId,
        opens,
        links,
      });
    }
  );

  defineTool(
    server,
    'list_tracked_messages',
    'List sent messages that have open-tracking and/or link-tracking enabled, along with their open/click data. Use sentAfter/sentBefore to bound by send date (e.g. "everything sent this month") and openedAfter to filter by when the open/click activity itself happened (e.g. "opened today"). Answers questions like "which of my emails have been opened today" or "every email I sent this month with link tracking".',
    {
      accountId: z.string().optional().describe('Restrict to a single account'),
      trackingType: z
        .enum(['opens', 'links', 'either'])
        .optional()
        .default('either')
        .describe('Only include messages with open-tracking, link-tracking, or either (default)'),
      sentAfter: z.string().optional().describe('ISO 8601 date - only messages sent after this'),
      sentBefore: z.string().optional().describe('ISO 8601 date - only messages sent before this'),
      openedAfter: z
        .string()
        .optional()
        .describe(
          'ISO 8601 date - only include messages with an open or link-click event at/after this time (filters on activity time, not send date)'
        ),
      minOpens: z
        .number()
        .optional()
        .describe('Only include messages with at least this many total opens'),
      minClicks: z
        .number()
        .optional()
        .describe('Only include messages with at least this many total link clicks'),
      limit: z.number().optional().default(50).describe('Max results to return (default 50)'),
      offset: z.number().optional().default(0).describe('Offset for pagination'),
    },
    'read',
    async ({
      accountId,
      trackingType,
      sentAfter,
      sentBefore,
      openedAfter,
      minOpens,
      minClicks,
      limit,
      offset,
    }) => {
      if (accountId) {
        const err = checkAccountAccess(accountId);
        if (err) return errorResult(err);
      }

      const sentAfterDate = sentAfter ? new Date(sentAfter) : undefined;
      if (sentAfterDate && isNaN(sentAfterDate.getTime())) {
        return errorResult(`Invalid sentAfter date: '${sentAfter}'`);
      }
      const sentBeforeDate = sentBefore ? new Date(sentBefore) : undefined;
      if (sentBeforeDate && isNaN(sentBeforeDate.getTime())) {
        return errorResult(`Invalid sentBefore date: '${sentBefore}'`);
      }
      const openedAfterTs = openedAfter ? new Date(openedAfter).getTime() / 1000 : undefined;
      if (openedAfterTs !== undefined && isNaN(openedAfterTs)) {
        return errorResult(`Invalid openedAfter date: '${openedAfter}'`);
      }

      const pluginIds =
        trackingType === 'opens'
          ? [OPEN_TRACKING_ID]
          : trackingType === 'links'
            ? [LINK_TRACKING_ID]
            : [OPEN_TRACKING_ID, LINK_TRACKING_ID];

      let dbQuery = DatabaseStore.findAll<Message>(Message)
        .where([Message.attributes.draft.equal(false)])
        .where(Message.attributes.pluginMetadata.containsAny(pluginIds))
        .distinct()
        .order(Message.attributes.date.descending());

      if (accountId) {
        dbQuery = dbQuery.where({ accountId });
      } else {
        const allowedIds = getAllowedAccountIds(AccountStore.accounts().map((a) => a.id));
        dbQuery = dbQuery.where(Message.attributes.accountId.in(allowedIds));
      }
      if (sentAfterDate)
        dbQuery = dbQuery.where(Message.attributes.date.greaterThan(sentAfterDate));
      if (sentBeforeDate) dbQuery = dbQuery.where(Message.attributes.date.lessThan(sentBeforeDate));

      const messages = await dbQuery;

      // Metadata contents (open/click timestamps) aren't queryable in SQL,
      // so activity-based filters — and folder-level access filtering — are
      // applied in-memory after the bounded fetch above.
      let candidates = messages
        .filter(isMessageAllowed)
        .map((m) => ({ message: m, tracking: messageTrackingSummary(m) }));

      candidates = candidates.filter(({ tracking }) => {
        if (minOpens !== undefined && (!tracking.opens || tracking.opens.count < minOpens)) {
          return false;
        }
        if (minClicks !== undefined) {
          const totalClicks = tracking.links
            ? tracking.links.links.reduce((sum, l) => sum + l.clickCount, 0)
            : 0;
          if (totalClicks < minClicks) return false;
        }
        if (openedAfterTs !== undefined) {
          const hasRecentOpen =
            !!tracking.opens && tracking.opens.events.some((e) => e.timestamp >= openedAfterTs);
          const hasRecentClick =
            !!tracking.links &&
            tracking.links.links.some((l) => l.events.some((e) => e.timestamp >= openedAfterTs));
          if (!hasRecentOpen && !hasRecentClick) return false;
        }
        return true;
      });

      const total = candidates.length;
      const page = candidates.slice(offset || 0, (offset || 0) + (limit || 50));

      const results = page.map(({ message, tracking }) => ({
        id: message.id,
        threadId: message.threadId,
        subject: message.subject,
        to: (message.to || []).map((c) => ({ name: c.name, email: c.email })),
        date: message.date,
        accountId: message.accountId,
        opens: tracking.opens,
        links: tracking.links,
      }));

      return textResult({ total, messages: results });
    }
  );

  defineTool(
    server,
    'get_top_links',
    'Rank links from link-tracking-enabled sent messages by total click count, across a time range. Answers questions like "what are my highest performing links" or "which links get clicked the most".',
    {
      accountId: z.string().optional().describe('Restrict to a single account'),
      sentAfter: z
        .string()
        .optional()
        .describe('ISO 8601 date - only consider messages sent after this'),
      sentBefore: z
        .string()
        .optional()
        .describe('ISO 8601 date - only consider messages sent before this'),
      limit: z
        .number()
        .optional()
        .default(10)
        .describe('Max number of links to return (default 10)'),
    },
    'read',
    async ({ accountId, sentAfter, sentBefore, limit }) => {
      if (accountId) {
        const err = checkAccountAccess(accountId);
        if (err) return errorResult(err);
      }

      const sentAfterDate = sentAfter ? new Date(sentAfter) : undefined;
      if (sentAfterDate && isNaN(sentAfterDate.getTime())) {
        return errorResult(`Invalid sentAfter date: '${sentAfter}'`);
      }
      const sentBeforeDate = sentBefore ? new Date(sentBefore) : undefined;
      if (sentBeforeDate && isNaN(sentBeforeDate.getTime())) {
        return errorResult(`Invalid sentBefore date: '${sentBefore}'`);
      }

      let dbQuery = DatabaseStore.findAll<Message>(Message)
        .where([Message.attributes.draft.equal(false)])
        .where(Message.attributes.pluginMetadata.contains(LINK_TRACKING_ID))
        .distinct()
        .order(Message.attributes.date.descending());

      if (accountId) {
        dbQuery = dbQuery.where({ accountId });
      } else {
        const allowedIds = getAllowedAccountIds(AccountStore.accounts().map((a) => a.id));
        dbQuery = dbQuery.where(Message.attributes.accountId.in(allowedIds));
      }
      if (sentAfterDate)
        dbQuery = dbQuery.where(Message.attributes.date.greaterThan(sentAfterDate));
      if (sentBeforeDate) dbQuery = dbQuery.where(Message.attributes.date.lessThan(sentBeforeDate));

      const messages = await dbQuery;

      const linkRows: {
        url: string;
        clickCount: number;
        uniqueRecipients: number;
        messageId: string;
        threadId: string;
        subject: string;
        date: Date;
        accountId: string;
      }[] = [];

      for (const message of messages) {
        if (!isMessageAllowed(message)) continue;
        const { links } = messageTrackingSummary(message);
        if (!links) continue;
        for (const link of links.links) {
          linkRows.push({
            url: link.url,
            clickCount: link.clickCount,
            uniqueRecipients: new Set(link.events.map((e) => e.recipient)).size,
            messageId: message.id,
            threadId: message.threadId,
            subject: message.subject,
            date: message.date,
            accountId: message.accountId,
          });
        }
      }

      linkRows.sort((a, b) => b.clickCount - a.clickCount);

      return textResult(linkRows.slice(0, limit || 10));
    }
  );

  // ── Write Tools ──

  defineTool(
    server,
    'create_draft',
    'Create a new email draft (does not send it)',
    {
      to: z
        .array(z.object({ name: z.string().optional(), email: z.string() }))
        .describe('Recipients'),
      cc: z
        .array(z.object({ name: z.string().optional(), email: z.string() }))
        .optional()
        .describe('CC recipients'),
      bcc: z
        .array(z.object({ name: z.string().optional(), email: z.string() }))
        .optional()
        .describe('BCC recipients'),
      subject: z.string().describe('Email subject'),
      body: z.string().describe('Email body (HTML)'),
      accountId: z
        .string()
        .optional()
        .describe('Account ID to send from (uses default if omitted)'),
    },
    'write',
    async ({ to, cc, bcc, subject, body, accountId }) => {
      const fields: any = {
        to: to.map((c) => new Contact({ name: c.name || '', email: c.email })),
        subject,
        body,
      };
      if (cc) fields.cc = cc.map((c) => new Contact({ name: c.name || '', email: c.email }));
      if (bcc) fields.bcc = bcc.map((c) => new Contact({ name: c.name || '', email: c.email }));
      if (accountId) fields.accountId = accountId;

      const draft = await DraftFactory.createDraft(fields);

      // Checked once here, after DraftFactory resolves the effective
      // account (whether explicitly passed or defaulted via the user's
      // sending preference), so a disabled default account can't be used
      // silently just by omitting `accountId`. Nothing has been persisted
      // yet at this point, so bailing out here is side-effect-free.
      const accountErr = checkAccountAccess(draft.accountId);
      if (accountErr) return errorResult(accountErr);

      draft.pristine = false;
      const task = new SyncbackDraftTask({ draft });
      Actions.queueTask(task);
      await TaskQueue.waitForPerformLocal(task);

      return textResult({
        headerMessageId: draft.headerMessageId,
        accountId: draft.accountId,
        subject: draft.subject,
      });
    }
  );

  defineTool(
    server,
    'reply_to_thread',
    'Create a reply draft to the latest message in a thread',
    {
      threadId: z.string().describe('Thread ID to reply to'),
      body: z.string().describe('Reply body (HTML)'),
      type: z
        .enum(['reply', 'reply-all'])
        .optional()
        .default('reply')
        .describe('Reply type (default: reply)'),
    },
    'write',
    async ({ threadId, body, type }) => {
      const thread = await DatabaseStore.find<Thread>(Thread, threadId);
      if (!thread || !isThreadAllowed(thread)) return errorResult(`Thread '${threadId}' not found`);

      const messages = await DatabaseStore.findAll<Message>(Message, { threadId }).order(
        Message.attributes.date.descending()
      );
      const message = messages.find((m) => !m.isHidden());
      if (!message) return errorResult('No visible message found in thread');

      const draft = await DraftFactory.createDraftForReply({
        message,
        thread,
        type: type as 'reply' | 'reply-all',
      });
      draft.body = `${body}\n\n${draft.body}`;
      draft.pristine = false;

      const task = new SyncbackDraftTask({ draft });
      Actions.queueTask(task);
      await TaskQueue.waitForPerformLocal(task);

      return textResult({
        headerMessageId: draft.headerMessageId,
        accountId: draft.accountId,
        threadId: draft.threadId,
      });
    }
  );

  defineTool(
    server,
    'archive_threads',
    'Archive one or more threads',
    { threadIds: z.array(z.string()).describe('Thread IDs to archive') },
    'write',
    async ({ threadIds }) => {
      const threads = await DatabaseStore.modelify<Thread>(Thread, threadIds);
      const err = assertThreadsAllowed(threads);
      if (err) return errorResult(err);

      const tasks = TaskFactory.tasksForArchiving({ threads, source: 'MCP' });
      for (const task of tasks) Actions.queueTask(task);

      return textResult({ archived: threadIds.length });
    }
  );

  defineTool(
    server,
    'trash_threads',
    'Move one or more threads to trash',
    { threadIds: z.array(z.string()).describe('Thread IDs to trash') },
    'write',
    async ({ threadIds }) => {
      const threads = await DatabaseStore.modelify<Thread>(Thread, threadIds);
      const err = assertThreadsAllowed(threads);
      if (err) return errorResult(err);

      const tasks = TaskFactory.tasksForMovingToTrash({ threads, source: 'MCP' });
      for (const task of tasks) Actions.queueTask(task);

      return textResult({ trashed: threadIds.length });
    }
  );

  defineTool(
    server,
    'move_to_folder',
    'Move threads to a specific folder',
    {
      threadIds: z.array(z.string()).describe('Thread IDs to move'),
      folderId: z.string().describe('Target folder ID'),
    },
    'write',
    async ({ threadIds, folderId }) => {
      const threads = await DatabaseStore.modelify<Thread>(Thread, threadIds);
      const err = assertThreadsAllowed(threads);
      if (err) return errorResult(err);

      const tasks = TaskFactory.tasksForThreadsByAccountId(threads, (accountThreads, accountId) => {
        // Skip accounts where the destination folder itself is excluded,
        // rather than moving mail into a folder the operator hid.
        if (!isFolderAllowed(accountId, folderId)) return null;
        const folder = CategoryStore.byId(accountId, folderId);
        if (!folder) return null;
        return new ChangeFolderTask({ folder, threads: accountThreads, source: 'MCP' });
      });
      for (const task of tasks) Actions.queueTask(task);

      return textResult({ moved: threadIds.length, folderId });
    }
  );

  defineTool(
    server,
    'set_labels',
    'Add or remove labels from threads (Gmail only)',
    {
      threadIds: z.array(z.string()).describe('Thread IDs'),
      labelsToAdd: z.array(z.string()).optional().describe('Label IDs to add'),
      labelsToRemove: z.array(z.string()).optional().describe('Label IDs to remove'),
    },
    'write',
    async ({ threadIds, labelsToAdd, labelsToRemove }) => {
      const threads = await DatabaseStore.modelify<Thread>(Thread, threadIds);
      if (threads.length === 0) return errorResult('No threads found');

      const threadsErr = assertThreadsAllowed(threads);
      if (threadsErr) return errorResult(threadsErr);

      for (const t of threads) {
        const account = AccountStore.accountForId(t.accountId);
        if (!account || !account.usesLabels()) {
          return errorResult(`Account '${t.accountId}' does not use labels (not Gmail)`);
        }
      }

      const accountId = threads[0].accountId;
      for (const id of [...(labelsToAdd || []), ...(labelsToRemove || [])]) {
        if (!isFolderAllowed(accountId, id)) {
          return errorResult(`Access denied: label '${id}' is excluded from MCP access.`);
        }
      }

      const addLabels = (labelsToAdd || [])
        .map((id) => CategoryStore.byId(accountId, id))
        .filter((l): l is Label => l instanceof Label);

      const removeLabels = (labelsToRemove || [])
        .map((id) => CategoryStore.byId(accountId, id))
        .filter((l): l is Label => l instanceof Label);

      const task = new ChangeLabelsTask({
        labelsToAdd: addLabels,
        labelsToRemove: removeLabels,
        threads,
        source: 'MCP',
      });
      Actions.queueTask(task);

      return textResult({ updated: threadIds.length });
    }
  );

  defineTool(
    server,
    'set_unread',
    'Mark threads as read or unread',
    {
      threadIds: z.array(z.string()).describe('Thread IDs'),
      unread: z.boolean().describe('true to mark unread, false to mark read'),
    },
    'write',
    async ({ threadIds, unread }) => {
      const threads = await DatabaseStore.modelify<Thread>(Thread, threadIds);
      const err = assertThreadsAllowed(threads);
      if (err) return errorResult(err);

      const task = TaskFactory.taskForSettingUnread({ threads, unread, source: 'MCP' });
      Actions.queueTask(task);

      return textResult({ updated: threadIds.length, unread });
    }
  );

  defineTool(
    server,
    'set_starred',
    'Star or unstar threads',
    {
      threadIds: z.array(z.string()).describe('Thread IDs'),
      starred: z.boolean().describe('true to star, false to unstar'),
    },
    'write',
    async ({ threadIds, starred }) => {
      const threads = await DatabaseStore.modelify<Thread>(Thread, threadIds);
      const err = assertThreadsAllowed(threads);
      if (err) return errorResult(err);

      const task = new ChangeStarredTask({ threads, starred, source: 'MCP' });
      Actions.queueTask(task);

      return textResult({ updated: threadIds.length, starred });
    }
  );

  // ── Send Tool ──

  defineTool(
    server,
    'send_draft',
    'Send an existing draft by its headerMessageId',
    { headerMessageId: z.string().describe('The headerMessageId of the draft to send') },
    'send',
    async ({ headerMessageId }) => {
      const draft = await DatabaseStore.findBy<Message>(Message, {
        headerMessageId,
        draft: true,
      }).include(Message.attributes.body);

      if (!draft || !isMessageAllowed(draft)) {
        return errorResult(`Draft with headerMessageId '${headerMessageId}' not found`);
      }

      const task = SendDraftTask.forSending(draft, { silent: true });
      Actions.queueTask(task);

      return textResult({ sent: true, headerMessageId });
    }
  );

  // ── Send Later Tools ──

  defineTool(
    server,
    'schedule_send',
    'Schedule an existing draft to be sent automatically at a future date/time, equivalent to the "Send Later" composer button. The draft is sent once the scheduled time passes; use cancel_scheduled_send to undo.',
    {
      headerMessageId: z.string().describe('The headerMessageId of the draft to schedule'),
      sendAt: z.string().describe('ISO 8601 date-time in the future to send the draft at'),
      actionKey: z
        .string()
        .optional()
        .describe(
          "Optional send action key to use when the draft is sent (defaults to the account's default send action)"
        ),
    },
    'send',
    async ({ headerMessageId, sendAt, actionKey }) => {
      const sendAtDate = new Date(sendAt);
      if (isNaN(sendAtDate.getTime())) {
        return errorResult(`Invalid sendAt date: '${sendAt}'`);
      }
      if (sendAtDate.getTime() <= Date.now()) {
        return errorResult('sendAt must be in the future');
      }

      const draft = await DatabaseStore.findBy<Message>(Message, {
        headerMessageId,
        draft: true,
      });
      if (!draft || !isMessageAllowed(draft)) {
        return errorResult(`Draft with headerMessageId '${headerMessageId}' not found`);
      }

      const task = SyncbackMetadataTask.forSaving({
        model: draft,
        pluginId: SEND_LATER_ID,
        value: {
          expiration: sendAtDate,
          actionKey: actionKey || SendActionsStore.DefaultSendActionKey,
        },
        undoValue: { expiration: null },
      });
      Actions.queueTask(task);

      return textResult({ scheduled: true, headerMessageId, sendAt: sendAtDate });
    }
  );

  defineTool(
    server,
    'cancel_scheduled_send',
    'Cancel a pending "Send Later" schedule on a draft so it will not be sent automatically. Errors if the draft has no active schedule.',
    { headerMessageId: z.string().describe('The headerMessageId of the draft') },
    'write',
    async ({ headerMessageId }) => {
      const draft = await DatabaseStore.findBy<Message>(Message, {
        headerMessageId,
        draft: true,
      });
      if (!draft || !isMessageAllowed(draft)) {
        return errorResult(`Draft with headerMessageId '${headerMessageId}' not found`);
      }

      const metadata = draft.metadataForPluginId(SEND_LATER_ID) as SendLaterMetadata | null;
      if (!metadata || !metadata.expiration) {
        return errorResult(`Draft '${headerMessageId}' does not have a pending scheduled send`);
      }

      Actions.queueTask(
        SyncbackMetadataTask.forSaving({
          model: draft,
          pluginId: SEND_LATER_ID,
          value: { expiration: null },
        })
      );

      return textResult({ cancelled: true, headerMessageId });
    }
  );

  defineTool(
    server,
    'list_scheduled_sends',
    'List drafts that currently have a pending "Send Later" schedule, i.e. will be sent automatically at a future time.',
    { accountId: z.string().optional().describe('Restrict to a single account') },
    'read',
    async ({ accountId }) => {
      if (accountId) {
        const err = checkAccountAccess(accountId);
        if (err) return errorResult(err);
      }

      let dbQuery = DatabaseStore.findAll<Message>(Message)
        .where([Message.attributes.draft.equal(true)])
        .where(Message.attributes.pluginMetadata.contains(SEND_LATER_ID))
        .distinct();
      if (accountId) {
        dbQuery = dbQuery.where({ accountId });
      } else {
        const allowedIds = getAllowedAccountIds(AccountStore.accounts().map((a) => a.id));
        dbQuery = dbQuery.where(Message.attributes.accountId.in(allowedIds));
      }

      const drafts = await dbQuery;
      const now = new Date();

      const results = drafts
        .filter(isMessageAllowed)
        .map((d) => ({
          draft: d,
          metadata: d.metadataForPluginId(SEND_LATER_ID) as SendLaterMetadata | null,
        }))
        .filter(({ metadata }) => metadata && metadata.expiration && metadata.expiration > now)
        .sort((a, b) => a.metadata.expiration.getTime() - b.metadata.expiration.getTime())
        .map(({ draft, metadata }) => ({
          headerMessageId: draft.headerMessageId,
          threadId: draft.threadId,
          subject: draft.subject,
          to: (draft.to || []).map((c) => ({ name: c.name, email: c.email })),
          accountId: draft.accountId,
          sendAt: metadata.expiration,
          actionKey: metadata.actionKey || null,
        }));

      return textResult(results);
    }
  );
}
