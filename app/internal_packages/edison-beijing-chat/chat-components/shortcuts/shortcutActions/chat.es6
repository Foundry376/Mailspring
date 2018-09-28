import {
  deselectConversation,
  goToPreviousConversation,
  goToNextConversation,
} from '../../actions/chat';

export default {
  esc: deselectConversation,
  'option+left': deselectConversation,
  'option+up': goToPreviousConversation,
  'option+down': goToNextConversation,
};
