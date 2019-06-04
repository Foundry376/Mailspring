import MailspringStore from 'mailspring-store';
import { ChatActions } from 'chat-exports';
import ConversationModel from '../model/Conversation';

class ConversationStore extends MailspringStore {
  constructor() {
    super();
    this.selectedConversation = {};
    this.conversations = [];
    this.refreshConversations();
  }

  setSelectedConversation = async (conv) => {
    this.selectedConversation = conv;
    this.trigger();
  }

  getSelectedConversation(rooms) {
    return this.selectedConversation;
  }

  getConversations() {
    return this.conversations;
  }

  getConversationByJid = async (jid) => {
    for (const conv of this.conversations) {
      if (conv.jid === jid) {
        return conv;
      }
    }
    return await ConversationModel.findOne({
      where: {
        jid
      }
    });
  }

  refreshConversations = async () => {
    this.conversations = await ConversationModel.findAll();
    this.trigger();
  }

  saveConversations(convs) {
    for (const conv of convs) {
      ConversationModel.upsert(conv);
    }
    this.refreshConversations();
  }
}

module.exports = new ConversationStore();
