import Attributes from '../attributes';
import Model from './model';
export default class ThreadCategory extends Model {
  static attributes = Object.assign({}, {
    unread: Attributes.Number({
      modelkey: 'unread',
    }),
    value: Attributes.String({
      modelKey: 'value',
    }),
    inAllMail: Attributes.Number({
      modelKey: 'inAllMail'
    }),
    state: Attributes.Number({
      modelKey: 'state'
    })
  })
}