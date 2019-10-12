/* eslint global-require: 0 */
import { Model, AttributeValues } from './model';
import Attributes from '../attributes';

export class ContactBook extends Model {
  static attributes = {
    ...Model.attributes,

    readonly: Attributes.String({
      modelKey: 'readonly',
    }),

    source: Attributes.String({
      modelKey: 'source',
    }),
  };

  readonly: boolean;
  source: 'carddav' | 'gpeople';

  static sortOrderAttribute = () => {
    return ContactBook.attributes.id;
  };

  static naturalSortOrder = () => {
    return ContactBook.sortOrderAttribute().ascending();
  };

  constructor(data: AttributeValues<typeof ContactBook.attributes>) {
    super(data);
  }
}
