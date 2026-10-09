import { EventEmitter } from 'events';
import { ViewBridgeEvents } from '../bridge/view-events';

// The last count each View reported with `ui.setBadge`. A page View only runs while it is
// open, so the count is remembered across launches and shown until the View next changes it.
const BADGES_KEY = 'views-badges';
let badges: { [viewId: string]: number } = {};

export const ViewBadgeEvents = new EventEmitter();

export function badgeFor(viewId: string): number | null {
  return badges[viewId] || null;
}

function onBadge(viewId: string, count: number | null) {
  if ((badges[viewId] || null) === (count || null)) return;
  if (count) badges[viewId] = count;
  else delete badges[viewId];
  try {
    window.localStorage.setItem(BADGES_KEY, JSON.stringify(badges));
  } catch {
    // The badge still shows for this session.
  }
  ViewBadgeEvents.emit('changed');
}

export function startTrackingBadges() {
  try {
    badges = JSON.parse(window.localStorage.getItem(BADGES_KEY) || '{}') || {};
  } catch {
    badges = {};
  }
  ViewBridgeEvents.on('badge', onBadge);
}

export function stopTrackingBadges() {
  ViewBridgeEvents.removeListener('badge', onBadge);
}
