import Category from './category';
import Attributes from '../attributes';

export default class Folder extends Category {
  static attributes = Object.assign({}, Category.attributes, {
    updatedAt: Attributes.DateTime({
      queryable: true,
      modelKey: 'updatedAt',
      jsonKey: 'updatedAt',
      loadFromColumn: true
    }),
  });
  displayType() {
    return 'folder';
  }
}
