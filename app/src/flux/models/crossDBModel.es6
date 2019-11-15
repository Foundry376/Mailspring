import Model from './model';

export default class CrossDBModel extends Model {
  static attributes = Object.assign({}, Model.attributes);

  constructor(rest) {
    super(rest);
  }

  toJSON() {
    const ret = super.toJSON();
    ret.dbName = this.dbName || '';
    return ret;
  }

  fromJSON(json) {
    const ret = super.fromJSON(json);
    ret.dbName = this.dbName || '';
    return ret;
  }
}
