import { Utils, Calendar } from 'mailspring-exports';

// Cache of calendar colors synced from CalDAV servers
const calendarColorCache: Map<string, string> = new Map();

// Version counter that increments when colors are updated - used to trigger re-renders
let colorCacheVersion = 0;

/**
 * Get the current color cache version. Used by components to detect when colors change.
 */
export function getColorCacheVersion(): number {
  return colorCacheVersion;
}

/**
 * Update the calendar color cache with colors from synced Calendar models.
 * Called when calendars are loaded/updated from the database.
 */
export function setCalendarColors(calendars: Calendar[]) {
  let hasChanges = false;
  for (const calendar of calendars) {
    if (calendar.color) {
      if (calendarColorCache.get(calendar.id) !== calendar.color) {
        calendarColorCache.set(calendar.id, calendar.color);
        hasChanges = true;
      }
    } else if (calendarColorCache.has(calendar.id)) {
      calendarColorCache.delete(calendar.id);
      hasChanges = true;
    }
  }
  if (hasChanges) {
    colorCacheVersion++;
  }
}

/**
 * Parse a CSS color string and return RGB components.
 * Supports hex (#RGB, #RRGGBB), rgb(), rgba(), hsl(), hsla() formats.
 */
function parseColor(color: string): { r: number; g: number; b: number; a: number } | null {
  // Try hex format
  const hexMatch = color.match(/^#([0-9a-f]{3,8})$/i);
  if (hexMatch) {
    const hex = hexMatch[1];
    if (hex.length === 3) {
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16),
        a: 1,
      };
    } else if (hex.length === 6) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: 1,
      };
    } else if (hex.length === 8) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: parseInt(hex.slice(6, 8), 16) / 255,
      };
    }
  }

  // Try rgb/rgba format
  const rgbMatch = color.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)/i);
  if (rgbMatch) {
    return {
      r: parseInt(rgbMatch[1], 10),
      g: parseInt(rgbMatch[2], 10),
      b: parseInt(rgbMatch[3], 10),
      a: rgbMatch[4] !== undefined ? parseFloat(rgbMatch[4]) : 1,
    };
  }

  // Try hsl/hsla format
  const hslMatch = color.match(
    /hsla?\s*\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*(?:,\s*([\d.]+))?\s*\)/i
  );
  if (hslMatch) {
    const h = parseFloat(hslMatch[1]) / 360;
    const s = parseFloat(hslMatch[2]) / 100;
    const l = parseFloat(hslMatch[3]) / 100;
    const a = hslMatch[4] !== undefined ? parseFloat(hslMatch[4]) : 1;

    // Convert HSL to RGB
    let r: number, g: number, b: number;
    if (s === 0) {
      r = g = b = l;
    } else {
      const hue2rgb = (p: number, q: number, t: number) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      };
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1 / 3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1 / 3);
    }
    return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255), a };
  }

  return null;
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
  return `hsl(${hue}, 80%, 45%)`;
}

/**
 * Get event styling colors for Apple Calendar-style appearance.
 * Returns colors for the background (light), left band (solid), and text.
 */
export function calcEventColors(calendarId: string): {
  background: string;
  band: string;
  text: string;
} {
  const baseColor = calcColor(calendarId);
  const parsed = parseColor(baseColor);

  if (!parsed) {
    // Fallback if color parsing fails
    return {
      background: baseColor,
      band: baseColor,
      text: 'inherit',
    };
  }

  const { r, g, b } = parsed;

  return {
    // Light pastel background (15% opacity)
    background: `rgba(${r}, ${g}, ${b}, 0.15)`,
    // Solid color for left band
    band: `rgb(${r}, ${g}, ${b})`,
    // Darker, more saturated color for text
    text: `rgb(${Math.round(r * 0.7)}, ${Math.round(g * 0.7)}, ${Math.round(b * 0.7)})`,
  };
}

// Common video meeting URL patterns and their display names
const MEETING_URL_PATTERNS: { pattern: RegExp; display: string }[] = [
  { pattern: /zoom\.us/i, display: 'zoom.us' },
  { pattern: /meet\.google\.com/i, display: 'meet.google.com' },
  { pattern: /teams\.microsoft\.com/i, display: 'teams.microsoft.com' },
  { pattern: /webex\.com/i, display: 'webex.com' },
  { pattern: /gotomeeting\.com/i, display: 'gotomeeting.com' },
  { pattern: /whereby\.com/i, display: 'whereby.com' },
  { pattern: /around\.co/i, display: 'around.co' },
  { pattern: /meet\.jit\.si/i, display: 'meet.jit.si' },
  { pattern: /discord\.gg/i, display: 'discord.gg' },
  { pattern: /slack\.com\/calls/i, display: 'slack.com' },
  { pattern: /chime\.aws/i, display: 'chime.aws' },
  { pattern: /bluejeans\.com/i, display: 'bluejeans.com' },
  { pattern: /appear\.in/i, display: 'appear.in' },
  { pattern: /livestorm\.co/i, display: 'livestorm.co' },
  { pattern: /hopin\.com/i, display: 'hopin.com' },
  { pattern: /loom\.com/i, display: 'loom.com' },
  { pattern: /tuple\.app/i, display: 'tuple.app' },
  { pattern: /pop\.com/i, display: 'pop.com' },
  { pattern: /cal\.com/i, display: 'cal.com' },
  { pattern: /calendly\.com/i, display: 'calendly.com' },
  { pattern: /facetime:/i, display: 'FaceTime' },
];

/**
 * Extract a meeting URL domain from location or description text.
 * Returns the friendly domain name (e.g., "zoom.us", "meet.google.com") or null.
 */
export function extractMeetingDomain(location: string, description: string): string | null {
  const textToSearch = `${location} ${description}`;

  // First check for known meeting platforms
  for (const { pattern, display } of MEETING_URL_PATTERNS) {
    if (pattern.test(textToSearch)) {
      return display;
    }
  }

  // Fall back to extracting domain from any URL in location field
  const urlMatch = location.match(/https?:\/\/([^/\s]+)/i);
  if (urlMatch) {
    const domain = urlMatch[1].toLowerCase();
    // Remove www. prefix if present
    return domain.replace(/^www\./, '');
  }

  return null;
}

/**
 * Format an event's time range for display (e.g., "12 – 1PM").
 * Only returns a string for events that are 1 hour or longer.
 * Returns null for shorter events or all-day events.
 */
export function formatEventTimeRange(
  startUnix: number,
  endUnix: number,
  isAllDay: boolean
): string | null {
  if (isAllDay) {
    return null;
  }

  const durationMinutes = (endUnix - startUnix) / 60;
  if (durationMinutes < 60) {
    return null;
  }

  const startDate = new Date(startUnix * 1000);
  const endDate = new Date(endUnix * 1000);

  const formatTime = (date: Date, includeAmPm: boolean) => {
    let hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    if (hours === 0) hours = 12;

    let timeStr = String(hours);
    if (minutes > 0) {
      timeStr += ':' + String(minutes).padStart(2, '0');
    }
    if (includeAmPm) {
      timeStr += ampm;
    }
    return timeStr;
  };

  const startAmPm = startDate.getHours() >= 12 ? 'PM' : 'AM';
  const endAmPm = endDate.getHours() >= 12 ? 'PM' : 'AM';

  // Only include AM/PM on start time if it differs from end time
  const includeStartAmPm = startAmPm !== endAmPm;

  return `${formatTime(startDate, includeStartAmPm)} – ${formatTime(endDate, true)}`;
}
