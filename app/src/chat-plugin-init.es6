//some initialization code for chat plugins
window.pluginEpics = [];
window.messageRenders = [];

//epics is an array of epic for redux-observeable, epic should has the signature of
// (action$: Observable<Action>, state$: StateObservable<State>): Observable<Action>;
// see https://redux-observable.js.org/docs/basics/Epics.html for more information
window.addPluginEpics = (...epics) => {
  window.pluginEpics.push.apply(window.pluginEpics, epics);
};
// renderFunc should be a function with signature (msg, idx) => {}
// msg is the message to be rendered;
// idx is its index in the message group
// it should return a React element
// if it return true, false, undefined, msg will be continued to proceccessed by the following messageRenders
window.addMessageRender = (renderFunc) => {
  window.messageRenders.push(renderFunc);
};

window.renderMessageByPlugins = (msg, idx) => {
  for (const render of window.messageRenders) {
    const result = render(msg, idx);
    if (result === true || result === false || result === undefined) {
      continue;
    } else {
      return result;
    }
  }
};
