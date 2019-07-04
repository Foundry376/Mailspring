import MailspringStore from 'mailspring-store';
import {ChatActions} from 'chat-exports';
class ProgressBarStore extends MailspringStore {
  constructor() {
    super();
    this._registerListeners();
    const progress = {};
    this.progress = progress;
    progress.loadQueue = [];
    progress.loadIndex = 0;
    progress.percent = 0;
    progress.loading = false;
    progress.visible = false;
    this.props = {};
    return;
  }

  _registerListeners() {
    this.listenTo(ChatActions.updateProgress, this.updateProgress);
  }

  updateProgress(progress, props) {
    Object.assign(this.progress, progress);
    Object.assign(this.props, props);
    this.trigger();
  }
}

module.exports = new ProgressBarStore();
