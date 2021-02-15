import { Model } from './model';
import * as Attributes from '../attributes';

export default class ProviderSyncbackRequest extends Model {
  static attributes = {
    ...Model.attributes,

    type: Attributes.String({
      queryable: true,
      modelKey: 'type',
    }),

    error: Attributes.Obj({
      modelKey: 'error',
    }),

    props: Attributes.Obj({
      modelKey: 'props',
    }),

    responseJSON: Attributes.Obj({
      modelKey: 'responseJSON',
      jsonKey: 'response_json',
    }),

    // The following are "normalized" fields that we can use to consolidate
    // various thirdPartyData source. These list of attributes should
    // always be optional and may change as the needs of a Mailspring contact
    // change over time.
    status: Attributes.String({
      modelKey: 'status',
    }),
  };
}
