import Task from './task';
import {mailSyncModes} from '../../mailsync-process';

export default class SiftTask extends Task {
  constructor(data) {
    super(data);
    this.mailsyncMode = mailSyncModes.SIFT;
  }

  label() {
    return `Sift Task`;
  }
}
