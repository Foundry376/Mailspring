import Task from './task';
import Attributes from '../attributes';
import Actions from '../actions';

export default class DestroyDraftTask extends Task {
  static attributes = Object.assign({}, Task.attributes, {
    messageIds: Attributes.Collection({
      modelKey: 'messageIds',
    }),
    // headerMessageId: Attributes.String({
    //   modelKey: 'headerMessageId',
    // })
  });

  label() {
    return 'Deleting draft';
  }
  onSuccess(){
    Actions.destroyDraftSucceeded({
      messageIds: this.messageIds,
    });
  }
  onError({key, debuginfo}){
    Actions.destroyDraftFailed({
      key, debuginfo,
      messageIds: this.messageIds,
    });
  }
}
