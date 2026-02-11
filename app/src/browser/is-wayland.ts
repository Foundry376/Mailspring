/**
 * Returns true if the current session is running on Wayland.
 * Checks both XDG_SESSION_TYPE and WAYLAND_DISPLAY to handle
 * cases where only one is set (e.g., some container environments).
 *
 * This should be used instead of `process.platform === 'linux'` when
 * gating Wayland-specific workarounds, so X11 users are not affected.
 */

let _logged = false;

export function isWaylandSession(): boolean {
  const result =
    process.platform === 'linux' &&
    (process.env.XDG_SESSION_TYPE === 'wayland' || !!process.env.WAYLAND_DISPLAY);

  if (!_logged) {
    _logged = true;
    console.log(
      `[Wayland] isWaylandSession=${result} ` +
        `(platform=${process.platform}, ` +
        `XDG_SESSION_TYPE=${process.env.XDG_SESSION_TYPE}, ` +
        `WAYLAND_DISPLAY=${process.env.WAYLAND_DISPLAY})`
    );
  }
  return result;
}
