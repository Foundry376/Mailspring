/* eslint global-require: 0 */
import { Model, AttributeValues } from './model';
import Attributes from '../attributes';

export class ContactGroup extends Model {
  static attributes = {
    ...Model.attributes,

    name: Attributes.String({
      modelKey: 'name',
    }),
  };

  public name: string;

  static sortOrderAttribute = () => {
    return ContactGroup.attributes.name;
  };

  static naturalSortOrder = () => {
    return ContactGroup.sortOrderAttribute().ascending();
  };

  constructor(data: AttributeValues<typeof ContactGroup.attributes>) {
    super(data);
  }
}
