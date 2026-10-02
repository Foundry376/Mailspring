import { MailQuery } from '../../../mcp-server/lib/capabilities/queries';
import { countMessages as countWithGrant, Dim } from '../../../mcp-server/lib/capabilities/counts';
import type { ViewGrant } from './grant';

export { Dim, DIMS } from '../../../mcp-server/lib/capabilities/counts';

export function countMessages(grant: ViewGrant, q: MailQuery, dims: Dim[]) {
  return countWithGrant(grant.scope, q, dims);
}
