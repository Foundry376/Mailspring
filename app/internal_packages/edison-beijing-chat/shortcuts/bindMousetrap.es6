import {ChatActions} from 'chat-exports';

const defaultShortcutActionMap = {
  // esc: ChatActions.deselectConversation,
  'option+left': ChatActions.deselectConversation,
  'option+up': ChatActions.goToPreviousConversation,
  'option+down': ChatActions.goToNextConversation,
};

export const bindMousetrap = (mousetrap, shortcutActionMap) => {
  shortcutActionMap = shortcutActionMap || defaultShortcutActionMap;
  Object.entries(shortcutActionMap)
    .forEach(([shortcut, actionCreator]) =>
      mousetrap.bind(shortcut, () => actionCreator())
    );
};

export default bindMousetrap;
