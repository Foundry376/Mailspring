import { Task } from './task';
import Attributes from '../attributes';
import { Thread } from '../models/thread';
import { Message } from '../models/message';
import { AttributeValues } from '../models/model';

/*
Public: The ChangeMailTask is a base class for all tasks that modify sets
of threads or messages.

Subclasses implement {ChangeMailTask::changesToModel} and
{ChangeMailTask::requestBodyForModel} to define the specific transforms
they provide, and override {ChangeMailTask::performLocal} to perform
additional consistency checks.
*/
export class ChangeMailTask extends Task {
  static attributes = Object.assign({}, Task.attributes, {
    taskDescription: Attributes.String({
      modelKey: 'taskDescription',
    }),
    threadIds: Attributes.Collection({
      modelKey: 'threadIds',
    }),
    messageIds: Attributes.Collection({
      modelKey: 'messageIds',
    }),
    canBeUndone: Attributes.Boolean({
      modelKey: 'canBeUndone',
    }),
    isUndo: Attributes.Boolean({
      modelKey: 'isUndo',
    }),
  });

  threadIds: string[];
  messageIds: string[];
  isUndo: boolean;
  canBeUndone: boolean;
  taskDescription: string;

  constructor({
    threads = [],
    messages = [],
    ...rest
  }: AttributeValues<typeof ChangeMailTask.attributes> & {
    threads?: Thread[];
    messages?: Message[];
  } = {}) {
    super(rest);

    this.threadIds = this.threadIds || threads.map(i => i.id);
    this.messageIds = this.messageIds || messages.map(i => i.id);
    this.accountId =
      this.accountId || (threads[0] || messages[0] || { accountId: undefined }).accountId;

    if (this.canBeUndone === undefined) {
      this.canBeUndone = true;
    }
  }

  // Task lifecycle

  createUndoTask(): this {
    if (this.isUndo) {
      throw new Error(
        'ChangeMailTask::createUndoTask Cannot create an undo task from an undo task.'
      );
    }

    const task = this.createIdenticalTask();
    task.isUndo = true;
    return task;
  }

  numberOfImpactedItems() {
    return this.threadIds.length || this.messageIds.length;
  }
}
