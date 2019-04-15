import MailspringStore from 'mailspring-store';
import Actions from '../actions';

class DebugStore extends MailspringStore {
  constructor() {
    super();
  }
  _fakeMessageFromNative(msg){
    Actions.debugFakeNativeMessage(msg);
  }

}

export default new DebugStore();
