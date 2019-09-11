import Attributes from '../attributes';
import Model from './model';

export default class Outbox extends Model {
  static attributes = Object.assign({}, Model.attributes, {
    // load id column into json
    id: Attributes.String({
      queryable: true,
      jsonKey: 'id',
      modelKey: 'id',
    }),

    headerMessageId: Attributes.Collection({
      modelKey: 'headerMessageId',
      queryable: true,
    }),

    //DC-265 State attributes must be Number, but actual value must be string, otherwise all kinds of error
    state: Attributes.Number({
      modelKey: 'state',
      jsonKey: 'state',
      queryable: true,
    }),
  });

  constructor(data = {}) {
    super(data);
  }

  fromJSON(json = {}) {
    super.fromJSON(json);

    // Only change the `draft` bit if the incoming json has an `object`
    // property. Because of `DraftChangeSet`, it's common for incoming json
    // to be an empty hash. In this case we want to leave the pre-existing
    // draft bit alone.
    // if (json.object) {
    //   this.draft = json.object === 'draft';
    // }

    return this;
  }
}
