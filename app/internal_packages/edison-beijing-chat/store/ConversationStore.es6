import MailspringStore from 'mailspring-store';
import { ChatActions, MessageStore } from 'chat-exports';
import ConversationModel from '../model/Conversation';

export const NEW_CONVERSATION = 'NEW_CONVERSATION';

class ConversationStore extends MailspringStore {
  constructor() {
    super();
    this.selectedConversation = null;
    this.conversations = [];
    this._registerListeners();
    this.refreshConversations();
  }

  _registerListeners() {
    this.listenTo(ChatActions.selectConversation, this.setSelectedConversation);
    this.listenTo(ChatActions.deselectConversation, this.deselectConversation);
    this.listenTo(ChatActions.removeConversation, this.removeConversation);
    this.listenTo(ChatActions.goToPreviousConversation, this.previousConversation);
    this.listenTo(ChatActions.goToNextConversation, this.nextConversation);
  }

  previousConversation = async () => {
    const jid = this.selectedConversation ? this.selectedConversation.jid : null;
    const jids = this.conversations.map(conv => conv.jid);
    const selectedIndex = jids.indexOf(jid);
    if (jids.length > 1 && selectedIndex > 0) {
      this.setSelectedConversation(jids[selectedIndex - 1]);
    }
  }

  nextConversation = async () => {
    const jid = this.selectedConversation ? this.selectedConversation.jid : null;
    const jids = this.conversations.map(conv => conv.jid);
    const selectedIndex = jids.indexOf(jid);
    if (selectedIndex === -1 || selectedIndex < jids.length - 1) {
      this.setSelectedConversation(jids[selectedIndex + 1]);
    }
  }

  removeConversation = async (jid) => {
    ConversationModel.destroy({
      where: {
        jid
      }
    });
    this.refreshConversations();
  }

  deselectConversation = async (jid) => {
    this.selectedConversation = null;
    this.trigger();
  }

  setSelectedConversation = async (jid) => {
    if (jid === NEW_CONVERSATION) {
      this.selectedConversation = {
        jid: jid,
        curJid: null,
        name: ' ',
        email: null,
        avatar: null,
        isGroup: false,
        unreadMessages: 0,
        occupants: []
      };
      this.trigger();
    }
    // the same conversation, skip refresh
    if (this.selectedConversation && (this.selectedConversation.jid === jid)) {
      console.log('****setSelectedConversation return');
      return;
    }
    // refresh message store
    if (!this.selectedConversation || (this.selectedConversation.jid !== jid)) {
      MessageStore.retrieveSelectedConversationMessages(jid);
    }
    await this._clearUnreadCount(jid);
    const conv = await this.getConversationByJid(jid);
    this.selectedConversation = conv;
    this.trigger();
  }

  _clearUnreadCount = async (jid) => {
    await ConversationModel.update({ unreadMessages: 0 }, { where: { jid } })
    this.conversations = await ConversationModel.findAll();
  }

  getSelectedConversation() {
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
    this.conversations = await ConversationModel.findAll({
      order: [
        ['lastMessageTime', 'desc']
      ]
    });
    this.trigger();
  }

  saveConversations = async (convs) => {
    for (const conv of convs) {
      await ConversationModel.upsert(conv);
    }
    this.refreshConversations();
  }
}

module.exports = new ConversationStore();
