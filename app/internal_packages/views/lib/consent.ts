import { EventEmitter } from 'events';
import {
  APPROVALS_CONFIG_KEY,
  approvedSubset,
  networkGrantsFromManifest,
} from '../../../src/browser/view-sandbox-policy';
import { ViewManifest, installedViews } from './view-registry';
import { removeAllCredentials } from './credentials/store';

/**
 * Consent for what a View can do beyond reading mail summaries. The user approves a View's
 * permissions and network hosts once per View id, and the approval covers its drafts and its
 * installed copy alike: a draft is an uncommitted revision of a View the user already allowed,
 * not a separate thing to consent to. A View whose manifest declares anything outside its
 * approval doesn't load; the host shows a consent card in its place (view-host.tsx). The bridge
 * (bridge/grant.ts) and the main process (view-sessions.ts) only honor approved entries, so a
 * revision written while the View is on screen can't use a grant before the user sees it.
 *
 * Approvals only grow when the user allows more, and shrink when a draft is discarded, so
 * Allow on a draft never outlives the draft.
 */

export type ViewPermission =
  | 'mail.bodies'
  | 'metadata.own'
  | 'mail.modify'
  | 'calendar.read'
  | 'calendar.write';

export const CONSENTED_PERMISSIONS: ViewPermission[] = [
  'mail.bodies',
  'metadata.own',
  'mail.modify',
  'calendar.read',
  'calendar.write',
];

export interface ViewGrants {
  permissions: ViewPermission[];
  network: string[];
}

export const ConsentEvents = new EventEmitter();
ConsentEvents.setMaxListeners(100);

function approvals(): { [viewId: string]: ViewGrants } {
  return AppEnv.config.get(APPROVALS_CONFIG_KEY) || {};
}

function saveApproval(viewId: string, grants: ViewGrants | null) {
  const next = { ...approvals() };
  if (grants) next[viewId] = grants;
  else delete next[viewId];
  AppEnv.config.set(APPROVALS_CONFIG_KEY, next);
  ConsentEvents.emit('changed', viewId);
}

/** The permissions and hosts a manifest asks for that need the user's approval. */
export function declaredGrants(json: any): ViewGrants {
  const declared = json && Array.isArray(json.permissions) ? json.permissions : [];
  return {
    permissions: CONSENTED_PERMISSIONS.filter((p) => declared.includes(p)),
    network: networkGrantsFromManifest(json),
  };
}

export function approvedPermissions(viewId: string, declared: string[]) {
  return approvedSubset(declared, approvals(), viewId, 'permissions');
}

export function hasApproval(viewId: string) {
  return Object.prototype.hasOwnProperty.call(approvals(), viewId);
}

/** What `view` declares that the user hasn't approved, or null if it may load. */
export function unapprovedGrants(view: ViewManifest): ViewGrants | null {
  const declared = declaredGrants(view.json);
  const all = approvals();
  const approved = {
    permissions: approvedSubset(declared.permissions, all, view.id, 'permissions'),
    network: approvedSubset(declared.network, all, view.id, 'network'),
  };
  const missing: ViewGrants = {
    permissions: declared.permissions.filter((p) => !approved.permissions.includes(p)),
    network: declared.network.filter((h) => !approved.network.includes(h)),
  };
  return missing.permissions.length || missing.network.length ? missing : null;
}

/** Approves everything the View's current manifest declares, on top of earlier approvals. */
export function approveView(viewId: string) {
  const view = installedViews().find((v) => v.id === viewId);
  if (!view) return;
  const declared = declaredGrants(view.json);
  const previous = approvals()[viewId] || { permissions: [], network: [] };
  const union = (a: string[], b: string[]) => [...new Set([...(a || []), ...b])];
  saveApproval(viewId, {
    permissions: union(previous.permissions, declared.permissions) as ViewPermission[],
    network: union(previous.network, declared.network),
  });
}

export function declineView(viewId: string) {
  ConsentEvents.emit('declined', viewId);
}

/**
 * Called after a View's draft is discarded: the approval shrinks to what the copy that remains
 * declares, so a wider grant the user allowed for the draft doesn't carry over to a later one.
 * With no copy left, the approval and any stored credentials are forgotten.
 */
export function narrowApprovalToCurrent(viewId: string) {
  const view = installedViews().find((v) => v.id === viewId);
  if (!view) {
    forgetView(viewId);
    return;
  }
  if (!hasApproval(viewId)) return;
  const declared = declaredGrants(view.json);
  const previous = approvals()[viewId];
  saveApproval(viewId, {
    permissions: declared.permissions.filter((p) => (previous.permissions || []).includes(p)),
    network: declared.network.filter((h) => (previous.network || []).includes(h)),
  });
}

/** Drops everything the user granted a View that no longer exists. */
export function forgetView(viewId: string) {
  if (hasApproval(viewId)) saveApproval(viewId, null);
  removeAllCredentials(viewId).catch((err) => console.warn(`Views: ${err.message}`));
}

/**
 * Resolves when the user allows or declines the View's pending grants, or after `timeoutMs`.
 * Resolves `approved` at once if nothing is pending.
 */
export function waitForConsent(
  viewId: string,
  timeoutMs: number
): Promise<'approved' | 'declined' | 'timeout'> {
  const pending = () => {
    const view = installedViews().find((v) => v.id === viewId);
    return !!view && !!unapprovedGrants(view);
  };
  if (!pending()) return Promise.resolve('approved');
  return new Promise((resolve) => {
    const finish = (result: 'approved' | 'declined' | 'timeout') => {
      clearTimeout(timer);
      ConsentEvents.removeListener('changed', onChanged);
      ConsentEvents.removeListener('declined', onDeclined);
      resolve(result);
    };
    const onChanged = (id: string) => {
      if (id === viewId && !pending()) finish('approved');
    };
    const onDeclined = (id: string) => {
      if (id === viewId) finish('declined');
    };
    const timer = setTimeout(() => finish('timeout'), timeoutMs);
    ConsentEvents.on('changed', onChanged);
    ConsentEvents.on('declined', onDeclined);
  });
}
