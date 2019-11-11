import SiftTask from './sift-task';
import Attributes from '../attributes';
export default class SiftExportUserDataTask extends SiftTask {
  static attributes = Object.assign({}, SiftTask.attributes, {
    email: Attributes.String({
      modelKey: 'email',
    }),
  });
  constructor({ email = '', ...rest } = {}) {
    super(rest);
    this.email = email;
  }

  label() {
    return `Sift Export User Data`;
  }
}
