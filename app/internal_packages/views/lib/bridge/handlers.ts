import { shell } from 'electron';
import { z } from 'zod';
import {
  Actions,
  AccountStore,
  CategoryStore,
  ChangeFolderTask,
  ChangeLabelsTask,
  ChangeStarredTask,
  DatabaseStore,
  DraftFactory,
  DraftStore,
  Label,
  Message,
  SyncbackMetadataTask,
  TaskFactory,
  Thread,
  localized,
} from 'mailspring-exports';
import { isMessageAllowed, isThreadAllowed } from '../../../mcp-server/lib/capabilities/grant';
import { messageQuery, threadQuery, MailQuery } from '../../../mcp-server/lib/capabilities/queries';
import { ViewError } from './errors';
import { ViewGrant, requirePermission } from './grant';
import { serializeAccount, serializeMessageSummary, serializeThreadSummary } from './serializers';
import { countMessages, Dim, DIMS } from './counts';
import { contentFor, messagesWithBodies } from './bodies';
import { eventQuery, parseRange, serializeEvents } from './events';
import { ViewBridgeEvents } from './view-events';
import { attachmentURLFor, renderableFor } from './renderable';

export interface BridgeContext {
  viewId: string;
  grant: ViewGrant;
  emit: (event: string, payload: any) => void;
}

export type Handler = (ctx: BridgeContext, params: any) => any;

// ── Parameter parsing ───────────────────────────────────────────────────────

export const LIMITS = {
  threads: { default: 100, max: 1000 },
  messages: { default: 100, max: 2000 },
  ids: 500,
  contentIds: 50,
  renderableIds: 10,
  metadataBytes: 4 * 1024,
};

const QueryObject = z.object({
  search: z.string().optional(),
  accountId: z.string().optional(),
  categoryId: z.string().optional(),
  threadId: z.string().optional(),
  ids: z.array(z.string()).max(LIMITS.ids).optional(),
  tagged: z.boolean().optional(),
  limit: z.number().int().positive().optional(),
  order: z.enum(['newest', 'oldest']).optional(),
});
const QueryParam = z.union([z.string(), QueryObject]);

export function parse<T>(schema: z.ZodType<T>, value: any): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new ViewError('invalid', `${issue.path.join('.') || 'params'}: ${issue.message}`);
  }
  return result.data;
}

/** Turns a View's Query into the shared MailQuery, applying defaults and caps. */
export function mailQuery(
  grant: ViewGrant,
  kind: 'threads' | 'messages',
  query: any,
  offset?: number
): MailQuery {
  const q = parse(QueryParam, query);
  const obj = typeof q === 'string' ? { search: q } : q;
  const { default: defaultLimit, max } = LIMITS[kind];
  if (obj.limit > max) {
    throw new ViewError('limit', `${kind} queries return at most ${max} items`);
  }
  return {
    search: obj.search,
    accountId: obj.accountId,
    categoryId: obj.categoryId,
    threadId: obj.threadId,
    ids: obj.ids,
    metadataPluginId: obj.tagged ? grant.namespace : undefined,
    order: obj.order,
    limit: obj.limit || defaultLimit,
    offset: offset || 0,
  };
}

// Writes of `null` are stored as `{}` (metadata rows can't be deleted), so `tagged` queries
// drop items whose metadata is empty.
function taggedFilter(q: MailQuery) {
  return (item: { meta: any } | null) => item && (!q.metadataPluginId || item.meta !== null);
}

/** Runs a find query for `limit + 1` rows so `hasMore` can be reported. */
export function threadsPage(grant: ViewGrant, q: MailQuery, threads: Thread[]) {
  const items = threads
    .slice(0, q.limit)
    .map((t) => serializeThreadSummary(grant, t))
    .filter(taggedFilter(q));
  return { items, hasMore: threads.length > q.limit };
}

export function messagesPage(grant: ViewGrant, q: MailQuery, messages: Message[]) {
  const items = messages
    .slice(0, q.limit)
    .map((m) => serializeMessageSummary(grant, m))
    .filter(taggedFilter(q));
  return { items, hasMore: messages.length > q.limit };
}

export function threadsFindQuery(grant: ViewGrant, q: MailQuery) {
  return threadQuery(grant.scope, { ...q, limit: q.limit + 1 });
}

export function messagesFindQuery(grant: ViewGrant, q: MailQuery) {
  return messageQuery(grant.scope, { ...q, limit: q.limit + 1 });
}

export function parseGroupBy(groupBy: any): Dim[] {
  const dims = parse(
    z.union([
      z.enum(DIMS as any),
      z
        .array(z.enum(DIMS as any))
        .min(1)
        .max(2),
    ]),
    groupBy
  );
  return [].concat(dims);
}

export function listAccounts(grant: ViewGrant) {
  return AccountStore.accounts()
    .filter((a) => grant.scope.accountIds === null || grant.scope.accountIds.includes(a.id))
    .map((a) => {
      const excluded = grant.scope.excludedFolderIds[a.id] || [];
      return serializeAccount(
        a,
        CategoryStore.categories(a).filter((c) => !excluded.includes(c.id))
      );
    });
}

// ── Writes ──────────────────────────────────────────────────────────────────

async function loadThreads(grant: ViewGrant, ids: string[]) {
  const threads = await DatabaseStore.findAll<Thread>(Thread).where(Thread.attributes.id.in(ids));
  if (threads.length !== ids.length || !threads.every((t) => isThreadAllowed(grant.scope, t))) {
    throw new ViewError('not_found', 'One or more threads were not found.');
  }
  return threads;
}

const ModifyChange = z
  .object({
    archive: z.literal(true).optional(),
    trash: z.literal(true).optional(),
    moveTo: z.string().optional(),
    addLabels: z.array(z.string()).optional(),
    removeLabels: z.array(z.string()).optional(),
    starred: z.boolean().optional(),
    unread: z.boolean().optional(),
  })
  .strict();

function tasksForChange(threads: Thread[], change: z.infer<typeof ModifyChange>) {
  const source = 'View';
  const tasks = [];
  if (change.archive) tasks.push(...TaskFactory.tasksForArchiving({ threads, source }));
  if (change.trash) tasks.push(...TaskFactory.tasksForMovingToTrash({ threads, source }));
  if (change.moveTo) {
    tasks.push(
      ...TaskFactory.tasksForThreadsByAccountId(threads, (accountThreads, accountId) => {
        const folder = CategoryStore.byId(accountId, change.moveTo);
        return folder ? new ChangeFolderTask({ folder, threads: accountThreads, source }) : null;
      })
    );
  }
  if (change.addLabels || change.removeLabels) {
    tasks.push(
      ...TaskFactory.tasksForThreadsByAccountId(threads, (accountThreads, accountId) => {
        const labels = (ids: string[] = []) =>
          ids.map((id) => CategoryStore.byId(accountId, id)).filter((l) => l instanceof Label);
        return new ChangeLabelsTask({
          labelsToAdd: labels(change.addLabels),
          labelsToRemove: labels(change.removeLabels),
          threads: accountThreads,
          source,
        });
      })
    );
  }
  if (change.starred !== undefined) {
    tasks.push(new ChangeStarredTask({ threads, starred: change.starred, source }));
  }
  if (change.unread !== undefined) {
    tasks.push(TaskFactory.taskForSettingUnread({ threads, unread: change.unread, source }));
  }
  return tasks;
}

function mailtoURL({ to, cc, subject, body }) {
  const params = [];
  if (cc && cc.length) params.push(`cc=${encodeURIComponent(cc.join(','))}`);
  if (subject) params.push(`subject=${encodeURIComponent(subject)}`);
  if (body) params.push(`body=${encodeURIComponent(body)}`);
  return `mailto:${encodeURIComponent((to || []).join(','))}?${params.join('&')}`;
}

// ── The method table ────────────────────────────────────────────────────────
// Subscription methods (`subscribe`, `unsubscribe`) and `ai.extract`'s job tracking live in
// view-bridge.ts because they hold per-View state.

export const HANDLERS: { [method: string]: Handler } = {
  'accounts.list': ({ grant }) => {
    requirePermission(grant, 'mail.read');
    return listAccounts(grant);
  },

  'threads.find': async ({ grant }, { query, offset }) => {
    requirePermission(grant, 'mail.read');
    const q = mailQuery(grant, 'threads', query, offset);
    return threadsPage(grant, q, await threadsFindQuery(grant, q));
  },

  'messages.find': async ({ grant }, { query, offset }) => {
    requirePermission(grant, 'mail.read');
    const q = mailQuery(grant, 'messages', query, offset);
    return messagesPage(grant, q, await messagesFindQuery(grant, q));
  },

  'counts.find': ({ grant }, { query, groupBy }) => {
    requirePermission(grant, 'mail.read');
    return countMessages(grant, mailQuery(grant, 'messages', query), parseGroupBy(groupBy));
  },

  'events.find': async ({ grant }, params) => {
    requirePermission(grant, 'calendar.read');
    const range = parseRange(params);
    return serializeEvents(grant, await eventQuery(range), range);
  },

  'messages.content': async ({ grant }, params) => {
    requirePermission(grant, 'mail.bodies');
    const { ids, ...opts } = parse(
      z.object({
        ids: z.array(z.string()).max(LIMITS.contentIds),
        text: z.boolean().optional(),
        html: z.boolean().optional(),
        structured: z.boolean().optional(),
        includeQuoted: z.boolean().optional(),
      }),
      params
    );
    const out = {};
    for (const message of await messagesWithBodies(grant, ids)) {
      out[message.id] = contentFor(message, opts);
    }
    return out;
  },

  'messages.renderable': async ({ grant }, params) => {
    requirePermission(grant, 'mail.bodies');
    const { ids, includeQuoted } = parse(
      z.object({
        ids: z.array(z.string()).min(1).max(LIMITS.renderableIds),
        includeQuoted: z.boolean().optional(),
      }),
      params
    );
    const out = {};
    for (const message of await messagesWithBodies(grant, ids)) {
      out[message.id] = await renderableFor(grant, message, { includeQuoted });
    }
    return out;
  },

  'attachments.url': async ({ grant }, params) => {
    requirePermission(grant, 'mail.bodies');
    const { fileId } = parse(z.object({ fileId: z.string() }), params);
    return { url: await attachmentURLFor(grant, fileId) };
  },

  'metadata.set': async ({ grant }, params) => {
    requirePermission(grant, 'metadata.own');
    const { kind, id, value } = parse(
      z.object({
        kind: z.enum(['thread', 'message']),
        id: z.string(),
        value: z.record(z.string(), z.any()).nullable(),
      }),
      params
    );
    if (JSON.stringify(value || {}).length > LIMITS.metadataBytes) {
      throw new ViewError('limit', `metadata values are limited to ${LIMITS.metadataBytes} bytes`);
    }
    const klass = kind === 'thread' ? Thread : Message;
    const model: Thread | Message = await DatabaseStore.find<any>(klass, id);
    const allowed =
      model &&
      (kind === 'thread'
        ? isThreadAllowed(grant.scope, model as Thread)
        : isMessageAllowed(grant.scope, model as Message));
    if (!allowed) throw new ViewError('not_found', `No ${kind} with id ${id}.`);

    Actions.queueTask(
      SyncbackMetadataTask.forSaving({
        model,
        pluginId: grant.namespace,
        value: value || {},
        undoValue: model.metadataForPluginId(grant.namespace) || {},
      })
    );
    return {};
  },

  'mail.modify': async ({ grant }, params) => {
    requirePermission(grant, 'mail.modify');
    const { threadIds, change } = parse(
      z.object({ threadIds: z.array(z.string()).min(1).max(LIMITS.ids), change: ModifyChange }),
      params
    );
    const tasks = tasksForChange(await loadThreads(grant, threadIds), change);
    Actions.queueTasks(tasks);
    return { taskIds: tasks.map((t) => t.id) };
  },

  'ui.showThread': async ({ grant }, params) => {
    const { id } = parse(z.object({ id: z.string() }), params);
    const thread = await DatabaseStore.find<Thread>(Thread, id);
    if (!thread || !isThreadAllowed(grant.scope, thread)) {
      throw new ViewError('not_found', `No thread with id ${id}.`);
    }
    Actions.setFocus({ collection: 'thread', item: thread });
    return {};
  },

  'ui.search': (ctx, params) => {
    const { search } = parse(z.object({ search: z.string().min(1) }), params);
    Actions.searchQuerySubmitted(search);
    return {};
  },

  'ui.compose': async (ctx, params) => {
    const fields = parse(
      z.object({
        to: z.array(z.string()).optional(),
        cc: z.array(z.string()).optional(),
        subject: z.string().optional(),
        body: z.string().optional(),
      }),
      params
    );
    const draft = await DraftFactory.createDraftForMailto(mailtoURL(fields as any));
    await (DraftStore as any)._finalizeAndPersistNewMessage(draft, { popout: true });
    return {};
  },

  'ui.reply': async ({ grant }, params) => {
    const { messageId, all } = parse(
      z.object({ messageId: z.string(), body: z.string().optional(), all: z.boolean().optional() }),
      params
    );
    const message = await DatabaseStore.find<Message>(Message, messageId);
    if (!message || !isMessageAllowed(grant.scope, message)) {
      throw new ViewError('not_found', `No message with id ${messageId}.`);
    }
    Actions.composeReply({
      threadId: message.threadId,
      messageId,
      type: all ? 'reply-all' : 'reply',
      behavior: 'prefer-existing',
      popout: true,
    });
    return {};
  },

  'ui.openExternal': ({ viewId }, params) => {
    const { url } = parse(z.object({ url: z.string().url() }), params);
    if (!/^https?:\/\//i.test(url)) {
      throw new ViewError('invalid', 'Only http and https links can be opened.');
    }
    const choice = require('@electron/remote').dialog.showMessageBoxSync({
      type: 'question',
      buttons: [localized('Open Link'), localized('Cancel')],
      defaultId: 0,
      cancelId: 1,
      message: localized('Open a link from the "%@" View?', viewId),
      detail: url,
    });
    if (choice === 0) shell.openExternal(url).catch(() => {});
    return { opened: choice === 0 };
  },

  'ui.setBadge': ({ viewId }, params) => {
    const { count } = parse(z.object({ count: z.number().int().min(0).nullable() }), params);
    ViewBridgeEvents.emit('badge', viewId, count);
    return {};
  },

  // Page Views have no height to report; sidebar hosts register their own handler.
  'ui.setHeight': () => ({}),
};
