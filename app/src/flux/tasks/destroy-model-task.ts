/* eslint global-require:0 */
import { Task } from './task';

export class DestroyModelTask extends Task {
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
