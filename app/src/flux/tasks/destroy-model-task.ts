/* eslint global-require:0 */
import { Task } from './task';
import * as Attributes from '../attributes';

export class DestroyModelTask extends Task {
  static attributes = {
    ...Task.attributes,
    modelId: Attributes.String({
      modelKey: 'modelId',
    }),
    endpoint: Attributes.String({
      modelKey: 'endpoint',
    }),
    modelName: Attributes.String({
      modelKey: 'modelName',
    }),
  };

  modelId: string;
  endpoint: string;
  modelName: string;
  accountId: string;

  constructor({
    modelId,
    modelName,
    endpoint,
    accountId,
  }: { modelId?: string; modelName?: string; endpoint?: string; accountId?: string } = {}) {
    super({});
    this.modelId = modelId;
    this.endpoint = endpoint;
    this.modelName = modelName;
    this.accountId = accountId;
  }

  shouldDequeueOtherTask(other) {
    return (
      other instanceof DestroyModelTask &&
      this.modelName === other.modelName &&
      this.accountId === other.accountId &&
      this.endpoint === other.endpoint &&
      this.modelId === other.modelId
    );
  }

  getModelConstructor() {
    return require('mailspring-exports')[this.modelName];
  }
}
