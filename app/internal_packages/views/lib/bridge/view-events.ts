import { EventEmitter } from 'events';

/**
 * Host-side notifications from View bridges that other parts of the views package render.
 *
 * - `'badge'` `(viewId: string, count: number | null)`: the View called `ui.setBadge`.
 */
export const ViewBridgeEvents = new EventEmitter();
