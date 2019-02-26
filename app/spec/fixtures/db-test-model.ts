/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import Model from '../../src/flux/models/model';
import Category from '../../src/flux/models/category';
import Attributes from '../../src/flux/attributes';

class TestModel extends Model {
  static attributes = {
    id: Attributes.String({
      queryable: true,
      modelKey: 'id',
    }),

    clientId: Attributes.String({
      queryable: true,
      modelKey: 'clientId',
      jsonKey: 'client_id',
    }),

    serverId: Attributes.String({
      queryable: true,
      modelKey: 'serverId',
      jsonKey: 'server_id',
    }),
  };
}

TestModel.configureBasic = () =>
  (TestModel.attributes = {
    id: Attributes.String({
      queryable: true,
      modelKey: 'id',
    }),
    clientId: Attributes.String({
      queryable: true,
      modelKey: 'clientId',
      jsonKey: 'client_id',
    }),
    serverId: Attributes.String({
      queryable: true,
      modelKey: 'serverId',
      jsonKey: 'server_id',
    }),
  });

TestModel.configureWithAllAttributes = () =>
  (TestModel.attributes = {
    datetime: Attributes.DateTime({
      queryable: true,
      modelKey: 'datetime',
    }),
    string: Attributes.String({
      queryable: true,
      modelKey: 'string',
      jsonKey: 'string-json-key',
    }),
    boolean: Attributes.Boolean({
      queryable: true,
      modelKey: 'boolean',
    }),
    number: Attributes.Number({
      queryable: true,
      modelKey: 'number',
    }),
    other: Attributes.String({
      modelKey: 'other',
    }),
  });

TestModel.configureWithCollectionAttribute = () =>
  (TestModel.attributes = {
    id: Attributes.String({
      queryable: true,
      modelKey: 'id',
    }),
    clientId: Attributes.String({
      queryable: true,
      modelKey: 'clientId',
      jsonKey: 'client_id',
    }),
    serverId: Attributes.String({
      queryable: true,
      modelKey: 'serverId',
      jsonKey: 'server_id',
    }),
    other: Attributes.String({
      queryable: true,
      modelKey: 'other',
    }),
    categories: Attributes.Collection({
      queryable: true,
      modelKey: 'categories',
      itemClass: Category,
      joinOnField: 'id',
      joinQueryableBy: ['other'],
    }),
  });

TestModel.configureWithJoinedDataAttribute = function() {
  TestModel.attributes = {
    id: Attributes.String({
      queryable: true,
      modelKey: 'id',
    }),
    clientId: Attributes.String({
      queryable: true,
      modelKey: 'clientId',
      jsonKey: 'client_id',
    }),
    serverId: Attributes.String({
      queryable: true,
      modelKey: 'serverId',
      jsonKey: 'server_id',
    }),
    body: Attributes.JoinedData({
      modelTable: 'TestModelBody',
      modelKey: 'body',
    }),
  };

  TestModel.attributes = {
    id: Attributes.String({
      queryable: true,
      modelKey: 'id',
    }),
    clientId: Attributes.String({
      modelKey: 'clientId',
      jsonKey: 'client_id',
    }),
    serverId: Attributes.String({
      modelKey: 'serverId',
      jsonKey: 'server_id',
    }),
    body: Attributes.JoinedData({
      modelTable: 'TestModelBody',
      modelKey: 'body',
    }),
  };
};

export default TestModel;
