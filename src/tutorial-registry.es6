import {Publisher} from './flux/modules/reflux-coffee';

class TutorialRegistry {

  constructor() {
    Object.assign(this, Publisher);
    this.registry = {};
  }

  register(name, segment) {
    this.registry[name] = segment;
    this.trigger(name);
  }

  unregister(name) {
    delete this.registry[name]
  }

  getSteps = (name) => this.registry[name];
  hasSegment = (name) => this.registry[name] != null;
  getSegmentNames = () => Object.keys(this.registry);
}
const registry = new TutorialRegistry();

export default registry
