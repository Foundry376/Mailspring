import MailspringStore from 'mailspring-store';

const EMAIL_RENDER_MODE_KEY = 'core.reading.emailRenderMode';

class EmailFrameStylesStore extends MailspringStore {
  _styles?: string;
  _mutationObserver: MutationObserver;
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
    return this._styles;
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
    this._styles += this._emailRenderModeOverrideStyles();
    this.trigger();
  };

  _emailRenderModeOverrideStyles() {
    const mode = AppEnv.config.get(EMAIL_RENDER_MODE_KEY) || 'theme';
    if (mode === 'light') {
      return '\nbody, img { filter: none !important; }';
    }
    if (mode === 'dark') {
      return (
        '\nbody { filter: invert(100%) hue-rotate(180deg) !important; color: #111 !important; }' +
        '\nimg { filter: invert(100%) hue-rotate(180deg) !important; }'
      );
    }
    return '';
  }

  _listenToStyles() {
    const target = document.getElementsByTagName('managed-styles')[0];
    this._mutationObserver = new MutationObserver(this._findStyles);
    this._mutationObserver.observe(target, { attributes: true, subtree: true, childList: true });
  }

  _unlistenToStyles() {
    if (this._mutationObserver) {
      this._mutationObserver.disconnect();
    }
    if (this._configDisposable) {
      this._configDisposable.dispose();
      this._configDisposable = undefined;
    }
  }
}

export default new EmailFrameStylesStore();
