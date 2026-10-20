import { Grant, FULL_GRANT } from '../../../../src/services/mail-access/grant';
import { allViews } from '../view-registry';
import { CONSENTED_PERMISSIONS, ViewPermission, approvedPermissions } from '../consent';
import { ViewError } from './errors';

export { ViewPermission, CONSENTED_PERMISSIONS };

/**
 * What one View may do: the permissions its manifest declares that the user has approved.
 * `scope` is the same account/folder grant MCP uses, so both are enforced by
 * src/services/mail-access/grant.ts.
 */
export interface ViewGrant {
  viewId: string;
  /** Plugin id of this View's private metadata. Views can't name any other. */
  namespace: string;
  permissions: Set<ViewPermission>;
  scope: Grant;
}

export function grantForView(viewId: string): ViewGrant {
  const manifest = allViews().find((v) => v.id === viewId);
  const declared = manifest ? manifest.permissions : [];
  const permitted = approvedPermissions(
    viewId,
    CONSENTED_PERMISSIONS.filter((p) => declared.includes(p))
  ) as ViewPermission[];
  return {
    viewId,
    namespace: `view:${viewId}`,
    permissions: new Set(permitted),
    scope: FULL_GRANT,
  };
}

export function requirePermission(grant: ViewGrant, permission: ViewPermission) {
  if (!grant.permissions.has(permission)) {
    throw new ViewError(
      'permission',
      `This View's manifest must declare "${permission}", and the user must allow it, to use this call.`,
      { permission }
    );
  }
}
