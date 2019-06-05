import { ChatActions } from 'chat-exports';

export default {
  // esc: ChatActions.deselectConversation,
  'option+left': ChatActions.deselectConversation,
  'option+up': ChatActions.goToPreviousConversation,
  'option+down': ChatActions.goToNextConversation,
};
