import { MailQuery } from '../../../../src/services/mail-access/queries';
import { countMessages as countWithGrant, Dim } from '../../../../src/services/mail-access/counts';
import type { ViewGrant } from './grant';

export { Dim, DIMS } from '../../../../src/services/mail-access/counts';

export function countMessages(grant: ViewGrant, q: MailQuery, dims: Dim[]) {
  return countWithGrant(grant.scope, q, dims);
}
