import SiftTask from './sift-task';

export default class SiftExpungeUserDataTask extends SiftTask {
  static attributes = Object.assign({}, SiftTask.attributes);
  constructor(data) {
    super(data);
  }

  label() {
    return `Sift Expunge User Data`;
  }
}
