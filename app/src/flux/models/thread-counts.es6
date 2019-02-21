import Attributes from '../attributes';
import Model from './model';
export default class ThreadCounts extends Model {
  static attributes = Object.assign({}, {
    categoryId: Attributes.String({
      queryable: true,
      modelKey: 'categoryId',
    }),
    unread: Attributes.Number({
      modelkey: 'unread',
    }),
    total: Attributes.Number({
      modelKey: 'total',
    }),
    remoteUnread: Attributes.Number({
      modelKey: 'remoteUnread'
    }),
    remoteTotal: Attributes.Number({
      modelKey: 'remoteTotal'
    })
  })
}