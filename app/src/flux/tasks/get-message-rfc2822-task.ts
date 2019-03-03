import { Task } from './task';
import Attributes from '../attributes';
import { AttributeValues } from '../models/model';

export class GetMessageRFC2822Task extends Task {
  static attributes = Object.assign({}, Task.attributes, {
    messageId: Attributes.String({
      modelKey: 'messageId',
    }),
    filepath: Attributes.String({
      modelKey: 'filepath',
    }),
  });

  messageId: string;
  filepath: string;

  constructor(data: AttributeValues<typeof GetMessageRFC2822Task.attributes> = {}) {
    super(data);
  }
}
