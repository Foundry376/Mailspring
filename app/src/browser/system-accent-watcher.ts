import { EventEmitter } from 'events';
import { systemPreferences, nativeTheme } from 'electron';

// macOS posts this Distributed Notification when any of the "color preference"
// defaults change (accent tint, highlight color). On Win/Linux Electron emits
// `accent-color-changed` directly on `systemPreferences`.
const APPLE_COLOR_NOTIFICATION = 'AppleColorPreferencesChangedNotification';

// Normalize Electron's #RRGGBBAA (or platform-specific "rrggbbaa" without #)
// to #RRGGBB. Returns null when the platform/DE didn't provide a color.
function normalize(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const hex = raw.startsWith('#') ? raw.slice(1) : raw;
  if (hex.length < 6) return null;
  return `#${hex.slice(0, 6).toLowerCase()}`;
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
  private _macSubscriptionId: number | null = null;

  constructor() {
    super();
    this._current = readAccent();

    const refresh = () => {
      const next = readAccent();
      if (next === this._current) return;
      this._current = next;
      this.emit('change', this._current);
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
    nativeTheme.on('updated', refresh);
  }

  getCurrent(): string | null {
    return this._current;
  }

  dispose() {
    if (this._macSubscriptionId != null) {
      systemPreferences.unsubscribeNotification(this._macSubscriptionId);
      this._macSubscriptionId = null;
    }
  }
}
