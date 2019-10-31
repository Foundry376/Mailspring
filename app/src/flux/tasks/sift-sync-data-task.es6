import SiftTask from './sift-task';
import Attributes from '../attributes';

export default class SiftSyncDataTask extends SiftTask {
  static attributes = Object.assign({}, SiftTask.attributes, {
    categories: Attributes.Collection({
      modelKey: 'categories',
    }),
  });
  constructor({ categories = [], ...rest } = {}) {
    super(rest);
    if (Array.isArray(categories) && categories.length > 0) {
      this.categories = categories;
    } else {
      this.categories = [];
      AppEnv.reportError(new Error('Sift Sync Data task have no categories info'));
    }
  }

  label() {
    return `Sift Sync ${this.categories} data`;
  }
}
