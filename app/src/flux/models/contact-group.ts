/* eslint global-require: 0 */
import _str from 'underscore.string';
import { Model, AttributeValues } from './model';
import Attributes from '../attributes';

export class ContactGroup extends Model {
  static attributes = {
    ...Model.attributes,

    name: Attributes.String({
      modelKey: 'name',
    }),
  };

  static sortOrderAttribute = () => {
    return ContactGroup.attributes.name;
  };

  static naturalSortOrder = () => {
    return ContactGroup.sortOrderAttribute().ascending();
  };

  public name: string;

  constructor(data: AttributeValues<typeof ContactGroup.attributes>) {
    super(data);
  }
}
