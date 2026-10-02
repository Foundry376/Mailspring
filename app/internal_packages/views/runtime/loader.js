// Runs the compiled View (view.js registers window.__mailspringViewFactory) against a
// `require` that resolves only the vendored libraries listed in vendor/manifest.json plus
// `@mailspring/view`, applies the host theme to the document, then mounts the default export.
(function () {
  const moduleGlobals = Object.assign({}, window.__mailspringViewModuleGlobals, {
    '@mailspring/view': 'MailspringView',
  });

  function viewRequire(specifier) {
    const globalName = moduleGlobals[specifier];
    if (!globalName || !(globalName in window)) {
      const available = Object.keys(moduleGlobals).sort().join(', ');
      throw new Error(`Cannot import "${specifier}". Views can import: ${available}`);
    }
    return window[globalName];
  }

  // ViewHost passes the placement in the URL fragment, which never reaches the protocol
  // handler. view.css sizes sidebar Views to their content.
  const placement = new URLSearchParams(window.location.hash.slice(1)).get('placement');
  document.documentElement.dataset.placement = placement || 'page';

  // Theme: the host pushes a `Theme` (lib/theme-tokens.ts). Its colors become `--ms-<key>`
  // variables, and the Tailwind block below exposes them as `ms-<key>` colors (`bg-ms-bg`,
  // `text-ms-muted`, …). `dark:` follows the Mailspring theme rather than the OS, because the
  // two disagree whenever the user picks a theme by hand.
  function applyTheme(theme) {
    if (!theme || !theme.colors) return;
    const root = document.documentElement;
    for (const [key, value] of Object.entries(theme.colors)) {
      root.style.setProperty(`--ms-${key}`, value);
    }
    theme.chart.forEach((color, idx) => root.style.setProperty(`--ms-chart-${idx + 1}`, color));
    root.style.setProperty('--ms-font-family', theme.font.family);
    root.style.setProperty('--ms-font-size', theme.font.size);
    root.dataset.theme = theme.mode;
    root.style.colorScheme = theme.mode;
  }

  const TAILWIND_THEME = `
@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *));
@theme inline {
  --color-ms-bg: var(--ms-bg);
  --color-ms-panel: var(--ms-panel);
  --color-ms-text: var(--ms-text);
  --color-ms-muted: var(--ms-muted);
  --color-ms-border: var(--ms-border);
  --color-ms-accent: var(--ms-accent);
  --color-ms-danger: var(--ms-danger);
  --color-ms-success: var(--ms-success);
  --color-ms-warning: var(--ms-warning);
  --color-ms-link: var(--ms-link);
  --color-ms-heading: var(--ms-heading);
  --font-sans: var(--ms-font-family);
}`;

  // @tailwindcss/browser compiles every `style[type="text/tailwindcss"]` in the document,
  // including ones added after it loads.
  const tailwindTheme = document.createElement('style');
  tailwindTheme.setAttribute('type', 'text/tailwindcss');
  tailwindTheme.textContent = TAILWIND_THEME;
  document.head.appendChild(tailwindTheme);

  const bridge = window.mailspring;
  bridge.on('theme', applyTheme);
  bridge.call('theme.get').then(({ result }) => applyTheme(result));

  // Errors: a readable card instead of a blank View. Uncaught errors outside React (in an
  // event handler or a timer) leave the View running, so they only log.
  const root = document.getElementById('root');
  const React = window.React;
  const h = React.createElement;

  // Sucrase keeps View.jsx's line numbers in view.js (see view-sessions.ts), so stack frames
  // can name the author's file directly.
  const authorStack = (stack) =>
    stack.replace(/mailspring-view:\/\/[^/\s]+\/view\.js:(\d+):(\d+)/g, 'View.jsx:$1:$2');

  function ErrorCard({ error, phase }) {
    const message = (error && error.message) || String(error);
    const stack = authorStack((error && error.stack) || '');
    return h(
      'div',
      { className: 'mailspring-view-error' },
      h('div', { className: 'mailspring-view-error-title' }, `This View ${phase}`),
      h('div', { className: 'mailspring-view-error-message' }, message),
      stack && h('pre', { className: 'mailspring-view-error-stack' }, stack),
      h(
        'button',
        { className: 'mailspring-view-error-reload', onClick: () => window.location.reload() },
        'Reload View'
      )
    );
  }

  class ErrorBoundary extends React.Component {
    constructor(props) {
      super(props);
      this.state = { error: null };
    }
    static getDerivedStateFromError(error) {
      return { error };
    }
    componentDidCatch(error) {
      console.error(error);
    }
    render() {
      if (this.state.error) return h(ErrorCard, { error: this.state.error, phase: 'crashed' });
      return this.props.children;
    }
  }

  const reactRoot = window.ReactDOM.createRoot(root);
  try {
    if (window.__mailspringViewLoadError) {
      throw new Error(window.__mailspringViewLoadError);
    }
    if (typeof window.__mailspringViewFactory !== 'function') {
      throw new Error('View.jsx did not load. Check the console for a syntax error.');
    }
    const module = { exports: {} };
    window.__mailspringViewFactory(viewRequire, module, module.exports);
    const View = module.exports.default || module.exports;
    if (typeof View !== 'function') {
      throw new Error('View.jsx must `export default` a React component.');
    }
    reactRoot.render(h(ErrorBoundary, null, h(View)));
  } catch (err) {
    console.error(err);
    reactRoot.render(h(ErrorCard, { error: err, phase: 'failed to load' }));
  }
})();
