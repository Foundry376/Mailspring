import { execFile } from 'child_process';

const CACHE_TTL_MS = 5000;
const EXEC_TIMEOUT_MS = 2000;

let cachedResult: { value: boolean; timestamp: number } | null = null;

/**
 * Execute a command asynchronously with a timeout.
 * Returns stdout trimmed, or rejects on error/timeout.
 */
function execAsync(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: EXEC_TIMEOUT_MS }, (error, stdout) => {
      if (error) reject(error);
      else resolve(stdout.toString().trim());
    });
  });
}

/**
 * Query the freedesktop.org Notifications.Inhibited D-Bus property.
 *
 * This is the cross-desktop standard for DND detection, supported by:
 *   - GNOME Shell 42+ (Fedora 36+, Ubuntu 22.04+, Arch, openSUSE Tumbleweed)
 *   - KDE Plasma 5.24+ (Fedora 36+, Kubuntu 22.04+, Arch, openSUSE)
 *   - Any notification daemon implementing the freedesktop Notifications 1.2 spec
 *
 * Uses dbus-send, which is part of the dbus package and available on
 * virtually every Linux system with a graphical session.
 *
 * @returns true if DND is active, false if not, null if the property is unavailable
 */
async function queryFreedesktopInhibited(): Promise<boolean | null> {
  try {
    const output = await execAsync('dbus-send', [
      '--session',
      '--print-reply',
      '--dest=org.freedesktop.Notifications',
      '/org/freedesktop/Notifications',
      'org.freedesktop.DBus.Properties.Get',
      'string:org.freedesktop.Notifications',
      'string:Inhibited',
    ]);
    // dbus-send output format: "   variant       boolean true"
    // Explicitly check for both boolean values so that unexpected output
    // (e.g., a non-conforming daemon exposing a non-boolean type) falls
    // through to null, allowing DE-specific fallbacks to run.
    if (output.includes('boolean true')) return true;
    if (output.includes('boolean false')) return false;
    return null;
  } catch {
    return null;
  }
}

/**
 * Query GNOME's show-banners gsetting.
 * When false, the user has enabled Do Not Disturb in GNOME's notification panel.
 *
 * Works on all GNOME versions with notification settings, including derivatives:
 *   - Ubuntu (ubuntu:GNOME)
 *   - Pop!_OS (pop:GNOME)
 *   - Budgie (Budgie:GNOME)
 *   - Pantheon (elementary OS) — uses GNOME settings daemon
 */
async function queryGnomeDND(): Promise<boolean> {
  try {
    const output = await execAsync('gsettings', [
      'get',
      'org.gnome.desktop.notifications',
      'show-banners',
    ]);
    return output === 'false';
  } catch {
    return false;
  }
}

/**
 * Query Cinnamon's display-notifications gsetting.
 * When false, the user has disabled notifications (DND) in Cinnamon (Linux Mint).
 *
 * XDG_CURRENT_DESKTOP is typically "X-Cinnamon" on Linux Mint.
 */
async function queryCinnamonDND(): Promise<boolean> {
  try {
    const output = await execAsync('gsettings', [
      'get',
      'org.cinnamon.desktop.notifications',
      'display-notifications',
    ]);
    return output === 'false';
  } catch {
    return false;
  }
}

/**
 * Query XFCE's do-not-disturb xfconf setting.
 * xfconf-query returns "true" when DND is enabled in xfce4-notifyd settings.
 */
async function queryXfceDND(): Promise<boolean> {
  try {
    const output = await execAsync('xfconf-query', [
      '-c',
      'xfce4-notifyd',
      '-p',
      '/do-not-disturb',
    ]);
    return output.toLowerCase() === 'true';
  } catch {
    return false;
  }
}

/**
 * Check if Do Not Disturb is active on the current Linux desktop environment.
 *
 * Detection strategy:
 * 1. Try the freedesktop.org Notifications.Inhibited D-Bus property first.
 *    This is the cross-desktop standard and works on GNOME 42+, KDE Plasma 5.24+,
 *    and any notification daemon implementing the Notifications 1.2 spec.
 *
 * 2. If the standard property is unavailable (older DEs, niche notification daemons),
 *    fall back to desktop-environment-specific settings queries based on
 *    XDG_CURRENT_DESKTOP:
 *      - GNOME/Unity/Budgie/Pantheon: gsettings show-banners
 *      - Cinnamon: gsettings display-notifications
 *      - XFCE: xfconf-query do-not-disturb
 *
 * 3. For unrecognized desktop environments (LXDE, LXQt, MATE, etc.) where DND
 *    detection is not possible, returns false so notifications are not blocked.
 *
 * Results are cached for 5 seconds to avoid spawning child processes when
 * multiple notifications arrive in a burst (e.g., initial sync).
 */
export async function getDoNotDisturb(): Promise<boolean> {
  if (cachedResult && Date.now() - cachedResult.timestamp < CACHE_TTL_MS) {
    return cachedResult.value;
  }

  let dnd = false;

  // Method 1: freedesktop.org standard (broadest cross-DE support)
  const inhibited = await queryFreedesktopInhibited();
  if (inhibited !== null) {
    dnd = inhibited;
  } else {
    // Method 2: Desktop-environment-specific fallbacks
    const desktop = (process.env.XDG_CURRENT_DESKTOP || '').toUpperCase();

    if (
      desktop.includes('GNOME') ||
      desktop.includes('UNITY') ||
      desktop.includes('BUDGIE') ||
      desktop.includes('PANTHEON')
    ) {
      dnd = await queryGnomeDND();
    } else if (desktop.includes('CINNAMON')) {
      dnd = await queryCinnamonDND();
    } else if (desktop.includes('XFCE')) {
      dnd = await queryXfceDND();
    }
    // KDE without the freedesktop property means Plasma < 5.24,
    // which has no user-facing DND toggle — return false.
    // MATE, LXDE, LXQt don't have built-in DND — return false.
  }

  cachedResult = { value: dnd, timestamp: Date.now() };
  return dnd;
}

/**
 * Clear the cached DND result. Primarily useful for testing.
 */
export function clearDoNotDisturbCache(): void {
  cachedResult = null;
}
