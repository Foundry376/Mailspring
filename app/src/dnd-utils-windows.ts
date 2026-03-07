const CACHE_TTL_MS = 5000;

let cache: { value: boolean; timestamp: number } | null = null;

/**
 * Check if Focus Assist (Do Not Disturb) is active on Windows.
 *
 * Uses the windows-focus-assist native module, which reads the Focus Assist
 * registry state via the Windows Quiet Hours COM API.
 *
 * Focus Assist states:
 *   -2 = NOT_SUPPORTED (OS too old)
 *   -1 = FAILED (could not read state)
 *    0 = OFF (notifications allowed)
 *    1 = PRIORITY_ONLY (DnD active — only priority apps break through)
 *    2 = ALARMS_ONLY  (DnD active — only alarms break through)
 *
 * Results are cached for 5 seconds to avoid native calls on every notification.
 *
 * The module is required dynamically so that importing this file on macOS/Linux
 * during a cross-platform build does not cause a load-time failure.
 */
export async function getDoNotDisturb(): Promise<boolean> {
  if (cache && Date.now() - cache.timestamp < CACHE_TTL_MS) {
    return cache.value;
  }

  let dnd = false;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getFocusAssist } = require('windows-focus-assist');
    const { value } = getFocusAssist();
    // PRIORITY_ONLY (1) and ALARMS_ONLY (2) both mean DnD is active.
    // OFF (0), FAILED (-1), and NOT_SUPPORTED (-2) are all treated as inactive.
    dnd = value === 1 || value === 2;
  } catch (e) {
    console.warn('Failed to check Windows Focus Assist status:', e);
  }

  cache = { value: dnd, timestamp: Date.now() };
  return dnd;
}

/**
 * Clear the cached DND result. Primarily useful for testing.
 */
export function clearDoNotDisturbCache(): void {
  cache = null;
}
