import Reflux from 'reflux';

const ActionScopeWindow = 'window';
const ActionScopeGlobal = 'global';
const ActionScopeMainWindow = 'main';

class Actions {
  static updateProgress = ActionScopeWindow;
  static updateImagePopup = ActionScopeWindow;
  static selectConversation = ActionScopeWindow;
  static deselectConversation = ActionScopeWindow;
  static removeConversation = ActionScopeWindow;
  static goToPreviousConversation = ActionScopeWindow;
  static goToNextConversation = ActionScopeWindow;
  static updateDownload = ActionScopeWindow;
  static userOnlineStatusChanged = ActionScopeWindow;
}

// Read the actions we declared on the dummy Actions object above
// and translate them into Reflux Actions

// This helper method exists to trick the Donna lexer so it doesn't
// try to understand what we're doing to the Actions object.
const create = (obj, name, scope) => {
  obj[name] = Reflux.createAction(name);
  obj[name].scope = scope;
  obj[name].sync = true;
};

const scopes = {
  window: [],
  global: [],
  main: [],
};

for (const name of Object.getOwnPropertyNames(Actions)) {
  if (
    name === 'length' ||
    name === 'name' ||
    name === 'arguments' ||
    name === 'caller' ||
    name === 'prototype'
  ) {
    continue;
  }
  if (Actions[name] !== 'window' && Actions[name] !== 'global' && Actions[name] !== 'main') {
    continue;
  }
  const scope = Actions[name];
  scopes[scope].push(name);
  create(Actions, name, scope);
}

export default Actions;
