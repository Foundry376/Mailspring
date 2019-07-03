import MailspringStore from 'mailspring-store';
class FailMessageStore extends MailspringStore {
  constructor() {
    super();
    this.msg = null;
    this.visible = false;
    return;
  }

  setMsg(msg) {
    console.log( 'setMsg: msg: ', msg);
    this.msg = msg;
    this.visible = true;
    this.trigger();
  }

  hide() {
    this.visible = false;
    this.trigger();
  }
}

module.exports = new FailMessageStore();
