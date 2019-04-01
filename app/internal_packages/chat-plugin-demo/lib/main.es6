import { RECEIVE_CHAT, receivePrivateMessage } from '../../edison-beijing-chat/chat-components/actions/chat';
import { getPriKey } from '../../edison-beijing-chat/chat-components/utils/e2ee';
import { Observable } from 'rxjs/Observable';

const receivePrivateMessageEpic = action$ =>
  action$.ofType(RECEIVE_CHAT)
    .mergeMap((payload) => {
      console.log('chat-pugin-demo epic: ', payload);
      return Observable.fromPromise(getPriKey()).map(({ deviceId, priKey }) => {
        return { payload: payload.payload, deviceId, priKey };
      });
    })
    .map(({ payload }) => receivePrivateMessage(payload));

const render = (msg, idx) => {
  console.log('chat-pugin-demo render: ', msg, idx);
};
module.exports = {
  activate() {
    addPluginEpics(receivePrivateMessageEpic);
    addMessageRender(render);
  },
  deactivate() {
  },
};
