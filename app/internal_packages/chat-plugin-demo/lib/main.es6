// const receivePrivateMessageEpic = action$ =>
//   action$.ofType(RECEIVE_CHAT)
//     .mergeMap((payload) => {
//       return Observable.fromPromise(getPriKey()).map(({ deviceId, priKey }) => {
//         return { payload: payload.payload, deviceId, priKey };
//       });
//     })
//     .map(({ payload }) => receivePrivateMessage(payload));
//
// const triggerStoreMessageEpic = action$ =>
//   action$.ofType(NEW_MESSAGE)
//   .map(({ payload: newMessage }) => {
//     return beginStoringMessage(newMessage);
//   });

const render = (msg, idx) => {
};
module.exports = {
  activate() {
    // addPluginEpics(receivePrivateMessageEpic, triggerStoreMessageEpic);
    // addMessageRender(render);
  },
  deactivate() {
  },
};
