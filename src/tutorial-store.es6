import NylasStore from 'nylas-store';
import TutorialActions from './tutorial-actions';

class TutorialStore extends NylasStore {
  constructor() {
    super();

    this._tips = {};
    this._currentTipKey = null;

    TutorialActions.dismissedTip.listen(this._onDismissedTip);

    // Start the tutorial once packages have loaded for our final window type
    NylasEnv.packages.onDidActivateInitialPackages(() => {
      const windowType = NylasEnv.getWindowType();
      if ((windowType === 'emptyWindow') || (windowType.includes('preload'))) {
        return;
      }
      process.nextTick(() => {
        this.pickNextTip();
      });
    });
  }

  pickNextTip() {
    this._currentTipKey = Object.keys(this._tips).find(key => !this.hasSeenTip(key))
    this.trigger();
  }

  currentTip() {
    return this._tips[this._currentTipKey];
  }

  hasSeenTip(key) {
    return (NylasEnv.config.get('core.tips.seen') || []).includes(key);
  }

  _onDismissedTip() {
    NylasEnv.config.pushAtKeyPath('core.tips.seen', this._currentTipKey);
  }

  // Tip Registry - this is exposed as service by the main file

  addTip = (name, segment) => {
    this._tips[name] = segment;
  }

  removeTip = (name) => {
    delete this._tips[name]
  }
}

const ts = new TutorialStore();
window.TutorialStore = ts;
export default ts;
