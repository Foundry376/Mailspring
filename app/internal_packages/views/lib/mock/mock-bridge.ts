import { z } from 'zod';
import { ViewError } from '../bridge/errors';
import { ViewGrant, requirePermission } from '../bridge/grant';
import { BridgeContext, Handler, LIMITS, mailQuery, parse, parseGroupBy } from '../bridge/handlers';
import { freeBusy, parseRange, EventRange } from '../bridge/events';
import { ViewTheme, currentThemeTokens } from '../theme-tokens';
import { CONSENTED_PERMISSIONS, ViewPermission } from '../consent';
import { FULL_GRANT } from '../../../../src/services/mail-access/grant';
import { MockData, MockMessage, threadSummary } from './mock-data';
import { countMockMessages, findMessages, findThreads, matchingMessages } from './mock-query';

// Host handlers a mock render keeps: they report on the View itself rather than read data.
export const HOST_HANDLERS_IN_MOCK = ['ui.setHeight', 'view.diagnostic'];

/**
 * The bridge's method table for a View rendered from mock data. ViewBridge swaps it in for the
 * real handlers (see ViewBridgeOptions.mock), keeping dispatch, page tracking and size limits.
 * Reads answer from the mock data, writes change it in memory and re-push subscriptions so a
 * View can be clicked through, and every `ui.*` call is a no-op. Nothing here touches the
 * database, the sync engine, the network or the on-device model.
 *
 * Permissions are the ones the manifest declares, approved or not: mock data is not the user's,
 * so there is nothing to consent to, but a View that forgot to declare `mail.bodies` should
 * fail here exactly as it would for real.
 */
export class MockSource {
  data: MockData;
  grant: ViewGrant;
  /** A fixed theme for the render; null follows the app's theme. */
  theme: ViewTheme | null;
  private subscriptions = new Map<string, { kind: string; params: any; ctx: BridgeContext }>();
  private timers = new Set<NodeJS.Timeout>();

  constructor(
    viewId: string,
    declaredPermissions: string[],
    data: MockData,
    theme: ViewTheme | null = null
  ) {
    this.data = data;
    this.theme = theme;
    this.grant = {
      viewId,
      namespace: `view:${viewId}`,
      permissions: new Set(
        CONSENTED_PERMISSIONS.filter((p) => declaredPermissions.includes(p)) as ViewPermission[]
      ),
      scope: FULL_GRANT,
    };
  }

  resetPage() {
    this.subscriptions.clear();
    this.timers.forEach((t) => clearTimeout(t));
    this.timers.clear();
  }

  private later(fn: () => void) {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      fn();
    }, 0);
    this.timers.add(timer);
  }

  private messageById(id: string): MockMessage | null {
    for (const t of this.data.threads) {
      const m = t.messages.find((x) => x.summary.id === id);
      if (m) return m;
    }
    return null;
  }

  private eventsIn(range: EventRange) {
    const needle = range.search && range.search.toLowerCase();
    return this.data.events
      .map((e) => e.event)
      .filter((e) => {
        const start = Date.parse(e.start) / 1000;
        const end = Date.parse(e.end) / 1000;
        if (end <= range.startUnix || start >= range.endUnix) return false;
        if (range.calendarIds && !range.calendarIds.includes(e.calendarId)) return false;
        if (!range.includeDeclined && e.myStatus === 'declined') return false;
        if (range.attendee) {
          const emails = e.attendees.map((a) => a.email);
          if (e.organizer) emails.push(e.organizer.email);
          if (!emails.includes(range.attendee)) return false;
        }
        return (
          !needle ||
          [e.title, e.location, e.description].some((s) => (s || '').toLowerCase().includes(needle))
        );
      })
      .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  }

  private snapshot(kind: string, params: any): { data: any; hasMore?: boolean } {
    const { grant, data } = this;
    switch (kind) {
      case 'threads': {
        const { items, hasMore } = findThreads(data, mailQuery(grant, 'threads', params.query));
        return { data: items, hasMore };
      }
      case 'messages': {
        const { items, hasMore } = findMessages(data, mailQuery(grant, 'messages', params.query));
        return { data: items, hasMore };
      }
      case 'counts':
        return {
          data: countMockMessages(
            data,
            mailQuery(grant, 'messages', params.query),
            parseGroupBy(params.groupBy)
          ),
        };
      case 'events':
        requirePermission(grant, 'calendar.read');
        return { data: this.eventsIn(parseRange(params)) };
      case 'freeBusy': {
        requirePermission(grant, 'calendar.read');
        const range = parseRange({ ...params, includeDeclined: false });
        return { data: freeBusy(this.eventsIn(range), range) };
      }
      case 'calendars':
        requirePermission(grant, 'calendar.read');
        return { data: data.calendars };
      case 'accounts':
        return { data: data.accounts };
      default:
        throw new ViewError('invalid', `Unknown subscription kind "${kind}".`);
    }
  }

  private push(subId: string) {
    const sub = this.subscriptions.get(subId);
    if (!sub) return;
    try {
      const { data, hasMore } = this.snapshot(sub.kind, sub.params);
      sub.ctx.emit('subscription', { subId, data, hasMore: !!hasMore });
    } catch (err) {
      const error =
        err instanceof ViewError ? err.toJSON() : { code: 'internal', message: err.message };
      sub.ctx.emit('subscription.error', { subId, error });
    }
  }

  private changed() {
    this.later(() => [...this.subscriptions.keys()].forEach((id) => this.push(id)));
  }

  private targetIds(ids: string[] | undefined, query: any, max: number) {
    if (ids) return ids.slice(0, max);
    if (query === undefined) throw new ViewError('invalid', 'Pass ids or query.');
    return matchingMessages(this.data, mailQuery(this.grant, 'messages', query))
      .slice(0, max)
      .map((m) => m.summary.id);
  }

  private emitDone(ctx: BridgeContext, jobId: string, payload: any) {
    this.later(() =>
      ctx.emit('ai.progress', {
        jobId,
        status: 'done',
        modelStatus: 'ready',
        modelAvailable: true,
        ...payload,
      })
    );
  }

  handlers(): { [method: string]: Handler } {
    const { data } = this;
    const ok = () => ({});
    return {
      subscribe: (ctx, params) => {
        const { subId, kind } = parse(
          z.object({ subId: z.string().min(1), kind: z.string() }),
          params
        );
        // Validates the query now, so a bad one rejects the call as it would for real.
        this.snapshot(kind, params.params || {});
        this.subscriptions.set(subId, { kind, params: params.params || {}, ctx });
        this.later(() => this.push(subId));
        return { subId };
      },
      unsubscribe: (ctx, { subId }) => {
        this.subscriptions.delete(subId);
        return {};
      },

      'accounts.list': () => data.accounts,
      'identity.get': () => data.identity,
      'threads.find': (ctx, { query, offset }) =>
        findThreads(data, mailQuery(this.grant, 'threads', query, offset)),
      'messages.find': (ctx, { query, offset }) =>
        findMessages(data, mailQuery(this.grant, 'messages', query, offset)),
      'counts.find': (ctx, { query, groupBy }) =>
        countMockMessages(data, mailQuery(this.grant, 'messages', query), parseGroupBy(groupBy)),
      'events.find': (ctx, params) => this.snapshot('events', params).data,
      'events.freeBusy': (ctx, params) => this.snapshot('freeBusy', params).data,
      'calendars.find': (ctx, params) => this.snapshot('calendars', params).data,

      'messages.content': (ctx, params) => {
        requirePermission(this.grant, 'mail.bodies');
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
        for (const id of ids) {
          const m = this.messageById(id);
          if (!m) {
            out[id] = { text: null, reason: 'not_found' };
            continue;
          }
          out[id] = {
            ...(opts.text !== false ? { text: m.text } : {}),
            ...(opts.html ? { html: m.html } : {}),
            ...(opts.structured ? { structured: m.structured } : {}),
          };
        }
        return out;
      },
      'messages.renderable': (ctx, params) => {
        requirePermission(this.grant, 'mail.bodies');
        const { ids } = parse(
          z.object({
            ids: z.array(z.string()).min(1).max(LIMITS.renderableIds),
            includeQuoted: z.boolean().optional(),
          }),
          params
        );
        const out = {};
        for (const id of ids) {
          const m = this.messageById(id);
          const escaped = (m && m.text ? m.text : '').replace(
            /[&<>]/g,
            (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]
          );
          out[id] = {
            html: m
              ? `<!DOCTYPE html><meta charset="utf-8"><style>html, body { overflow: hidden !important; font-family: system-ui, sans-serif; }</style>` +
                (m.html || `<div style="white-space: pre-wrap">${escaped}</div>`)
              : null,
          };
        }
        return out;
      },
      'attachments.url': () => {
        throw new ViewError('not_found', 'Attachments are not available in mock data.');
      },

      'ai.extract': (ctx, params) => {
        const { jobId, schema, ids, query, events } = parse(
          z.object({
            jobId: z.string().min(1),
            schema: z.record(z.string(), z.any()),
            ids: z.array(z.string()).optional(),
            query: z.any().optional(),
            events: z.any().optional(),
            instructions: z.string().max(2000).optional(),
          }),
          params
        );
        requirePermission(this.grant, events !== undefined ? 'calendar.read' : 'mail.bodies');
        const shape = (value: object | null) => {
          if (!value) return null;
          const out = {};
          for (const key of Object.keys(schema))
            out[key] = value[key] !== undefined ? value[key] : null;
          return out;
        };
        let results;
        if (events !== undefined) {
          const only = Array.isArray(events.eventIds) ? new Set(events.eventIds) : null;
          const inRange = new Set(this.eventsIn(parseRange(events)).map((e) => e.eventId));
          results = data.events
            .filter((e) => inRange.has(e.event.eventId) && (!only || only.has(e.event.eventId)))
            .map((e) => ({
              eventId: e.event.eventId,
              value: shape(e.extract),
              confidence: e.extract ? 0.9 : 0,
              tier: 'model',
            }));
        } else {
          results = this.targetIds(ids, query, 2000).map((id) => {
            const m = this.messageById(id);
            return {
              messageId: id,
              value: shape(m && m.extract),
              confidence: m && m.extract ? 0.9 : 0,
              tier: 'model',
            };
          });
        }
        this.emitDone(ctx, jobId, { results, processed: results.length, total: results.length });
        return { jobId, total: results.length };
      },
      'ai.summarize': (ctx, params) => {
        requirePermission(this.grant, 'mail.bodies');
        const { jobId, ids, query } = params || ({} as any);
        const targets = this.targetIds(ids, query, 40);
        const results = targets.map((id) => {
          const m = this.messageById(id);
          const digest = (m && m.digest) || { gist: null, asks: null, needsAction: false };
          return { messageId: id, threadId: m ? m.thread.id : null, ...digest };
        });
        this.emitDone(ctx, jobId, { results, processed: results.length, total: results.length });
        return { jobId, total: results.length };
      },
      'ai.generate': (ctx, params) => {
        requirePermission(this.grant, 'mail.bodies');
        const { jobId, ids, query, task, maxMessages } = params || ({} as any);
        const targets = this.targetIds(ids, query, maxMessages || 40);
        const briefing = data.briefing || {};
        this.emitDone(ctx, jobId, {
          phase: 'briefing',
          processed: targets.length,
          total: targets.length,
          usedMessages: targets.length,
          priorities: briefing.priorities || [],
          groups: briefing.groups || [],
          headline: briefing.headline || null,
          text: task === 'prioritize' ? null : briefing.text || null,
          value: briefing.value || null,
        });
        return { jobId, total: targets.length };
      },
      'ai.cancel': ok,

      'metadata.set': (ctx, params) => {
        const { kind, id, value } = parse(
          z.object({
            kind: z.enum(['thread', 'message']),
            id: z.string(),
            value: z.record(z.string(), z.any()).nullable(),
          }),
          params
        );
        if (kind === 'thread') {
          const thread = data.threads.find((t) => t.id === id);
          if (!thread) throw new ViewError('not_found', `No thread ${id}.`);
          thread.meta = value;
        } else {
          const m = this.messageById(id);
          if (!m) throw new ViewError('not_found', `No message ${id}.`);
          m.meta = value;
          m.summary.meta = value;
        }
        this.changed();
        return {};
      },
      'mail.modify': (ctx, params) => {
        requirePermission(this.grant, 'mail.modify');
        const { threadIds, change } = params || ({} as any);
        for (const thread of data.threads.filter((t) => (threadIds || []).includes(t.id))) {
          if (change.unread !== undefined) {
            thread.unread = change.unread;
            thread.messages.forEach((m) => (m.summary.unread = change.unread));
          }
          if (change.starred !== undefined) thread.starred = change.starred;
          if (change.archive || change.trash) {
            const role = change.trash ? 'trash' : 'archive';
            const account = data.accounts.find((a) => a.id === thread.accountId);
            thread.categories = [account.categories.find((c) => c.role === role)];
            thread.messages.forEach((m) => (m.summary.categories = thread.categories));
          }
        }
        this.changed();
        return { taskIds: [] };
      },

      'calendar.rsvp': ok,
      'calendar.createEvent': () => ({ eventId: 'mock-event' }),
      'calendar.updateEvent': ok,
      'calendar.deleteEvent': ok,
      'credentials.status': () => {
        throw new ViewError('not_connected', 'Credentials are not available in mock data.');
      },
      'credentials.fetch': () => {
        throw new ViewError('not_connected', 'Credentials are not available in mock data.');
      },

      'theme.get': () => this.theme || currentThemeTokens(),
      'context.get': () => {
        const thread = data.threads.find((t) => t.id === data.selectedThreadId);
        return thread
          ? { thread: threadSummary(thread), messages: thread.messages.map((m) => m.summary) }
          : null;
      },
      'ui.showThread': ok,
      'ui.threadMenu': ok,
      'ui.showEvent': ok,
      'ui.showDate': ok,
      'ui.search': ok,
      'ui.compose': ok,
      'ui.reply': ok,
      'ui.openExternal': ok,
      'ui.setBadge': ok,
      'ui.print': ok,
      'ui.requestCredential': ok,

      // Mock-only: the runtime's loader asks for these before mounting the View.
      'mock.viewState': () => data.viewState,
      'mock.fetch': (ctx, params) => {
        const { url } = parse(z.object({ url: z.string(), method: z.string().optional() }), params);
        const entry = data.fetch
          .filter((f) => url.startsWith(f.url))
          .sort((a, b) => b.url.length - a.url.length)[0];
        if (!entry)
          throw new ViewError('not_found', `mock-data.json has no fetch entry for ${url}`);
        return { status: entry.status, contentType: entry.contentType, body: entry.body };
      },
    };
  }
}
