import React from 'react';
import { localized } from 'mailspring-exports';
import { permissionCopy } from '../view-host';
import { declaredGrants } from '../consent';
import { credentialsFromManifest } from '../../../../src/browser/view-credential-policy';

/**
 * What a View can do, in the consent card's words: for the sharer before publishing and for a
 * recipient before installing. `manifest` needs only `permissions`, `network` and, when known,
 * `credentials`; everything goes through the consent card's own filters.
 */
export function GrantSummary({ manifest }: { manifest: any }) {
  const { permissions, network } = declaredGrants(manifest);
  const credentials = credentialsFromManifest(manifest);
  return (
    <ul className="view-share-grants">
      <li>{localized('View accounts, folders, and message envelopes')}</li>
      {permissions.map((p) => (
        <li key={p}>{permissionCopy(p)}</li>
      ))}
      {network.map((host) => (
        <li key={host} className="view-share-grants-network">
          {localized('Connect to %@ and send/receive data', host)}
        </li>
      ))}
      {credentials.map((c) => (
        <li key={`credential-${c.id}`}>
          {localized('Ask for your %@ and use it with %@', c.label, c.hosts.join(', '))}
        </li>
      ))}
    </ul>
  );
}
