import {ChatActions} from 'chat-exports';

const defaultShortcutActionMap = {
  // esc: ChatActions.deselectConversation,
  'option+left': ChatActions.deselectConversation,
  'option+up': ChatActions.goToPreviousConversation,
  'option+down': ChatActions.goToNextConversation,
};

export const bindMousetrap = (mousetrap, shortcutActionMap = defaultShortcutActionMap) => {
  Object.entries(shortcutActionMap)
    .forEach(([shortcut, action]) =>
      mousetrap.bind(shortcut, action)
    );
};

export default bindMousetrap;
