import Category from './category';
import Attributes from '../attributes';

export default class Label extends Category {
  static attributes = Object.assign({}, Category.attributes, {
    bgColor: Attributes.String({
      modelKey: 'bgColor',
    }),
    updatedAt: Attributes.DateTime({
      queryable: true,
      modelKey: 'updatedAt',
      jsonKey: 'updatedAt',
      loadFromColumn: true
    }),
  });
  displayType() {
    return 'label';
  }
}
