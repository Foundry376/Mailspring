import MailspringStore from 'mailspring-store';
import {ChatActions} from 'chat-exports';

class MessageImagePopupStore extends MailspringStore {
  constructor() {
    super();
    this.msg = null;
    this._registerListeners();
  }
  _registerListeners() {
    this.listenTo(ChatActions.updateImagePopup, this.updateImagePopup);
  }

  updateImagePopup(msg) {
    console.log( 'MessageImagePopupStore.updateImagePopup: msg', msg);
    this.msg = msg;
    this.trigger();
  }

}

module.exports = new MessageImagePopupStore();

