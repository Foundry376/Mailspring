import { execFile } from 'child_process';
import { isWaylandSession } from './is-wayland';

const SNI_WATCHER_SERVICE = 'org.kde.StatusNotifierWatcher';
const SNI_WATCHER_PATH = '/StatusNotifierWatcher';
const SNI_PROBE_INTERVAL_MS = 500;
const DBUS_SEND_TIMEOUT_MS = 2000;

// Wayland has no XEmbed tray manager to fall back to, so waiting longer for a
// StatusNotifierHost is always better than giving up. On X11 an XEmbed-only
// tray (trayer, stalonetray, older XFCE) is a legitimate target, so give up
// quickly rather than delay the icon for users who will never have a host.
const SNI_WAIT_WAYLAND_MS = 15000;
const SNI_WAIT_X11_MS = 3000;

function isStatusNotifierHostRegistered(): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(
      'dbus-send',
      [
        '--session',
        '--print-reply',
        `--dest=${SNI_WATCHER_SERVICE}`,
        SNI_WATCHER_PATH,
        'org.freedesktop.DBus.Properties.Get',
        `string:${SNI_WATCHER_SERVICE}`,
        'string:IsStatusNotifierHostRegistered',
      ],
      { timeout: DBUS_SEND_TIMEOUT_MS },
      (error, stdout) => {
        // An error means no watcher owns the name yet, or it does not implement
        // the property — either way there is no host to register with.
        resolve(!error && stdout.toString().includes('boolean true'));
      }
    );
  });
}

/**
 * Electron's Linux tray tries the StatusNotifierItem (D-Bus) backend first and
 * falls back to the legacy XEmbed icon — permanently, for the life of the
 * process — if `org.kde.StatusNotifierWatcher` has no owner or reports
 * `IsStatusNotifierHostRegistered = false` at the moment `Tray()` is
 * constructed. The retry it installs on NameOwnerChanged is only wired up
 * after both of those checks have already passed, so losing the race is not
 * recoverable (chromium `StatusIconLinuxDbus::OnNameHasOwnerResponse` and
 * `::OnHostRegisteredResponse`).
 *
 * Compositor bars routinely claim the name a second or two into the session,
 * which is why the tray icon never appears on Hyprland/Sway but works after a
 * relaunch. Waiting for the host before constructing the tray is the only fix
 * available to us, since the icon cannot be destroyed and recreated on Linux
 * (electron/electron#17622).
 */
export async function waitForStatusNotifierHost(): Promise<void> {
  const deadline = Date.now() + (isWaylandSession() ? SNI_WAIT_WAYLAND_MS : SNI_WAIT_X11_MS);
  let ready = await isStatusNotifierHostRegistered();
  while (!ready && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, SNI_PROBE_INTERVAL_MS));
    ready = await isStatusNotifierHostRegistered();
  }
}
