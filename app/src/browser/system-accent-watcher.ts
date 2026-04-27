import { EventEmitter } from 'events';
import { systemPreferences, nativeTheme } from 'electron';

// macOS posts this Distributed Notification when any of the "color preference"
// defaults change (accent tint, highlight color). On Win/Linux Electron emits
// `accent-color-changed` directly on `systemPreferences`.
const APPLE_COLOR_NOTIFICATION = 'AppleColorPreferencesChangedNotification';

// Normalize Electron's #RRGGBBAA (or platform-specific "rrggbbaa" without #)
// to #RRGGBB. Returns null when the platform/DE didn't provide a color.
//
// Strictly validates that the value is hex digits only — some Linux DEs
// return non-hex tokens (empty string, names like "default") that previously
// passed a length-only check and were spliced into invalid CSS like #defaul,
// which broke every var(--system-accent, ...) consumer downstream.
const HEX_ACCENT_RE = /^#?([0-9a-fA-F]{6})(?:[0-9a-fA-F]{2})?$/;

function normalize(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const match = HEX_ACCENT_RE.exec(raw);
  if (!match) return null;
  return `#${match[1].toLowerCase()}`;
}

function readAccent(): string | null {
  try {
    return normalize(systemPreferences.getAccentColor());
  } catch {
    // getAccentColor throws on platforms (or Linux DEs) where a system accent
    // isn't exposed. Treat as "no system accent available".
    return null;
  }
}

export default class SystemAccentWatcher extends EventEmitter {
  private _current: string | null = null;
  private _darkMode: boolean = false;
  private _macSubscriptionId: number | null = null;

  constructor() {
    super();
    this._current = readAccent();
    this._darkMode = !!nativeTheme.shouldUseDarkColors;

    const refresh = () => {
      const nextAccent = readAccent();
      if (nextAccent !== this._current) {
        this._current = nextAccent;
        this.emit('change', this._current);
      }
      const nextDark = !!nativeTheme.shouldUseDarkColors;
      if (nextDark !== this._darkMode) {
        this._darkMode = nextDark;
        this.emit('dark-mode-change', this._darkMode);
      }
    };

    // Fires natively on Windows and on Linux (Electron 37+).
    (systemPreferences as NodeJS.EventEmitter).on('accent-color-changed', refresh);

    if (process.platform === 'darwin') {
      this._macSubscriptionId = systemPreferences.subscribeNotification(
        APPLE_COLOR_NOTIFICATION,
        refresh
      );
    }

    // Catch-all: on some desktops accent changes ride along with a theme
    // change (e.g. switching to dark mode) rather than a dedicated event.
    // Also the sole trigger for pure dark-mode toggles that don't touch accent.
    nativeTheme.on('updated', refresh);
  }

  getCurrent(): string | null {
    return this._current;
  }

  getDarkMode(): boolean {
    return this._darkMode;
  }

  dispose() {
    if (this._macSubscriptionId != null) {
      systemPreferences.unsubscribeNotification(this._macSubscriptionId);
      this._macSubscriptionId = null;
    }
  }
}
