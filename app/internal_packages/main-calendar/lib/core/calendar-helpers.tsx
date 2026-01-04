import { Utils, Calendar } from 'mailspring-exports';

// Cache of calendar colors synced from CalDAV servers
const calendarColorCache: Map<string, string> = new Map();

/**
 * Update the calendar color cache with colors from synced Calendar models.
 * Called when calendars are loaded/updated from the database.
 */
export function setCalendarColors(calendars: Calendar[]) {
  for (const calendar of calendars) {
    if (calendar.color) {
      calendarColorCache.set(calendar.id, calendar.color);
    } else {
      calendarColorCache.delete(calendar.id);
    }
  }
}

/**
 * Get the display color for a calendar. Priority:
 * 1. User-configured color (stored in app config)
 * 2. Synced color from CalDAV server (stored on Calendar model)
 * 3. Generated color based on calendar ID hash
 */
export function calcColor(calendarId: string) {
  // First check user-configured color (highest priority - user override)
  const userColor = AppEnv.config.get(`calendar.colors.${calendarId}`);
  if (userColor) {
    return userColor;
  }

  // Check synced color from CalDAV server
  const syncedColor = calendarColorCache.get(calendarId);
  if (syncedColor) {
    return syncedColor;
  }

  // Fall back to generated color based on calendar ID
  const hue = Utils.hueForString(calendarId);
  return `hsla(${hue}, 80%, 45%, 0.55)`;
}
