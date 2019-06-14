import MailspringStore from 'mailspring-store';
import { ChatActions, MessageStore, ContactStore } from 'chat-exports';
import ConversationModel from '../model/Conversation';
import xmpp from '../xmpp';
import _ from 'underscore';

export const NEW_CONVERSATION = 'NEW_CONVERSATION';

class ConversationStore extends MailspringStore {
  constructor() {
    super();
    this.selectedConversation = null;
    this.conversations = [];
    this._registerListeners();
    this.refreshConversations();
    this._triggerDebounced = _.debounce(() => this.trigger(), 20);
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
    await ConversationModel.destroy({
      where: {
        jid
      }
    });
    this.refreshConversations();
    MessageStore.removeMessagesByConversationJid(jid);
  }

  deselectConversation = async (jid) => {
    this.selectedConversation = null;
    this._triggerDebounced();
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
      };
      this._triggerDebounced();
      return;
    }
    // the same conversation, skip refresh
    if (this.selectedConversation && (this.selectedConversation.jid === jid)) {
      return;
    }
    // refresh message store
    if (!this.selectedConversation || (this.selectedConversation.jid !== jid)) {
      MessageStore.retrieveSelectedConversationMessages(jid);
    }
    await this._clearUnreadCount(jid);
    const conv = await this.getConversationByJid(jid);
    this.selectedConversation = conv;
    this._triggerDebounced();
  }

  _clearUnreadCount = async (jid) => {
    await ConversationModel.update({ unreadMessages: 0 }, { where: { jid } })
    this.refreshConversations();
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

  findConversationsByCondition = async (condition) => {
    return await ConversationModel.findAll(condition);
  }

  refreshConversations = async () => {
    this.conversations = await ConversationModel.findAll({
      order: [
        ['lastMessageTime', 'desc']
      ]
    });
    if (this.selectedConversation && this.selectedConversation.jid !== NEW_CONVERSATION) {
      this.selectedConversation = await this.getConversationByJid(this.selectedConversation.jid);
    }
    this._triggerDebounced();
  }

  saveConversations = async (convs) => {
    for (const conv of convs) {
      await ConversationModel.upsert(conv);
    }
    this.refreshConversations();
  }

  updateConversationByJid = async (data, jid) => {
    await ConversationModel.update(data, {
      where: {
        jid
      }
    });
    this.refreshConversations();
  }

  _createGroupChatRoom = async (payload) => {
    const { contacts, roomId, name, curJid } = payload;
    const jidArr = contacts.map(contact => contact.jid).sort();
    const opt = {
      type: 'create',
      name: name,
      subject: 'test subject',
      description: 'test description',
      members: {
        jid: jidArr
      }
    }
    await xmpp.createRoom(roomId, opt, curJid);
  }

  createGroupConversation = async (payload) => {
    await this._createGroupChatRoom(payload);
    const { contacts, roomId, name } = payload;
    const content = '';
    const timeSend = new Date().getTime();
    const conversation = {
      jid: roomId,
      curJid: contacts[0].curJid,
      name: name,
      isGroup: true,
      unreadMessages: 0,
      lastMessageTime: (new Date(timeSend)).getTime(),
      lastMessageText: content,
      lastMessageSender: contacts[0].curJid
    };
    let avatarMembers = contacts;
    avatarMembers = avatarMembers.filter(contact => contact);
    avatarMembers = [avatarMembers.find(contact => contact.jid === conversation.curJid), contacts.find(contact => contact.jid !== conversation.curJid)];
    avatarMembers = [avatarMembers[0], avatarMembers[1]];
    conversation.avatarMembers = avatarMembers;
    await this.saveConversations([conversation]);
    await this.setSelectedConversation(roomId);
  }

  createPrivateConversation = async (contact) => {
    const jid = contact.jid;
    let conversation = await this.getConversationByJid(jid);
    if (conversation) {
      await this.setSelectedConversation(jid);
      return;
    }
    conversation = {
      jid: contact.jid,
      curJid: contact.curJid,
      name: contact.name,
      isGroup: false,
      // below is some filling to show the conversation
      unreadMessages: 0,
      lastMessageSender: contact.curJid,
      lastMessageText: '',
      lastMessageTime: (new Date()).getTime()
    }
    await this.saveConversations([conversation]);
    await this.setSelectedConversation(jid);
  }

  saveConversationName = async (data) => {
    if (!data || !data.edimucevent || !data.edimucevent.edimucconfig) {
      return;
    }

    const config = data.edimucevent.edimucconfig;
    const convJid = data.from.bare;
    const conv = await this.getConversationByJid(convJid);
    if (!conv || conv.name === config.name) {
      return;
    } else {
      const name = config.name;
      conv.update({ name });
      this.refreshConversations();
    }
  }
}

module.exports = new ConversationStore();
