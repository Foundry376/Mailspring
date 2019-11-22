import SiftTask from './sift-task';
import Attributes from '../attributes';
export default class SiftChangeSharingOptTask extends SiftTask {
  static attributes = Object.assign({}, SiftTask.attributes, {
    sharingOpt: Attributes.Number({
      modelKey: 'sharingOpt',
    }),
  });
  constructor(data) {
    super(data);
  }

  label() {
    return `Sift Change sharing option`;
  }
}
