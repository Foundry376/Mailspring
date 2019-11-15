import Attributes from '../attributes';
import CrossDBModel from './crossDBModel';
import { AuxDBs } from '../stores/database-store';

export default class MessageBody extends CrossDBModel {
  static attributes = Object.assign({}, CrossDBModel.attributes, {
    id: Attributes.String({
      modelKey: 'id',
      loadFromColumn: true,
      queryable: true,
    }),
    value: Attributes.String({
      modelKey: 'value',
      loadFromColumn: true,
      queryable: true,
    }),
    type: Attributes.Number({
      modelKey: 'type',
      loadFromColumn: true,
      queryable: true,
    }),
    fetchedAt: Attributes.DateTime({
      modelKey: 'fetchedAt',
      loadFromColumn: true,
      queryable: true,
    }),
  });
  static db = AuxDBs.MessageBody;
  constructor(data) {
    super(data);
    this.dbName = AuxDBs.MessageBody;
  }
}
