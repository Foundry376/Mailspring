import { Grant, FULL_GRANT } from '../../../mcp-server/lib/capabilities/grant';
import { installedViews } from '../view-registry';
import { ViewError } from './errors';

export type ViewPermission =
  | 'mail.read'
  | 'mail.bodies'
  | 'metadata.own'
  | 'mail.modify'
  | 'calendar.read';

const KNOWN_PERMISSIONS: ViewPermission[] = [
  'mail.read',
  'mail.bodies',
  'metadata.own',
  'mail.modify',
  'calendar.read',
];

/**
 * What one View may do, built from its manifest. `scope` is the same account/folder grant
 * MCP uses, so both are enforced by mcp-server/lib/capabilities/grant.ts.
 */
export interface ViewGrant {
  viewId: string;
  /** Plugin id of this View's private metadata. Views can't name any other. */
  namespace: string;
  permissions: Set<ViewPermission>;
  scope: Grant;
}

export function grantForView(viewId: string): ViewGrant {
  const manifest = installedViews().find((v) => v.id === viewId);
  const declared = manifest ? manifest.permissions : [];
  return {
    viewId,
    namespace: `view:${viewId}`,
    permissions: new Set(KNOWN_PERMISSIONS.filter((p) => declared.includes(p))),
    scope: FULL_GRANT,
  };
}

export function requirePermission(grant: ViewGrant, permission: ViewPermission) {
  if (!grant.permissions.has(permission)) {
    throw new ViewError(
      'permission',
      `This View's manifest must declare "${permission}" to use this call.`,
      { permission }
    );
  }
}
