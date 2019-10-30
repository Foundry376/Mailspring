import SiftTask from './sift-task';

export default class GetBlockListTask extends SiftTask {
  static attributes = Object.assign({}, SiftTask.attributes);
  constructor() {
    super();
  }

  label() {
    return `get block list`;
  }
}
