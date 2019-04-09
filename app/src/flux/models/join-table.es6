import Model from './model';
import Attributes from '../attributes';

export default class JoinTable extends Model {
  static attributes = Object.assign({}, Model.attributes);
  static originalAttributes = Object.assign({}, Model.attributes);
  static useAttribute(attr, type) {
    const newObj = {};
    newObj[attr] = Attributes[type]({
      queryable: true,
      modelKey: attr,
      isJoinTable: true,
    });
    JoinTable.attributes = Object.assign({}, JoinTable.originalAttributes, newObj);
    return JoinTable.attributes[attr];
  }
}
