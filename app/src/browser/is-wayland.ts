/**
 * Returns true if the current session is running on Wayland.
 * Checks both XDG_SESSION_TYPE and WAYLAND_DISPLAY to handle
 * cases where only one is set (e.g., some container environments).
 *
 * This should be used instead of `process.platform === 'linux'` when
 * gating Wayland-specific workarounds, so X11 users are not affected.
 */
export function isWaylandSession(): boolean {
  return (
    process.platform === 'linux' &&
    (process.env.XDG_SESSION_TYPE === 'wayland' || !!process.env.WAYLAND_DISPLAY)
  );
}
