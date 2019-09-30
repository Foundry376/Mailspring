import Model from './model';
import Attributes from '../attributes';

export default class Indicator extends Model {
  static attributes = Object.assign({}, Model.attributes, {
    message: Attributes.String({
      modelKey: 'message',
      jsonKey: 'msg'
    }),
    key: Attributes.String({
      modelKey: 'key'
    })
  });
  constructor({ accountId, ...rest } = {}) {
    super(rest);
    this.accountId = accountId || '';
  }

  label() {
    return `Account Status Indicator`;
  }

  onError(data){
    AppEnv.logWarning(data);
  }
}
