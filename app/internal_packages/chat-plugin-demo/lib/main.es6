import {
  BEGIN_SEND_MESSAGE, NEW_MESSAGE, newMessage,
  RECEIVE_CHAT,
  receivePrivateMessage, sendingMessage, SUCCESS_SEND_MESSAGE,
} from '../../edison-beijing-chat/chat-components/actions/chat';
import { getPriKey } from '../../edison-beijing-chat/chat-components/utils/e2ee';
import { Observable } from 'rxjs/Observable';
import { MESSAGE_STATUS_DELIVERED } from '../../edison-beijing-chat/chat-components/db/schemas/message';
import { beginStoringMessage } from '../../edison-beijing-chat/chat-components/actions/db/message';

const receivePrivateMessageEpic = action$ =>
  action$.ofType(RECEIVE_CHAT)
    .mergeMap((payload) => {
      // console.log('chat-pugin-demo epic: ', payload);
      return Observable.fromPromise(getPriKey()).map(({ deviceId, priKey }) => {
        return { payload: payload.payload, deviceId, priKey };
      });
    })
    .map(({ payload }) => receivePrivateMessage(payload));

const triggerStoreMessageEpic = action$ =>
  action$.ofType(NEW_MESSAGE)
  .map(({ payload: newMessage }) => {
    // console.log('dbg*** chat-plugin-demo NEW_MESSAGE: ', newMessage);
    return beginStoringMessage(newMessage);
  });

const render = (msg, idx) => {
  // console.log('chat-pugin-demo render: ', msg, idx);
};
module.exports = {
  activate() {
    addPluginEpics(receivePrivateMessageEpic, triggerStoreMessageEpic);
    addMessageRender(render);
  },
  deactivate() {
  },
};
