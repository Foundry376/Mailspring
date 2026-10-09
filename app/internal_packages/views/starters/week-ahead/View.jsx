import React, { useMemo } from 'react';
import { CalendarDays, Clock, ListChecks, MessagesSquare, Video, ChevronRight } from 'lucide-react';
import { useEvents, useFreeBusy, useThreads, ui } from '@mailspring/view';

const DAYS = 7;
const WORK_START_HOUR = 9;
const WORK_END_HOUR = 17;
const THREAD_WINDOW_DAYS = 30;
const MAX_PEOPLE = 50;

// Day precision keeps ranges identical across renders, so hooks don't resubscribe.
function weekRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + DAYS);
  return { start: start.toISOString(), end: end.toISOString() };
}

const dayKey = (iso) => new Date(iso).toDateString();
const timeOf = (iso) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const dayLabel = (iso) => {
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
  return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
};
const minutesLabel = (m) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}` : `${m}m`);

const othersIn = (event) =>
  [...(event.attendees || []), event.organizer].filter((p) => p && p.email && !p.isMe);

function Card({ icon: Icon, title, right, children }) {
  return (
    <section className="rounded-lg border border-ms-border bg-ms-panel">
      <header className="flex items-center gap-2 px-4 py-2.5 border-b border-ms-border">
        <Icon size={15} className="text-ms-muted" />
        <h2 className="text-sm font-semibold flex-1">{title}</h2>
        {right && <span className="text-xs text-ms-muted">{right}</span>}
      </header>
      {children}
    </section>
  );
}

/** Weekday working-hours free time, from the host's merged busy intervals. */
function freeTimeByDay(busy, range) {
  const out = [];
  const day = new Date(range.start);
  for (let i = 0; i < DAYS; i++, day.setDate(day.getDate() + 1)) {
    if (day.getDay() === 0 || day.getDay() === 6) continue;
    const ws = new Date(day);
    ws.setHours(WORK_START_HOUR, 0, 0, 0);
    const we = new Date(day);
    we.setHours(WORK_END_HOUR, 0, 0, 0);
    let busyMinutes = 0;
    for (const b of busy) {
      const s = Math.max(Date.parse(b.start), ws.getTime());
      const e = Math.min(Date.parse(b.end), we.getTime());
      if (e > s) busyMinutes += (e - s) / 60000;
    }
    const total = (WORK_END_HOUR - WORK_START_HOUR) * 60;
    out.push({ iso: ws.toISOString(), free: Math.max(0, Math.round(total - busyMinutes)), total });
  }
  return out;
}

export default function WeekAhead() {
  const range = useMemo(weekRange, []);
  const { data: events, loading } = useEvents(range);
  const { data: freeBusy } = useFreeBusy(range);

  const meetings = useMemo(
    () => (events || []).filter((e) => !e.allDay && e.status !== 'CANCELLED'),
    [events]
  );

  // One thread query covers everyone in this week's meetings; threads are matched back to
  // meetings by participant below.
  const people = useMemo(() => {
    const emails = new Set();
    for (const e of meetings) for (const p of othersIn(e)) emails.add(p.email.toLowerCase());
    return [...emails].slice(0, MAX_PEOPLE);
  }, [meetings]);
  const after = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - THREAD_WINDOW_DAYS);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }, []);
  const { data: threads } = useThreads(
    people.length
      ? { where: { and: [{ participant: people }, { date: { after } }] }, limit: 200 }
      : null
  );

  const threadsFor = (event) => {
    const emails = new Set(othersIn(event).map((p) => p.email.toLowerCase()));
    return (threads || []).filter((t) =>
      (t.participants || []).some((p) => !p.isMe && emails.has((p.email || '').toLowerCase()))
    );
  };

  const prep = useMemo(() => {
    const items = [];
    const sorted = [...meetings].sort((a, b) => a.start.localeCompare(b.start));
    for (const e of sorted) {
      if (e.myStatus === 'needs-action' || e.myStatus === 'tentative') {
        items.push({ event: e, text: `Respond to "${e.title}"` });
      }
      const related = threadsFor(e);
      if (related.length) {
        items.push({ event: e, text: `Skim ${related.length} recent thread${related.length > 1 ? 's' : ''} before "${e.title}"` });
      }
      if (othersIn(e).length && !e.conferenceUrl && !e.location) {
        items.push({ event: e, text: `"${e.title}" has no location or call link` });
      }
    }
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i - 1].end > sorted[i].start && dayKey(sorted[i].start) === dayKey(sorted[i - 1].start)) {
        items.push({ event: sorted[i], text: `"${sorted[i - 1].title}" overlaps "${sorted[i].title}"` });
      }
    }
    return items;
    // threads changes the per-meeting counts
  }, [meetings, threads]);

  const byDay = useMemo(() => {
    const groups = new Map();
    for (const e of [...meetings].sort((a, b) => a.start.localeCompare(b.start))) {
      const k = dayKey(e.start);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(e);
    }
    return [...groups.values()];
  }, [meetings]);

  const free = freeBusy && freeBusy.busy ? freeTimeByDay(freeBusy.busy, range) : [];

  return (
    <div className="p-6 pb-20 max-w-5xl mx-auto space-y-5 text-ms-text">
      <header className="flex items-center gap-3">
        <CalendarDays size={22} className="text-ms-accent" />
        <div>
          <h1 className="text-xl font-semibold text-ms-heading">Week ahead</h1>
          <p className="text-sm text-ms-muted">
            {loading ? 'Loading your calendar…' : `${meetings.length} meetings over the next ${DAYS} days`}
          </p>
        </div>
      </header>

      <div className="grid gap-5 md:grid-cols-3">
        <div className="md:col-span-2 space-y-5">
          {!loading && !byDay.length && (
            <Card icon={CalendarDays} title="Meetings">
              <p className="px-4 py-6 text-sm text-ms-muted">Nothing on your calendar this week.</p>
            </Card>
          )}
          {byDay.map((dayEvents) => (
            <Card key={dayKey(dayEvents[0].start)} icon={CalendarDays} title={dayLabel(dayEvents[0].start)} right={`${dayEvents.length}`}>
              <ul className="divide-y divide-ms-border">
                {dayEvents.map((e) => {
                  const related = threadsFor(e).slice(0, 3);
                  return (
                    <li key={e.id} className="px-4 py-3">
                      <div className="flex items-start gap-3">
                        <span className="w-20 shrink-0 text-xs text-ms-muted pt-0.5">{timeOf(e.start)}</span>
                        <div className="flex-1 min-w-0">
                          <button className="text-left font-medium hover:underline" onClick={() => ui.showEvent(e.id)}>
                            {e.title || '(no title)'}
                          </button>
                          <div className="text-xs text-ms-muted truncate">
                            {othersIn(e).map((p) => p.name || p.email).join(', ') || 'Just you'}
                            {e.myStatus === 'needs-action' && <span className="text-ms-warning"> · not answered</span>}
                          </div>
                          {related.length > 0 && (
                            <ul className="mt-2 space-y-1">
                              {related.map((t) => (
                                <li key={t.id}>
                                  <button className="flex items-center gap-1.5 text-xs text-ms-link hover:underline" onClick={() => ui.showThread(t.id)}>
                                    <MessagesSquare size={12} />
                                    <span className="truncate">{t.subject || '(no subject)'}</span>
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                        {e.conferenceUrl && (
                          <button className="shrink-0 text-ms-muted hover:text-ms-accent" title="Join call" onClick={() => ui.openExternal(e.conferenceUrl)}>
                            <Video size={16} />
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          ))}
        </div>

        <div className="space-y-5">
          <Card icon={ListChecks} title="Prep" right={prep.length ? `${prep.length}` : null}>
            {prep.length ? (
              <ul className="divide-y divide-ms-border">
                {prep.map((p, i) => (
                  <li key={i}>
                    <button className="w-full flex items-center gap-2 px-4 py-2 text-left text-sm hover:bg-ms-bg" onClick={() => ui.showEvent(p.event.id)}>
                      <span className="flex-1">{p.text}</span>
                      <ChevronRight size={14} className="text-ms-muted" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-4 text-sm text-ms-muted">Nothing to prepare.</p>
            )}
          </Card>

          <Card icon={Clock} title="Free time" right={`${WORK_START_HOUR}–${WORK_END_HOUR}h`}>
            <ul className="px-4 py-3 space-y-2">
              {free.map((d) => (
                <li key={d.iso} className="text-sm">
                  <div className="flex justify-between">
                    <span>{dayLabel(d.iso)}</span>
                    <span className="text-ms-muted">{minutesLabel(d.free)} free</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded bg-ms-border overflow-hidden">
                    <div className="h-full bg-ms-accent" style={{ width: `${Math.round((100 * d.free) / d.total)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
