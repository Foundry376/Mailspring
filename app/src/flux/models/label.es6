import Category from './category';
import Attributes from '../attributes';

export default class Label extends Category {
  static attributes = Object.assign({}, Category.attributes, {
    bgColor: Attributes.String({
      modelKey: 'bgColor',
    }),
  });
  displayType() {
    return 'label';
  }
}
