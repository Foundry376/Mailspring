import MailspringStore from 'mailspring-store';

const EMAIL_RENDER_MODE_KEY = 'core.reading.emailRenderMode';

class EmailFrameStylesStore extends MailspringStore {
  _styles?: string;
  _mutationObserver: MutationObserver;
  _darkSchemeQuery?: MediaQueryList;
  _configDisposable?: { dispose: () => void };

  constructor() {
    super();
    this._configDisposable = AppEnv.config.onDidChange(EMAIL_RENDER_MODE_KEY, this._findStyles);
  }

  styles() {
    if (!this._styles) {
      this._findStyles();
      this._listenToStyles();
    }
    return {
      themeStyles: this._styles,
      renderModeStyles: this._emailRenderModeOverrideStyles(),
    };
  }

  _findStyles = () => {
    this._styles = '';

    // Include the system accent CSS variables so that var(--system-accent, ...)
    // resolves correctly inside email iframes (which have their own document).
    const accentSheet = document.querySelector('[source-path="system-accent:dynamic"]');
    if (accentSheet) {
      this._styles += `\n${(accentSheet as HTMLElement).innerText}`;
    }

    for (const sheet of Array.from(
      document.querySelectorAll('[source-path*="email-frame.less"]')
    )) {
      this._styles += `\n${(sheet as HTMLElement).innerText}`;
    }
    this._styles = this._styles.replace(/.ignore-in-parent-frame/g, '');
    this.trigger();
  };

  _emailRenderModeOverrideStyles() {
    const mode = AppEnv.config.get(EMAIL_RENDER_MODE_KEY) === 'dark' ? 'dark' : 'light';
    if (mode === 'light') {
      return '\nbody { filter: none !important; }' + '\nimg { filter: none !important; }';
    }
    if (mode === 'dark') {
      // Emails whose own dark-mode rules are active are already dark; inverting
      // them would give dark text on black.
      const target = 'body:not(.adapts-to-dark-mode)';
      return (
        `\n${target} #inbox-html-wrapper { color: black; --email-text-color: black; background: white; }` +
        `\n${target} { filter: invert(100%) hue-rotate(180deg) !important; }` +
        `\n${target} img { filter: invert(100%) hue-rotate(180deg) !important; }`
      );
    }
    return '';
  }

  _listenToStyles() {
    const target = document.getElementsByTagName('managed-styles')[0];
    this._mutationObserver = new MutationObserver(this._findStyles);
    this._mutationObserver.observe(target, { attributes: true, subtree: true, childList: true });

    // A theme switch restyles the frames before the new nativeTheme.themeSource round-trips
    // through the main process, so they're classified against the old scheme. Re-render once
    // the scheme catches up.
    this._darkSchemeQuery = window.matchMedia('(prefers-color-scheme: dark)');
    this._darkSchemeQuery.addEventListener('change', this._findStyles);
  }

  _unlistenToStyles() {
    if (this._mutationObserver) {
      this._mutationObserver.disconnect();
    }
    if (this._darkSchemeQuery) {
      this._darkSchemeQuery.removeEventListener('change', this._findStyles);
    }
    if (this._configDisposable) {
      this._configDisposable.dispose();
      this._configDisposable = undefined;
    }
  }
}

export { EmailFrameStylesStore };
export default new EmailFrameStylesStore();
