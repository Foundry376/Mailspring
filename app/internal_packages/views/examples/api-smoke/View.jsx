import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import {
  useThreads,
  useMessages,
  useCounts,
  useEvents,
  useAccounts,
  useContent,
  useExtract,
  useTheme,
  useViewState,
  getThreads,
  getMessages,
  getCounts,
  getEvents,
  getContent,
  getIdentity,
  extract,
  setMetadata,
  modify,
  ui,
  MessageView,
  ViewError,
} from '@mailspring/view';

// Exercises every @mailspring/view call against the live mailbox and reports pass/fail.
// Results are also published on window.__smoke for CDP-driven checks.

const until = (predicate, timeoutMs = 20000) =>
  new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      const value = predicate();
      if (value) return resolve(value);
      if (Date.now() - start > timeoutMs) return reject(new Error('timed out'));
      setTimeout(tick, 200);
    };
    tick();
  });

function useResults() {
  const [results, setResults] = useState({});
  const record = (name, ok, detail) =>
    setResults((r) => {
      const next = { ...r, [name]: { ok, detail: String(detail ?? '') } };
      window.__smoke = next;
      return next;
    });
  return [results, record];
}

async function check(record, name, fn) {
  try {
    const detail = await fn();
    record(name, true, detail);
  } catch (err) {
    record(name, false, `${err.code ? `[${err.code}] ` : ''}${err.message}`);
  }
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

export default function ApiSmoke() {
  const [results, record] = useResults();
  const theme = useTheme();
  const accounts = useAccounts();
  const inbox = useThreads({ search: 'in:inbox', limit: 5 });
  const tagged = useThreads({ tagged: true, limit: 50 });
  const linkedin = useMessages({ search: 'from:linkedin.com', limit: 5 });
  const heatmap = useCounts('since:"30 days ago"', ['weekday', 'hour']);
  const events = useEvents({ start: new Date(), end: new Date(Date.now() + 30 * 86400000) });
  const content = useContent(linkedin.data.slice(0, 2).map((m) => m.id));
  const live = useExtract(
    linkedin.data.length
      ? { ids: linkedin.data.map((m) => m.id), schema: { title: 'string', sender: 'string' } }
      : null
  );
  const nullQuery = useThreads(null);
  const [runs, setRuns] = useViewState('runs', 0);
  const taggedRef = useRef(tagged);
  taggedRef.current = tagged;
  const started = useRef(false);

  // Live hooks: record once they settle.
  useEffect(() => {
    if (accounts.data.length) {
      record('useAccounts', true, `${accounts.data.length} accounts, ${accounts.data[0].categories.length} categories in the first`);
    }
  }, [accounts.data]);
  useEffect(() => {
    if (!inbox.loading) {
      const t = inbox.data[0];
      record(
        'useThreads',
        inbox.data.length > 0 && !inbox.error,
        t ? `${inbox.data.length} threads; first with ${t.participants[0]?.email} (isMe=${t.participants[0]?.isMe}) at ${t.lastReceivedAt}` : inbox.error?.message
      );
    }
  }, [inbox]);
  useEffect(() => {
    if (!linkedin.loading) {
      const m = linkedin.data[0];
      record('useMessages', !!m, m ? `${linkedin.data.length} messages; "${m.subject}" from ${m.from?.email}` : 'none');
    }
  }, [linkedin]);
  useEffect(() => {
    if (!heatmap.loading && heatmap.data.length) {
      const top = heatmap.data[0];
      record('useCounts', true, `${heatmap.data.length} cells; busiest weekday ${top.key.weekday} hour ${top.key.hour} (${top.count})`);
    }
  }, [heatmap]);
  useEffect(() => {
    if (!events.loading) {
      record('useEvents', !events.error, events.error ? events.error.message : `${events.data.length} events in the next 30 days${events.data[0] ? `; first "${events.data[0].title}"` : ''}`);
    }
  }, [events]);
  useEffect(() => {
    const ids = Object.keys(content.data);
    if (ids.length) {
      const text = content.data[ids[0]].text || '';
      record('useContent', text.length > 0, `${ids.length} bodies; first ${text.length} chars: ${text.slice(0, 60).replace(/\n/g, ' ⏎ ')}`);
    }
  }, [content.data]);
  useEffect(() => {
    if (live.status === 'done' || live.status === 'error') {
      const hits = Object.values(live.results).filter((r) => r.value).length;
      record('useExtract', live.status === 'done', `${live.status}: ${live.processed}/${live.total} processed, ${hits} with structured data`);
    }
  }, [live.status]);
  useEffect(() => {
    record('useThreads(null)', nullQuery.data.length === 0 && !nullQuery.loading, 'empty, not loading');
  }, []);

  // One-shot calls, writes, and errors.
  useEffect(() => {
    if (started.current || !inbox.data.length) return;
    started.current = true;
    setRuns(runs + 1);
    const thread = inbox.data[0];

    (async () => {
      await check(record, 'getThreads (paging)', async () => {
        const page = await getThreads({ search: 'in:inbox', limit: 3, offset: 3 });
        assert(page.items.length === 3 && page.hasMore, `got ${page.items.length}, hasMore=${page.hasMore}`);
        return `3 items from offset 3, hasMore`;
      });
      await check(record, 'getMessages (threadId)', async () => {
        const { items } = await getMessages({ threadId: thread.id });
        assert(items.length > 0 && items.every((m) => m.threadId === thread.id), 'no messages');
        return `${items.length} messages in "${thread.subject}"`;
      });
      await check(record, 'getCounts (category labels)', async () => {
        const rows = await getCounts('since:"90 days ago"', 'category');
        assert(rows.length > 0, 'no rows');
        return rows.slice(0, 3).map((r) => `${r.labels.category || r.key.category}: ${r.count}`).join(', ');
      });
      await check(record, 'getCounts (top senders)', async () => {
        const rows = await getCounts('since:"90 days ago"', 'sender');
        return rows.slice(0, 3).map((r) => `${r.key.sender}: ${r.count}`).join(', ');
      });
      await check(record, 'getEvents', async () => {
        const list = await getEvents({ start: new Date(Date.now() - 7 * 86400000), end: new Date() });
        return `${list.length} events last week`;
      });
      await check(record, 'getContent (structured)', async () => {
        const { items } = await getMessages({ search: 'has:attachment OR order OR shipped', limit: 40 });
        const out = await getContent(items.map((m) => m.id), { text: false, structured: true });
        const withData = Object.values(out).filter((c) => c.structured.length);
        return `${withData.length}/${items.length} messages carry schema.org data${withData[0] ? ` (e.g. ${withData[0].structured[0]['@type']})` : ''}`;
      });
      await check(record, 'extract (promise)', async () => {
        const { items } = await getMessages({ search: 'in:inbox', limit: 10 });
        const res = await extract({ ids: items.map((m) => m.id), schema: { kind: { type: 'enum', values: ['receipt', 'shipping', 'newsletter'] } } });
        return `${Object.keys(res).length} results`;
      });
      await check(record, 'setMetadata + tagged', async () => {
        const stamp = new Date().toISOString();
        await setMetadata(thread, { smoke: stamp });
        await until(() => taggedRef.current.data.find((t) => t.id === thread.id && t.meta?.smoke === stamp));
        await setMetadata(thread, null);
        await until(() => !taggedRef.current.data.find((t) => t.id === thread.id));
        return 'appeared in useThreads({ tagged }) with .meta, then cleared';
      });
      await check(record, 'modify (star, unstar)', async () => {
        const wasStarred = thread.starred;
        await modify([thread], { starred: !wasStarred });
        await modify([thread.id], { starred: wasStarred });
        return `toggled starred on "${thread.subject}" and back`;
      });
      await check(record, 'ui.setBadge', async () => {
        await ui.setBadge(3);
        return 'badge 3';
      });
      await check(record, 'error: limit', async () => {
        try {
          await getThreads({ search: 'in:inbox', limit: 5000 });
        } catch (err) {
          assert(err instanceof ViewError && err.code === 'limit', `wrong error ${err.code}`);
          return err.message;
        }
        throw new Error('no error');
      });
      await check(record, 'JSON: where (in + unread)', async () => {
        const { items } = await getThreads({ where: { and: [{ in: 'inbox' }, { unread: true }] }, limit: 5 });
        assert(items.every((t) => t.unread), 'returned a read thread');
        return `${items.length} unread inbox threads`;
      });
      await check(record, 'JSON: direction sent (message-level)', async () => {
        const { items } = await getMessages({ where: { direction: 'sent' }, limit: 20 });
        assert(items.length > 0, 'no sent messages');
        assert(items.every((m) => m.isSent && m.from && m.from.isMe), 'a non-sent message came back');
        return `${items.length} sent`;
      });
      await check(record, 'JSON: participant (80 addresses)', async () => {
        const identity = await getIdentity();
        const people = Array.from({ length: 79 }, (_, i) => `nobody${i}@example.invalid`);
        const started = performance.now();
        const { items } = await getMessages({
          where: { participant: [...people, identity.addresses[0]] },
          limit: 10,
        });
        const ms = Math.round(performance.now() - started);
        assert(items.length > 0, 'no results');
        return `${items.length} messages in ${ms}ms`;
      });
      await check(record, 'string: 80-term OR', async () => {
        const terms = Array.from({ length: 40 }, (_, i) => `from:p${i}@example.invalid OR to:p${i}@example.invalid`);
        const started = performance.now();
        await getMessages({ search: terms.join(' OR '), limit: 10 });
        return `resolved in ${Math.round(performance.now() - started)}ms`;
      });
      await check(record, 'string: field group', async () => {
        const grouped = await getThreads({ search: 'subject:(invoice OR receipt OR linkedin)', limit: 50 });
        const ored = await getThreads({
          search: 'subject:invoice OR subject:receipt OR subject:linkedin',
          limit: 50,
        });
        assert(grouped.items.length === ored.items.length, `${grouped.items.length} vs ${ored.items.length}`);
        assert(grouped.items.length > 0, 'no results');
        return `${grouped.items.length} threads`;
      });
      await check(record, 'identity', async () => {
        const identity = await getIdentity();
        assert(identity.accounts.length > 0, 'no accounts');
        assert(identity.addresses.length >= identity.accounts.length, 'missing addresses');
        return `${identity.accounts.length} accounts, ${identity.addresses.length} addresses`;
      });
      await check(record, 'counts: names + isMe', async () => {
        const rows = await getCounts({ where: { direction: 'sent' } }, 'sender');
        assert(rows.length > 0 && rows.every((r) => r.isMe.sender), 'sent rows not flagged isMe');
        const received = await getCounts({ where: { direction: 'received' } }, 'sender');
        assert(received.some((r) => r.labels.sender), 'no sender names');
        return `${rows.length} own addresses; e.g. ${received.find((r) => r.labels.sender).labels.sender}`;
      });
      await check(record, 'snippets on threads', async () => {
        const { items } = await getThreads({ where: { in: 'inbox' }, limit: 20 });
        const withSnippet = items.filter((t) => t.snippet).length;
        assert(withSnippet > 0, 'no thread snippets');
        return `${withSnippet}/${items.length}`;
      });
      await check(record, 'error: where at top level', async () => {
        try {
          await getThreads({ from: 'uber.com' });
        } catch (err) {
          assert(err.code === 'invalid' && /where/.test(err.message), err.message);
          return err.message;
        }
        throw new Error('no error');
      });
      await check(record, 'error: unknown folder', async () => {
        try {
          await getThreads({ where: { in: 'Definitely Not A Folder' } });
        } catch (err) {
          assert(err.code === 'invalid', `wrong error ${err.code}`);
          return err.message;
        }
        throw new Error('no error');
      });
      await check(record, 'error: invalid schema', async () => {
        try {
          await extract({ ids: [thread.id], schema: { a: 'banana' } });
        } catch (err) {
          assert(err.code === 'invalid', `wrong error ${err.code}`);
          return err.message;
        }
        throw new Error('no error');
      });
    })();
  }, [inbox.data]);

  const names = Object.keys(results);
  const passed = names.filter((n) => results[n].ok).length;

  return (
    <div className="h-screen overflow-y-auto bg-ms-bg text-ms-text p-6 space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">@mailspring/view smoke test</h1>
        <span className="text-sm text-ms-muted">
          {passed}/{names.length} passing · run #{runs} · theme {theme.mode}
        </span>
      </div>
      <table className="w-full text-sm">
        <tbody>
          {names.map((name) => (
            <tr key={name} className="border-b border-ms-border align-top">
              <td className="py-1.5 pr-2 w-6">
                {results[name].ok ? (
                  <CheckCircle2 size={16} className="text-green-600" />
                ) : (
                  <XCircle size={16} className="text-ms-danger" />
                )}
              </td>
              <td className="py-1.5 pr-4 font-medium whitespace-nowrap">{name}</td>
              <td className="py-1.5 text-ms-muted break-all">{results[name].detail}</td>
            </tr>
          ))}
          {names.length < 20 && (
            <tr>
              <td className="py-1.5">
                <Loader2 size={16} className="animate-spin text-ms-muted" />
              </td>
              <td className="py-1.5 text-ms-muted">running…</td>
            </tr>
          )}
        </tbody>
      </table>
      <div className="flex flex-wrap gap-2 text-sm">
        <span className="text-ms-muted">Manual:</span>
        {inbox.data[0] && (
          <>
            <button className="text-ms-accent" onClick={() => ui.showThread(inbox.data[0].id)}>ui.showThread</button>
            <button className="text-ms-accent" onClick={() => ui.search('from:linkedin.com')}>ui.search</button>
            <button className="text-ms-accent" onClick={() => ui.compose({ to: ['test@example.com'], subject: 'From a View', body: 'Hello\nfrom the smoke test' })}>ui.compose</button>
            <button className="text-ms-accent" onClick={() => linkedin.data[0] && ui.reply(linkedin.data[0].id)}>ui.reply</button>
            <button className="text-ms-accent" onClick={() => ui.openExternal('https://getmailspring.com')}>ui.openExternal</button>
          </>
        )}
      </div>
      {linkedin.data[0] && <MessageView messageId={linkedin.data[0].id} compact />}
    </div>
  );
}
