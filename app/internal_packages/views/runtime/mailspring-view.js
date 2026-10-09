// The `@mailspring/view` module: the idiomatic React surface over window.mailspring, the raw
// bridge exposed by bridge.preload.js. Views import from here rather than calling the bridge.
// The API is specified in docs/plans/views-api.md §3.
(function () {
  const React = window.React;
  const { useEffect, useState } = React;
  const bridge = window.mailspring;

  class ViewError extends Error {
    constructor({ code, message, feature, permission }) {
      super(message);
      this.name = 'ViewError';
      this.code = code;
      if (feature) this.feature = feature;
      if (permission) this.permission = permission;
    }
  }

  async function call(method, params) {
    const { result, error } = await bridge.call(method, params || {});
    if (error) throw new ViewError(error);
    return result;
  }

  const on = (event, callback) => bridge.on(event, callback);

  // ViewHost passes the placement in the URL fragment. Read here rather than from the
  // dataset loader.js sets, because this module runs before the loader.
  const isSidebar =
    new URLSearchParams(window.location.hash.slice(1)).get('placement') === 'thread-sidebar';

  // Ids are unique per page load, so a reloaded View can't collide with subscriptions the host
  // still holds for the previous page.
  const pageToken = Math.random().toString(36).slice(2, 8);
  let nextId = 1;
  const uid = (prefix) => `${prefix}${pageToken}-${nextId++}`;

  // ── Subscriptions ─────────────────────────────────────────────────────────
  // Data arrives as `subscription` events tagged with an id the View chose, so a listener is
  // registered before the host can emit and the first snapshot can't be dropped.

  const subscribers = new Map();
  on('subscription', ({ subId, data, hasMore }) => {
    const s = subscribers.get(subId);
    if (s) s.onData(data, hasMore);
  });
  on('subscription.error', ({ subId, error }) => {
    const s = subscribers.get(subId);
    if (s) s.onError(new ViewError(error));
  });

  function subscribe(kind, params, onData, onError) {
    const subId = uid('s');
    subscribers.set(subId, { onData, onError });
    call('subscribe', { subId, kind, params }).catch((err) => {
      subscribers.delete(subId);
      onError(err);
    });
    return () => {
      subscribers.delete(subId);
      call('unsubscribe', { subId }).catch(() => {});
    };
  }

  const EMPTY = { data: [], loading: false, error: null, hasMore: false };

  // Keyed by the JSON of the arguments, so inline object literals don't resubscribe on every
  // render. A null query means "nothing yet" and yields empty data without a subscription.
  function useLive(kind, params, enabled) {
    const key = enabled ? JSON.stringify([kind, params]) : null;
    const [state, setState] = useState(() =>
      enabled ? { data: [], loading: true, error: null, hasMore: false } : EMPTY
    );
    useEffect(() => {
      if (!key) {
        setState(EMPTY);
        return undefined;
      }
      setState((s) => ({ ...s, loading: s.data.length === 0, error: null }));
      return subscribe(
        kind,
        params,
        (data, hasMore) => setState({ data, loading: false, error: null, hasMore: !!hasMore }),
        (error) => setState((s) => ({ ...s, loading: false, error }))
      );
    }, [key]);
    return state;
  }

  // `useThreads('in:inbox', { limit: 20 })` is the most natural thing to write, so options
  // passed beside a search string are merged into the query object the spec defines.
  function withOptions(query, options) {
    if (query == null || !options) return query;
    return { ...(typeof query === 'string' ? { search: query } : query), ...options };
  }

  const useThreads = (query, options) =>
    useLive('threads', { query: withOptions(query, options) }, query != null);
  const useMessages = (query, options) =>
    useLive('messages', { query: withOptions(query, options) }, query != null);
  const useCounts = (query, groupBy) => useLive('counts', { query, groupBy }, query != null);
  const useAccounts = () => useLive('accounts', {}, true);
  function useEvents(range) {
    const params = range && {
      start: new Date(range.start).toISOString(),
      end: new Date(range.end).toISOString(),
      search: range.search,
    };
    return useLive('events', params, !!range);
  }

  // ── One-shot reads ────────────────────────────────────────────────────────

  function splitQuery(q) {
    if (q && typeof q === 'object' && 'offset' in q) {
      const { offset, ...query } = q;
      return { query, offset };
    }
    return { query: q, offset: 0 };
  }
  const getThreads = (q, options) => call('threads.find', splitQuery(withOptions(q, options)));
  const getMessages = (q, options) => call('messages.find', splitQuery(withOptions(q, options)));
  const getCounts = (query, groupBy) => call('counts.find', { query, groupBy });
  const getEvents = (range) =>
    call('events.find', {
      start: new Date(range.start).toISOString(),
      end: new Date(range.end).toISOString(),
      search: range.search,
    });

  // Bodies never change, so content is cached for the life of the View.
  const contentCache = new Map();
  const CONTENT_BATCH = 50;

  async function getContent(ids, opts = {}) {
    const optsKey = JSON.stringify(opts);
    const missing = ids.filter((id) => !contentCache.has(`${id}:${optsKey}`));
    for (let i = 0; i < missing.length; i += CONTENT_BATCH) {
      const batch = missing.slice(i, i + CONTENT_BATCH);
      const result = await call('messages.content', { ids: batch, ...opts });
      for (const id of batch) {
        const value = result[id] || { text: null, reason: 'not_found' };
        if (isFinal(value)) contentCache.set(`${id}:${optsKey}`, value);
        else contentCache.set(`${id}:${optsKey}:pending`, value);
      }
    }
    return readContentCache(ids, opts);
  }

  function readContentCache(ids, opts) {
    const optsKey = JSON.stringify(opts);
    const out = {};
    for (const id of ids) {
      const value =
        contentCache.get(`${id}:${optsKey}`) || contentCache.get(`${id}:${optsKey}:pending`);
      if (value) out[id] = value;
    }
    return out;
  }

  // Content whose body wasn't downloaded yet is retried on the next request instead of being
  // cached as missing.
  const isFinal = (value) => value && value.reason !== 'body_unavailable';

  // Not live: content for new ids is fetched as the id list grows, and partial results render
  // as each batch arrives.
  function useContent(ids, opts) {
    const key = JSON.stringify([ids || [], opts || {}]);
    const total = ids ? ids.length : 0;
    const [state, setState] = useState({
      data: {},
      loading: total > 0,
      error: null,
      loaded: 0,
      total,
    });
    useEffect(() => {
      let cancelled = false;
      const list = ids || [];
      if (list.length === 0) {
        setState({ data: {}, loading: false, error: null, loaded: 0, total: 0 });
        return undefined;
      }
      setState((s) => ({ ...s, loading: true, error: null, total: list.length }));
      (async () => {
        try {
          for (let i = 0; i < list.length && !cancelled; i += CONTENT_BATCH) {
            const upto = list.slice(0, i + CONTENT_BATCH);
            await getContent(list.slice(i, i + CONTENT_BATCH), opts || {});
            const data = readContentCache(upto, opts || {});
            if (!cancelled) {
              setState({
                data,
                loading: i + CONTENT_BATCH < list.length,
                error: null,
                loaded: Math.min(upto.length, list.length),
                total: list.length,
              });
            }
          }
        } catch (error) {
          if (!cancelled) setState((s) => ({ ...s, loading: false, error }));
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [key]);
    return state;
  }

  // ── Extraction ────────────────────────────────────────────────────────────

  const jobListeners = new Map();
  on('ai.progress', (progress) => {
    const listener = jobListeners.get(progress.jobId);
    if (listener) listener(progress);
  });

  function startExtract({ ids, query, schema, instructions }, onProgress) {
    const jobId = uid('j');
    jobListeners.set(jobId, onProgress);
    const started = call('ai.extract', { jobId, ids, query, schema, instructions });
    const cancel = () => {
      jobListeners.delete(jobId);
      call('ai.cancel', { jobId }).catch(() => {});
    };
    return { started, cancel };
  }

  function extract(opts, onProgress) {
    return new Promise((resolve, reject) => {
      const results = {};
      const { started, cancel } = startExtract(opts, (p) => {
        for (const r of p.results) results[r.messageId] = r;
        if (onProgress) onProgress({ ...p, results });
        if (p.status === 'error') {
          cancel();
          reject(new ViewError(p.error || { code: 'internal', message: 'Extraction failed' }));
        } else if (p.status === 'done') {
          cancel();
          resolve(results);
        }
      });
      started.catch(reject);
    });
  }

  const IDLE = { results: {}, processed: 0, total: 0, status: 'idle', error: null };

  function useExtract(opts) {
    const enabled = !!(opts && opts.schema && (opts.ids ? opts.ids.length : opts.query != null));
    const key = enabled ? JSON.stringify(opts) : null;
    const [state, setState] = useState(IDLE);
    useEffect(() => {
      if (!key) {
        setState(IDLE);
        return undefined;
      }
      setState({ ...IDLE, status: 'running' });
      const { started, cancel } = startExtract(opts, (p) =>
        setState((s) => {
          const results = { ...s.results };
          for (const r of p.results) results[r.messageId] = r;
          return {
            results,
            processed: p.processed,
            total: p.total,
            status: p.status,
            error: p.error ? new ViewError(p.error) : null,
          };
        })
      );
      started.then(
        ({ total }) => setState((s) => ({ ...s, total })),
        (error) => setState((s) => ({ ...s, status: 'error', error }))
      );
      return cancel;
    }, [key]);
    return state;
  }

  // ── Generation (daily briefing) ────────────────────────────────────────────
  // ai.summarize streams one short record per message (phase 1); ai.generate builds a briefing
  // from those records (phase 2). Both reuse the extraction job channel above.

  function startJob(method, params, onProgress) {
    const jobId = uid('j');
    jobListeners.set(jobId, onProgress);
    const started = call(method, { jobId, ...params });
    const cancel = () => {
      jobListeners.delete(jobId);
      call('ai.cancel', { jobId }).catch(() => {});
    };
    return { started, cancel };
  }

  function summarize(opts, onProgress) {
    return new Promise((resolve, reject) => {
      const results = {};
      const { started, cancel } = startJob('ai.summarize', opts, (p) => {
        for (const r of p.results || []) results[r.messageId] = r;
        if (onProgress) onProgress({ ...p, results });
        if (p.status === 'error') {
          cancel();
          reject(new ViewError(p.error || { code: 'internal', message: 'Summarizing failed' }));
        } else if (p.status === 'done') {
          cancel();
          resolve(results);
        }
      });
      started.catch(reject);
    });
  }

  const IDLE_SUMMARIES = { results: {}, processed: 0, total: 0, status: 'idle', error: null };

  function useSummaries(opts) {
    const enabled = !!(opts && (opts.ids ? opts.ids.length : opts.query != null));
    const key = enabled ? JSON.stringify(opts) : null;
    const [state, setState] = useState(IDLE_SUMMARIES);
    useEffect(() => {
      if (!key) {
        setState(IDLE_SUMMARIES);
        return undefined;
      }
      setState({ ...IDLE_SUMMARIES, status: 'running' });
      const { started, cancel } = startJob('ai.summarize', opts, (p) =>
        setState((s) => {
          const results = { ...s.results };
          for (const r of p.results || []) results[r.messageId] = r;
          return {
            results,
            processed: p.processed,
            total: p.total,
            status: p.status,
            modelAvailable: p.modelAvailable,
            error: p.error ? new ViewError(p.error) : null,
          };
        })
      );
      started.then(
        ({ total }) => setState((s) => ({ ...s, total })),
        (error) => setState((s) => ({ ...s, status: 'error', error }))
      );
      return cancel;
    }, [key]);
    return state;
  }

  const IDLE_GENERATE = {
    status: 'idle',
    phase: null,
    processed: 0,
    total: 0,
    text: null,
    value: null,
    priorities: [],
    groups: [],
    headline: null,
    modelAvailable: true,
    error: null,
  };

  function mergeGenerate(s, p) {
    return {
      ...s,
      status: p.status,
      phase: p.phase || s.phase,
      processed: p.processed != null ? p.processed : s.processed,
      total: p.total != null ? p.total : s.total,
      modelAvailable: p.modelAvailable != null ? p.modelAvailable : s.modelAvailable,
      usedMessages: p.usedMessages != null ? p.usedMessages : s.usedMessages,
      priorities: p.priorities || s.priorities,
      groups: p.groups || s.groups,
      headline: p.headline || s.headline,
      text: p.text !== undefined ? p.text : s.text,
      value: p.value !== undefined ? p.value : s.value,
      error: p.error ? new ViewError(p.error) : null,
    };
  }

  function generate(opts, onProgress) {
    return new Promise((resolve, reject) => {
      let state = { ...IDLE_GENERATE, status: 'running' };
      const { started, cancel } = startJob('ai.generate', opts, (p) => {
        state = mergeGenerate(state, p);
        if (onProgress) onProgress(state);
        if (p.status === 'error') {
          cancel();
          reject(state.error);
        } else if (p.status === 'done') {
          cancel();
          resolve(state);
        }
      });
      started.catch(reject);
    });
  }

  function useGenerate(opts) {
    const enabled = !!(opts && opts.task && (opts.ids ? opts.ids.length : opts.query != null));
    const key = enabled ? JSON.stringify(opts) : null;
    const [state, setState] = useState(IDLE_GENERATE);
    useEffect(() => {
      if (!key) {
        setState(IDLE_GENERATE);
        return undefined;
      }
      setState({ ...IDLE_GENERATE, status: 'running' });
      const { started, cancel } = startJob('ai.generate', opts, (p) =>
        setState((s) => mergeGenerate(s, p))
      );
      started.then(
        ({ total }) => setState((s) => ({ ...s, total })),
        (error) => setState((s) => ({ ...s, status: 'error', error }))
      );
      return cancel;
    }, [key]);
    return state;
  }

  // ── Identity ──────────────────────────────────────────────────────────────

  let identityPromise = null;
  const getIdentity = () => {
    if (!identityPromise) {
      identityPromise = call('identity.get').catch((err) => {
        identityPromise = null;
        throw err;
      });
    }
    return identityPromise;
  };

  function useIdentity() {
    const [value, setValue] = useState(null);
    useEffect(() => {
      let cancelled = false;
      getIdentity().then(
        (identity) => !cancelled && setValue(identity),
        () => {}
      );
      return () => {
        cancelled = true;
      };
    }, []);
    return value;
  }

  // ── Writes ────────────────────────────────────────────────────────────────

  function setMetadata(target, value) {
    if (typeof target === 'string') {
      return call('metadata.set', { kind: 'thread', id: target, value });
    }
    const kind = 'threadId' in target ? 'message' : 'thread';
    return call('metadata.set', { kind, id: target.id, value });
  }

  function modify(threads, change) {
    const threadIds = threads.map((t) => (typeof t === 'string' ? t : t.id));
    return call('mail.modify', { threadIds, change });
  }

  const ui = {
    showThread: (id) => call('ui.showThread', { id }),
    search: (search) => call('ui.search', { search }),
    compose: (draft) => call('ui.compose', draft || {}),
    reply: (messageId, opts = {}) => call('ui.reply', { messageId, ...opts }),
    openExternal: (url) => call('ui.openExternal', { url }),
    setBadge: (count) => call('ui.setBadge', { count }),
  };

  async function attachmentUrl(id) {
    const fileId = typeof id === 'string' ? id : id && id.id;
    const { url } = await call('attachments.url', { fileId });
    return url;
  }

  // ── Sidebar context ───────────────────────────────────────────────────────
  // The host pushes `context` when the sidebar View loads and whenever the focused thread
  // changes; `context.get` covers a hook that mounts after the first push.

  let selected = null;
  const selectedListeners = new Set();
  const setSelected = (payload) => {
    selected = payload || null;
    for (const fn of selectedListeners) fn(selected);
  };
  on('context', setSelected);
  if (isSidebar) {
    call('context.get').then(setSelected, () => {});
  }

  function useSelectedThread() {
    const [value, setValue] = useState(selected);
    useEffect(() => {
      selectedListeners.add(setValue);
      setValue(selected);
      return () => selectedListeners.delete(setValue);
    }, []);
    return value;
  }

  // ── Theme ─────────────────────────────────────────────────────────────────
  // The loader applies the theme to CSS variables and Tailwind; this only exposes the payload
  // ({ mode, colors, chart, font }) to components, e.g. for recharts series colors.

  let theme = null;
  const themeListeners = new Set();
  const setTheme = (next) => {
    theme = next;
    for (const fn of themeListeners) fn(theme);
  };
  on('theme', setTheme);
  call('theme.get').then(setTheme, () => {});

  const FALLBACK_THEME = {
    mode: 'light',
    colors: {},
    chart: ['#3b82f6', '#f97316', '#10b981', '#a855f7', '#ef4444', '#14b8a6', '#eab308', '#ec4899'],
    font: {},
  };

  function useTheme() {
    const [value, setValue] = useState(theme);
    useEffect(() => {
      themeListeners.add(setValue);
      setValue(theme);
      return () => themeListeners.delete(setValue);
    }, []);
    return value || FALLBACK_THEME;
  }

  // ── View state ────────────────────────────────────────────────────────────

  function useViewState(key, initial) {
    const storageKey = `mailspring-view-state:${key}`;
    const [value, setValue] = useState(() => {
      try {
        const raw = window.localStorage.getItem(storageKey);
        return raw === null ? initial : JSON.parse(raw);
      } catch {
        return initial;
      }
    });
    const set = (next) => {
      setValue(next);
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // Storage can be unavailable or full; the value still lives for this session.
      }
    };
    return [value, set];
  }

  // ── <MessageView> ─────────────────────────────────────────────────────────
  // The standard message frame: headers, the body as the reading pane renders it, attachments
  // and Reply. The body is host-sanitized HTML (messages.renderable) shown in a frame with no
  // scripts; it is same-origin only so the View can size it and route its link clicks.

  const h = React.createElement;

  function initials(contact) {
    const label = (contact && (contact.name || contact.email)) || '?';
    const words = label
      .replace(/[^\p{L}\p{N} ]/gu, ' ')
      .trim()
      .split(/\s+/);
    return (
      (words[0] || '?')[0] + (words.length > 1 ? words[words.length - 1][0] : '')
    ).toUpperCase();
  }

  function formatSize(bytes) {
    if (!bytes && bytes !== 0) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  function onFrameClick(event) {
    const link = event.target.closest && event.target.closest('a[href]');
    if (!link) return;
    event.preventDefault();
    const href = link.getAttribute('href');
    if (/^mailto:/i.test(href)) {
      const to = decodeURIComponent(href.slice(7).split('?')[0]);
      ui.compose({ to: to ? to.split(',') : [] }).catch(() => {});
    } else if (/^https?:\/\//i.test(href)) {
      ui.openExternal(href).catch(() => {});
    }
  }

  function MessageFrame({ html }) {
    const ref = React.useRef(null);
    const [height, setHeight] = useState(0);
    useEffect(() => {
      const iframe = ref.current;
      if (!iframe) return undefined;
      let observer = null;
      const attach = () => {
        const doc = iframe.contentDocument;
        if (!doc || !doc.documentElement) return;
        const measure = () => setHeight(doc.documentElement.scrollHeight);
        // Same decision as the reading pane: transparent over the theme, or a white page for
        // emails that paint their own backgrounds or would be illegible.
        const wrapper = doc.getElementById('inbox-html-wrapper');
        const colors = window.MailspringEmailColors;
        if (wrapper && colors && !wrapper.dataset.colorsPrepared) {
          wrapper.dataset.colorsPrepared = 'true';
          wrapper.classList.toggle(
            'has-background',
            colors.prepareEmailColors(wrapper, colors.backgroundColorBehind(iframe))
          );
        }
        if (observer) observer.disconnect();
        observer = new ResizeObserver(measure);
        observer.observe(doc.documentElement);
        doc.addEventListener('click', onFrameClick);
        measure();
      };
      iframe.addEventListener('load', attach);
      attach();
      return () => {
        iframe.removeEventListener('load', attach);
        if (observer) observer.disconnect();
      };
    }, [html]);
    return h('iframe', {
      ref,
      className: 'ms-message-frame',
      sandbox: 'allow-same-origin',
      srcDoc: html,
      title: 'Message',
      style: { height },
    });
  }

  function MessageView({ messageId, compact, includeQuoted }) {
    const messages = useMessages(messageId ? { ids: [messageId] } : null);
    const message = messages.data[0];
    const [expanded, setExpanded] = useState(!compact);
    useEffect(() => setExpanded(!compact), [compact]);
    const [renderable, setRenderable] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
      setRenderable(null);
      setError(null);
      if (!messageId || !expanded) return undefined;
      let cancelled = false;
      call('messages.renderable', { ids: [messageId], includeQuoted: !!includeQuoted }).then(
        (result) => !cancelled && setRenderable(result[messageId] || { html: null }),
        (err) => !cancelled && setError(err)
      );
      return () => {
        cancelled = true;
      };
    }, [messageId, expanded, !!includeQuoted]);

    if (!message) return null;
    const from = message.from || {};
    const recipients = [...(message.to || []), ...(message.cc || [])]
      .map((c) => (c.isMe ? 'me' : c.name || c.email))
      .join(', ');
    const files = (message.attachments || []).filter((f) => !f.isInline);

    let body;
    if (!expanded) {
      body = h('div', { className: 'ms-message-snippet' }, message.snippet);
    } else if (error) {
      body = h('div', { className: 'ms-message-snippet' }, error.message);
    } else if (renderable && renderable.html) {
      body = h(MessageFrame, { html: renderable.html });
    } else {
      body = h(
        'div',
        { className: 'ms-message-snippet' },
        renderable ? message.snippet : 'Loading…'
      );
    }

    return h(
      'div',
      { className: `ms-message${expanded ? ' expanded' : ''}` },
      h(
        'div',
        {
          className: 'ms-message-header',
          onClick: compact ? () => setExpanded(!expanded) : undefined,
        },
        h('div', { className: 'ms-message-avatar' }, initials(from)),
        h(
          'div',
          { className: 'ms-message-participants' },
          h(
            'div',
            { className: 'ms-message-from' },
            h('span', { className: 'ms-message-from-name' }, from.name || from.email || ''),
            from.name && from.email
              ? h('span', { className: 'ms-message-from-email' }, from.email)
              : null
          ),
          recipients ? h('div', { className: 'ms-message-to' }, `To: ${recipients}`) : null
        ),
        h(
          'div',
          { className: 'ms-message-date' },
          new Date(message.date).toLocaleString([], {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          })
        ),
        h(
          'button',
          {
            className: 'ms-message-reply',
            title: 'Reply',
            onClick: (e) => {
              e.stopPropagation();
              ui.reply(message.id).catch(() => {});
            },
          },
          'Reply'
        )
      ),
      h('div', { className: 'ms-message-body' }, body),
      expanded && files.length
        ? h(
            'div',
            { className: 'ms-message-attachments' },
            files.map((f) =>
              h(
                'span',
                { key: f.id, className: 'ms-message-attachment', title: f.filename },
                h('span', { className: 'ms-message-attachment-name' }, f.filename),
                h('span', { className: 'ms-message-attachment-size' }, formatSize(f.size))
              )
            )
          )
        : null
    );
  }

  // ── Height reporting ──────────────────────────────────────────────────────
  // Sidebar hosts size the webview to its content. view.css makes <html> height:auto for
  // sidebar Views, so its box is exactly the content, including margins that collapse out of
  // the last child (which children's own rects miss). scrollHeight can't be used: it never
  // reports less than the current viewport, so a View could grow but never shrink.

  let lastHeight = 0;
  let frame = null;
  function reportHeight() {
    frame = null;
    const px = Math.ceil(document.documentElement.getBoundingClientRect().height);
    if (px !== lastHeight) {
      lastHeight = px;
      call('ui.setHeight', { px }).catch(() => {});
    }
  }
  const scheduleHeight = () => {
    if (frame === null) frame = window.requestAnimationFrame(reportHeight);
  };
  function startHeightReporting() {
    if (!isSidebar) return;
    const observer = new ResizeObserver(scheduleHeight);
    observer.observe(document.documentElement);
    observer.observe(document.body);
    scheduleHeight();
  }
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', startHeightReporting);
  } else {
    startHeightReporting();
  }

  window.MailspringView = {
    // Live reads
    useThreads,
    useMessages,
    useCounts,
    useEvents,
    useAccounts,
    useContent,
    useSelectedThread,
    useTheme,
    useViewState,
    useIdentity,
    // One-shot reads
    getThreads,
    getMessages,
    getCounts,
    getEvents,
    getContent,
    getIdentity,
    // Extraction
    useExtract,
    extract,
    // Generation (daily briefing)
    useSummaries,
    summarize,
    useGenerate,
    generate,
    // Writes and host actions
    setMetadata,
    modify,
    ui,
    attachmentUrl,
    // Components
    MessageView,
    ViewError,
    // Escape hatches for API smoke tests and debugging.
    call,
    on,
  };

  // ── Credentials ───────────────────────────────────────────────────────────
  // API keys the user stored for this View (views-api.md §3.10). The View never sees a key:
  // credentialFetch asks the host to send the request with it attached, and gets back the
  // response with any echo of the key redacted.

  function decodeBody(body, encoding) {
    if (encoding !== 'base64') return body;
    const bytes = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  async function credentialFetch(credentialId, url, init = {}) {
    if (init.body != null && typeof init.body !== 'string') {
      throw new ViewError({
        code: 'invalid',
        message: 'credentialFetch bodies must be strings. Use JSON.stringify for JSON.',
      });
    }
    const r = await call('credentials.fetch', {
      credentialId,
      url: String(url),
      init: { method: init.method, headers: init.headers, body: init.body },
    });
    const lowerHeaders = r.headers || {};
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      statusText: r.statusText,
      url: r.url,
      redirected: r.redirected,
      redacted: r.redacted,
      blockedRedirect: r.blockedRedirect || null,
      headers: {
        get: (name) => lowerHeaders[String(name).toLowerCase()] || null,
        has: (name) => String(name).toLowerCase() in lowerHeaders,
        entries: () => Object.entries(lowerHeaders),
      },
      text: async () => decodeBody(r.body, r.bodyEncoding),
      json: async () => JSON.parse(decodeBody(r.body, r.bodyEncoding)),
      arrayBuffer: async () =>
        r.bodyEncoding === 'base64'
          ? Uint8Array.from(atob(r.body), (c) => c.charCodeAt(0)).buffer
          : new TextEncoder().encode(r.body).buffer,
    };
  }

  ui.requestCredential = (credentialId) => call('ui.requestCredential', { credentialId });

  function useCredentialStatus(credentialId) {
    const [state, setState] = useState({ connected: false, loading: true, error: null });
    useEffect(() => {
      let live = true;
      call('credentials.status', { credentialId })
        .then(({ connected }) => live && setState({ connected, loading: false, error: null }))
        .catch((error) => live && setState({ connected: false, loading: false, error }));
      return () => {
        live = false;
      };
    }, [credentialId]);
    const connect = async () => {
      const { connected } = await ui.requestCredential(credentialId);
      setState({ connected, loading: false, error: null });
      return connected;
    };
    return { ...state, connect };
  }

  Object.assign(window.MailspringView, { credentialFetch, useCredentialStatus });
})();
