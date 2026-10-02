import _ from 'underscore';
import { z } from 'zod';
import {
  Rx,
  AccountStore,
  CategoryStore,
  DatabaseStore,
  Message,
  Thread,
} from 'mailspring-exports';
import { audited } from '../../mcp-server/lib/capabilities/audit';
import { currentThemeTokens, onThemeChange } from './theme-tokens';
import { ViewError } from './bridge/errors';
import { ViewGrant, grantForView, requirePermission } from './bridge/grant';
import {
  BridgeContext,
  Handler,
  HANDLERS,
  listAccounts,
  mailQuery,
  messagesFindQuery,
  messagesPage,
  parse,
  parseGroupBy,
  threadsFindQuery,
  threadsPage,
} from './bridge/handlers';
import { countMessages } from './bridge/counts';
import { eventQuery, parseRange, serializeEvents } from './bridge/events';
import { ExtractJob, runExtractJob, validateSchema } from './bridge/extract';

// Channel names shared with runtime/bridge.preload.js.
export const CALL_CHANNEL = 'mailspring-view:call';
export const REPLY_CHANNEL = 'mailspring-view:reply';
export const EVENT_CHANNEL = 'mailspring-view:event';

const MAX_SUBSCRIPTIONS = 16;
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const MAX_REQUEST_BYTES = 1024 * 1024;
// Token bucket per View: sustained calls per second, and the burst a page load may need.
const CALLS_PER_SECOND = 200;
const CALL_BURST = 400;
const WARN_INTERVAL_MS = 60 * 1000;
const SUBSCRIPTION_THROTTLE_MS = 250;
// Counts re-run a GROUP BY over every matching message, so they wait for a burst of sync
// changes to settle before refreshing.
const COUNTS_DEBOUNCE_MS = 2000;

interface Subscription {
  dispose: () => void;
  /** The latest snapshot withheld while the View is hidden. */
  pending?: any;
}

export interface ViewBridgeOptions {
  /** Extra methods merged over the built-ins, e.g. `ui.setHeight` for sidebar Views. */
  handlers?: { [method: string]: Handler };
}

function sizeChecked(payload: any) {
  if (JSON.stringify(payload).length > MAX_RESPONSE_BYTES) {
    throw new ViewError(
      'limit',
      'This response is larger than 4 MB. Lower the limit or request fewer ids.'
    );
  }
  return payload;
}

/**
 * Host side of one View's bridge. Receives calls from the guest's preload over the
 * webview's `ipc-message` event, dispatches them to the method table (bridge/handlers.ts
 * plus the stateful methods below), and replies or pushes events with `webview.send`.
 * Disposing it tears down every subscription and extraction job the View started.
 */
export class ViewBridge {
  readonly grant: ViewGrant;
  private webview: Electron.WebviewTag;
  private ctx: BridgeContext;
  private handlers: { [method: string]: Handler };
  private subscriptions = new Map<string, Subscription>();
  private jobs = new Map<string, ExtractJob>();
  private visible = true;
  private callTokens = CALL_BURST;
  private callTokensAt = Date.now();
  private lastWarnAt = new Map<string, number>();
  private unlistenTheme: () => void;

  constructor(viewId: string, webview: Electron.WebviewTag, options: ViewBridgeOptions = {}) {
    this.webview = webview;
    this.grant = grantForView(viewId);
    this.ctx = {
      viewId,
      grant: this.grant,
      emit: (event, payload) => this.emit(event, payload),
    };
    this.handlers = { ...HANDLERS, ...this.statefulHandlers(), ...(options.handlers || {}) };
    webview.addEventListener('ipc-message', this.onIPCMessage);
    this.unlistenTheme = onThemeChange(() => this.emit('theme', currentThemeTokens()));
  }

  dispose() {
    this.webview.removeEventListener('ipc-message', this.onIPCMessage);
    this.unlistenTheme();
    for (const sub of this.subscriptions.values()) sub.dispose();
    this.subscriptions.clear();
    for (const job of this.jobs.values()) job.cancelled = true;
    this.jobs.clear();
  }

  /**
   * Pushes an event to the View. Emitting `visibility` also pauses subscription pushes while
   * the View is hidden and sends each subscription's latest snapshot when it reappears.
   */
  emit(event: string, payload: any) {
    if (event === 'visibility') this.setVisible(!!(payload && payload.visible));
    this.send(EVENT_CHANNEL, { event, payload });
  }

  private setVisible(visible: boolean) {
    if (visible === this.visible) return;
    this.visible = visible;
    if (!visible) return;
    for (const sub of this.subscriptions.values()) {
      if (sub.pending !== undefined) {
        this.send(EVENT_CHANNEL, { event: 'subscription', payload: sub.pending });
        sub.pending = undefined;
      }
    }
  }

  private send(channel: string, payload: any) {
    try {
      this.webview.send(channel, payload);
    } catch {
      // The guest is gone or navigating; its subscriptions are torn down in dispose().
    }
  }

  private pushSnapshot(subId: string, data: any, hasMore?: boolean) {
    const sub = this.subscriptions.get(subId);
    if (!sub) return;
    let payload: any;
    try {
      payload = sizeChecked({ subId, data, hasMore: !!hasMore });
    } catch (err) {
      this.emit('subscription.error', { subId, error: err.toJSON() });
      return;
    }
    if (this.visible) {
      this.send(EVENT_CHANNEL, { event: 'subscription', payload });
    } else {
      sub.pending = payload;
    }
  }

  // ── Subscriptions ─────────────────────────────────────────────────────────

  private observableFor(
    kind: string,
    params: any
  ): Rx.Observable<{ data: any; hasMore?: boolean }> {
    const { grant } = this;
    switch (kind) {
      case 'threads': {
        requirePermission(grant, 'mail.read');
        const q = mailQuery(grant, 'threads', params.query);
        return Rx.Observable.fromQuery(threadsFindQuery(grant, q)).map((threads: Thread[]) => {
          const { items, hasMore } = threadsPage(grant, q, threads);
          return { data: items, hasMore };
        });
      }
      case 'messages': {
        requirePermission(grant, 'mail.read');
        const q = mailQuery(grant, 'messages', params.query);
        return Rx.Observable.fromQuery(messagesFindQuery(grant, q)).map((messages: Message[]) => {
          const { items, hasMore } = messagesPage(grant, q, messages);
          return { data: items, hasMore };
        });
      }
      case 'counts': {
        requirePermission(grant, 'mail.read');
        const q = mailQuery(grant, 'messages', params.query);
        const dims = parseGroupBy(params.groupBy);
        const changes = Rx.Observable.create((observer) =>
          Rx.Disposable.create(
            DatabaseStore.listen((change) => {
              if (change && ['Message', 'Thread'].includes(change.objectClass)) {
                observer.onNext(null);
              }
            })
          )
        ).debounce(COUNTS_DEBOUNCE_MS);
        return Rx.Observable.just(null)
          .merge(changes)
          .flatMapLatest(() => Rx.Observable.fromPromise(countMessages(grant, q, dims)))
          .map((rows) => ({ data: rows }));
      }
      case 'events': {
        requirePermission(grant, 'calendar.read');
        const range = parseRange(params);
        return Rx.Observable.fromQuery(eventQuery(range)).map((events) => ({
          data: serializeEvents(grant, events, range),
        }));
      }
      case 'accounts': {
        requirePermission(grant, 'mail.read');
        return Rx.Observable.fromStore<any>(AccountStore)
          .merge(Rx.Observable.fromStore<any>(CategoryStore))
          .map(() => ({ data: listAccounts(grant) }));
      }
      default:
        throw new ViewError('invalid', `Unknown subscription kind "${kind}".`);
    }
  }

  private statefulHandlers(): { [method: string]: Handler } {
    return {
      subscribe: (ctx, params) => {
        const { subId, kind } = parse(
          z.object({ subId: z.string().min(1), kind: z.string() }),
          params
        );
        if (this.subscriptions.has(subId)) {
          throw new ViewError('invalid', `Subscription ${subId} already exists.`);
        }
        if (this.subscriptions.size >= MAX_SUBSCRIPTIONS) {
          throw new ViewError(
            'limit',
            `A View can hold at most ${MAX_SUBSCRIPTIONS} subscriptions.`
          );
        }
        const observable = this.observableFor(kind, params.params || {});
        const push = _.throttle(
          ({ data, hasMore }) => this.pushSnapshot(subId, data, hasMore),
          SUBSCRIPTION_THROTTLE_MS
        );
        const disposable = observable.subscribe(push, (err) => {
          this.emit('subscription.error', {
            subId,
            error: { code: 'internal', message: err.message },
          });
        });
        this.subscriptions.set(subId, {
          dispose: () => {
            push.cancel();
            disposable.dispose();
          },
        });
        return { subId };
      },

      unsubscribe: (ctx, { subId }) => {
        const sub = this.subscriptions.get(subId);
        if (sub) {
          sub.dispose();
          this.subscriptions.delete(subId);
        }
        return {};
      },

      'ai.extract': async (ctx, params) => {
        requirePermission(this.grant, 'mail.bodies');
        const { jobId, schema, ids, query } = parse(
          z.object({
            jobId: z.string().min(1),
            schema: z.any(),
            ids: z.array(z.string()).optional(),
            query: z.any().optional(),
          }),
          params
        );
        let validSchema;
        try {
          validSchema = validateSchema(schema);
        } catch (err) {
          throw new ViewError('invalid', err.message);
        }
        let targetIds = ids;
        if (!targetIds) {
          if (query === undefined) throw new ViewError('invalid', 'Pass ids or query.');
          const q = mailQuery(this.grant, 'messages', query);
          const messages = await messagesFindQuery(this.grant, q);
          targetIds = messagesPage(this.grant, q, messages).items.map((m) => m.id);
        }
        const job: ExtractJob = { cancelled: false };
        this.jobs.set(jobId, job);
        runExtractJob(this.grant, targetIds, validSchema, job, (progress) => {
          if (job.cancelled) return;
          this.emit('ai.progress', { jobId, ...progress });
          if (progress.status !== 'running') this.jobs.delete(jobId);
        }).catch((err) => {
          this.jobs.delete(jobId);
          this.emit('ai.progress', {
            jobId,
            results: [],
            processed: 0,
            total: targetIds.length,
            status: 'error',
            error: { code: 'internal', message: err.message },
          });
        });
        return { jobId, total: Math.min(targetIds.length, 2000) };
      },

      'ai.cancel': (ctx, { jobId }) => {
        const job = this.jobs.get(jobId);
        if (job) job.cancelled = true;
        this.jobs.delete(jobId);
        return {};
      },

      'theme.get': () => currentThemeTokens(),
    };
  }

  // ── Dispatch ──────────────────────────────────────────────────────────────

  private takeCallToken() {
    const now = Date.now();
    this.callTokens = Math.min(
      CALL_BURST,
      this.callTokens + ((now - this.callTokensAt) / 1000) * CALLS_PER_SECOND
    );
    this.callTokensAt = now;
    if (this.callTokens < 1) return false;
    this.callTokens -= 1;
    return true;
  }

  // Failures here are usually caused by what the View sent, so they go to the console (once a
  // minute per method) rather than to Sentry, where a looping View could flood the project.
  private warn(method: string, err: Error) {
    const now = Date.now();
    if (now - (this.lastWarnAt.get(method) || 0) < WARN_INTERVAL_MS) return;
    this.lastWarnAt.set(method, now);
    console.warn(`View ${this.ctx.viewId}: ${method} failed`, err);
  }

  private onIPCMessage = async (event: Electron.IpcMessageEvent) => {
    if (event.channel !== CALL_CHANNEL) return;
    const { id, method, params } = event.args[0] || ({} as any);
    try {
      if (!this.takeCallToken()) {
        throw new ViewError('limit', 'Too many bridge calls. Slow down and retry.');
      }
      if ((JSON.stringify(params) || '').length > MAX_REQUEST_BYTES) {
        throw new ViewError('limit', 'Bridge calls are limited to 1 MB of parameters.');
      }
      const handler =
        typeof method === 'string' && Object.prototype.hasOwnProperty.call(this.handlers, method)
          ? this.handlers[method]
          : null;
      if (!handler) throw new ViewError('invalid', `${method} is not a bridge method.`);
      const run = () => Promise.resolve(handler(this.ctx, params || {}));
      // Subscription bookkeeping and theme reads are too frequent to be useful in the log.
      const result =
        method === 'unsubscribe' || method === 'theme.get' || method === 'ui.setHeight'
          ? await run()
          : await audited(`view:${this.ctx.viewId}`, method, params, run);
      this.send(REPLY_CHANNEL, { id, result: sizeChecked(result === undefined ? null : result) });
    } catch (err) {
      if (!(err instanceof ViewError)) this.warn(String(method), err);
      const error =
        err instanceof ViewError ? err.toJSON() : { code: 'internal', message: err.message };
      this.send(REPLY_CHANNEL, { id, error });
    }
  };
}
