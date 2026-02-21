import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const CACHE_TTL_MS = 5000;

let cache: { value: boolean; timestamp: number } | null = null;

/**
 * Check if Do Not Disturb / Focus Mode is active on macOS.
 *
 * Reads the controlcenter defaults key that tracks whether a Focus Mode
 * is currently visible in the menu bar. A value of "1" means a Focus Mode
 * is active; "0" or a missing key means no Focus Mode is active.
 *
 * macOS 26 (Tahoe) renamed the key from "NSStatusItem Visible FocusModes"
 * to "NSStatusItem VisibleCC FocusModes".
 *
 * Results are cached for 5 seconds to match the Linux implementation and
 * avoid spawning a process for every notification in a burst.
 */
export async function getDoNotDisturb(): Promise<boolean> {
  if (cache && Date.now() - cache.timestamp < CACHE_TTL_MS) {
    return cache.value;
  }

  try {
    const macOSMajorVersion = parseInt(process.getSystemVersion().split('.')[0]);
    const key =
      macOSMajorVersion >= 26
        ? 'NSStatusItem VisibleCC FocusModes'
        : 'NSStatusItem Visible FocusModes';

    const { stdout } = await execFileAsync('defaults', ['read', 'com.apple.controlcenter', key]);
    // Output is "1\n" when a Focus Mode is active, "0\n" when not
    const dnd = stdout.replace(/[^0-9a-zA-Z]/g, '') === '1';
    cache = { value: dnd, timestamp: Date.now() };
    return dnd;
  } catch (e) {
    // The key not existing in defaults means no Focus Mode is active — not an error
    if (!e.message?.includes('does not exist')) {
      console.warn('Failed to check macOS Do Not Disturb status:', e);
    }
    cache = { value: false, timestamp: Date.now() };
    return false;
  }
}

/**
 * Clear the cached DND result. Primarily useful for testing.
 */
export function clearDoNotDisturbCache(): void {
  cache = null;
}
