import {
  AccountStore,
  CategoryStore,
  DatabaseStore,
  SearchQueryParser,
  Thread,
} from 'mailspring-exports';
import { insightStore } from '../stores/insight-store';
import { formatContact } from './context';

export type ThreadView =
  | 'inbox'
  | 'unread'
  | 'starred'
  | 'sent'
  | 'archive'
  | 'needs_reply'
  | 'priority';

const byRecent = (a: any, b: any) =>
  (b.lastMessageReceivedTimestamp?.valueOf() || 0) -
  (a.lastMessageReceivedTimestamp?.valueOf() || 0);

export function serializeThread(t: any) {
  const insight = insightStore.get(t.id);
  return {
    thread_id: t.id,
    subject: t.subject,
    participants: (t.participants || []).slice(0, 6).map(formatContact),
    last_message_at: t.lastMessageReceivedTimestamp?.toISOString?.() ?? null,
    unread: !!t.unread,
    starred: !!t.starred,
    snippet: (t.snippet || '').slice(0, 200),
    ...(insight
      ? {
          ai_priority: insight.priority,
          ai_summary: insight.summary,
          ai_needs_reply: insight.needs_reply,
          ai_security_warning: insight.security_warning,
        }
      : {}),
  };
}

function accountIds(): string[] {
  return (AccountStore.accounts() || []).map((a: any) => a.id);
}

export async function searchThreads(query: string, limit = 15) {
  let q = DatabaseStore.findAll(Thread).where(Thread.attributes.accountId.in(accountIds()));
  try {
    q = q.structuredSearch(SearchQueryParser.parse(query));
  } catch {
    q = q.search(query);
  }
  const threads = await q
    .order(Thread.attributes.lastMessageReceivedTimestamp.descending())
    .limit(limit);
  return threads.map(serializeThread);
}

export async function threadsByIds(ids: string[]) {
  if (!ids.length) return [];
  const threads = await DatabaseStore.findAll(Thread).where({ id: ids });
  return threads.sort(byRecent);
}

export async function listThreads(view: ThreadView, limit = 20) {
  if (view === 'needs_reply' || view === 'priority') {
    const ids = insightStore.threadIdsWhere((i) =>
      view === 'needs_reply' ? i.needs_reply : i.priority === 'urgent' || i.priority === 'high'
    );
    return (await threadsByIds(ids)).slice(0, limit).map(serializeThread);
  }

  const results: any[] = [];
  for (const accountId of accountIds()) {
    let q = DatabaseStore.findAll(Thread).where({ accountId });
    if (view === 'unread') q = q.where({ unread: true, inAllMail: true });
    else if (view === 'starred') q = q.where({ starred: true });
    else {
      const category =
        view === 'inbox'
          ? CategoryStore.getInboxCategory(accountId)
          : view === 'sent'
            ? CategoryStore.getCategoryByRole(accountId, 'sent')
            : CategoryStore.getArchiveCategory(accountId);
      if (!category) continue;
      q = q.where([Thread.attributes.categories.contains(category.id)]);
    }
    results.push(
      ...(await q.order(Thread.attributes.lastMessageReceivedTimestamp.descending()).limit(limit))
    );
  }
  return results.sort(byRecent).slice(0, limit).map(serializeThread);
}

export async function openActionItems() {
  const insights = insightStore
    .all()
    .filter((i) => i.action_items.some((_, idx) => !(i.done || []).includes(idx)));
  const threads = await threadsByIds(insights.map((i) => i.threadId));
  const subjects = new Map(threads.map((t: any) => [t.id, t.subject]));
  return insights.flatMap((i) =>
    i.action_items
      .map((item, idx) => ({ ...item, idx }))
      .filter(({ idx }) => !(i.done || []).includes(idx))
      .map(({ text, due }) => ({
        thread_id: i.threadId,
        subject: subjects.get(i.threadId) || '',
        task: text,
        due,
      }))
  );
}
