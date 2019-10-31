import SiftTask from './sift-task';
import Attributes from '../attributes';

export default class GetBlockListTask extends SiftTask {
  static attributes = Object.assign({}, SiftTask.attributes, {
    aid: Attributes.String({
      modelKey: 'aid',
    }),
  });
  constructor() {
    super();
    this.aid = 'empty';
  }

  label() {
    return `get block list`;
  }
}
