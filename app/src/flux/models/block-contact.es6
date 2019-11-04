import Attributes from '../attributes';
import Model from './model';

export default class BlockContact extends Model {
  static attributes = Object.assign(
    {},
    {
      id: Attributes.String({
        modelKey: 'id',
        queryable: true,
        loadFromColumn: true,
      }),
      accountId: Attributes.String({
        modelKey: 'accountId',
        queryable: true,
        loadFromColumn: true,
      }),
      email: Attributes.String({
        modelKey: 'email',
        queryable: true,
        loadFromColumn: true,
      }),
      name: Attributes.String({
        modelKey: 'name',
        queryable: true,
        loadFromColumn: true,
      }),
      state: Attributes.Number({
        modelKey: 'state',
        queryable: true,
        loadFromColumn: true,
      }),
      filterId: Attributes.String({
        modelKey: 'filterId',
      }),
      type: Attributes.Number({
        modelKey: 'type',
      }),
    }
  );
}
