import Task from './task';
import { mailSyncModes } from '../../mailsync-process';
import Attributes from '../attributes';

export default class SiftTask extends Task {
  static attributes = Object.assign({}, Task.attributes, {
    mailsyncMode: Attributes.String({
      modelKey: 'mailsyncMode',
      queryable: false
    })
  });
  constructor(data) {
    super(data);
    this.mailsyncMode = mailSyncModes.SIFT;
  }

  label() {
    return `Sift Task`;
  }
}
