import { ipcRenderer } from 'electron';
import MailspringStore from 'mailspring-store';
import { Actions, WorkspaceStore } from 'mailspring-exports';
import { ChatActions, MessageStore, ContactStore, RoomStore, UserCacheStore } from 'chat-exports';
import ConversationModel from '../model/Conversation';
import _ from 'underscore';
import { MESSAGE_STATUS_RECEIVED } from '../model/Message';
import { setTimeout } from 'timers';
import { NEW_CONVERSATION } from '../utils/constant';

class ConversationStore extends MailspringStore {
  constructor() {
    super();
    this.selectedConversation = null;
    this.conversations = [];
    this._registerListeners();
    this.refreshConversations();
    this._triggerDebounced = _.debounce(() => this.trigger(), 20);
    this._conversationTopBar = null;
  }

  _registerListeners() {
    this.listenTo(ChatActions.selectConversation, this.setSelectedConversation);
    this.listenTo(ChatActions.deselectConversation, this.deselectConversation);
    this.listenTo(ChatActions.removeConversation, this.removeConversation);
    this.listenTo(ChatActions.goToPreviousConversation, this.previousConversation);
    this.listenTo(ChatActions.goToNextConversation, this.nextConversation);
    this.listenTo(ChatActions.goToMostRecentConversation, this.goToMostRecentConvorsation);
    this.listenTo(Actions.goToMostRecentChat, this.goToMostRecentConvorsation);
    this.listenTo(WorkspaceStore, this.workspaceChanged);

    if (AppEnv.isMainWindow()) {
      ipcRenderer.on('new-conversation', () => {
        this.showNewConversationSheet();
      });
    }
  }

  setConversationTopBar = el => {
    this._conversationTopBar = el;
  };

  showNewConversationSheet() {
    if (this._conversationTopBar) {
      this._conversationTopBar.newConversation();
    }
  }

  previousConversation = async () => {
    const jid = this.selectedConversation ? this.selectedConversation.jid : null;
    const jids = this.conversations.map(conv => conv.jid);
    const selectedIndex = jids.indexOf(jid);
    if (jids.length > 1 && selectedIndex > 0) {
      this.setSelectedConversation(jids[selectedIndex - 1]);
    }
  };

  nextConversation = async () => {
    const jid = this.selectedConversation ? this.selectedConversation.jid : null;
    const jids = this.conversations.map(conv => conv.jid);
    const selectedIndex = jids.indexOf(jid);
    if (selectedIndex === -1 || selectedIndex < jids.length - 1) {
      this.setSelectedConversation(jids[selectedIndex + 1]);
    }
  };

  removeConversation = async jid => {
    await ConversationModel.destroy({
      where: {
        jid,
      },
    });
    this.refreshConversations();
    MessageStore.removeMessagesByConversationJid(jid);
  };

  deselectConversation = async () => {
    this.selectedConversation = null;
    MessageStore.conversationJid = null;
    this._triggerDebounced();
  };

  setSelectedConversation = async jid => {
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
    if (this.selectedConversation && this.selectedConversation.jid === jid) {
      if (this.selectedConversation.unreadMessages) {
        await this._clearUnreadCount(jid);
      }
      return;
    }
    // refresh message store
    if (!this.selectedConversation || this.selectedConversation.jid !== jid) {
      MessageStore.retrieveSelectedConversationMessages(jid);
    }
    await this._clearUnreadCount(jid);
    const conv = await this.getConversationByJid(jid);
    this.selectedConversation = conv;
    this._triggerDebounced();
  };

  setSelectedConversationsCurJid = async curJid => {
    if (this.selectedConversation && this.selectedConversation.jid) {
      await this.updateConversationByJid({ curJid }, this.selectedConversation.jid);
      this.refreshConversations();
    }
  };

  _clearUnreadCount = async jid => {
    await ConversationModel.update({ unreadMessages: 0, at: false }, { where: { jid } });
    this.refreshConversations();
  };

  getSelectedConversation() {
    return this.selectedConversation;
  }

  getConversations() {
    return this.conversations;
  }
  workspaceChanged = () => {
    const sheet = WorkspaceStore.topSheet();
    if (sheet) {
      if (sheet.id !== 'ChatView' && sheet.id !== 'Preferences') {
        this.deselectConversation();
      }
    }
  };
  goToMostRecentConvorsation = () => {
    const conversation = this.getMostRecentConversation();
    if (conversation) {
      ChatActions.selectConversation(conversation.jid);
    }
  };
  getMostRecentConversation = () => {
    return this.conversations.length > 0 ? this.conversations[0] : null;
  };

  getConversationByJid = async jid => {
    let result;
    for (const conv of this.conversations) {
      if (conv.jid === jid) {
        result = conv;
        break;
      }
    }
    if (!result) {
      result = await ConversationModel.findOne({
        where: {
          jid,
        },
      });
    }
    if (result && result.isGroup) {
      const room = RoomStore.rooms && RoomStore.rooms[result.jid];
      if (room) {
        result.members = room.dataValues ? room.dataValues.members : room.members;
      }
    }
    return result;
  };

  findConversationsByCondition = async condition => {
    return await ConversationModel.findAll({
      where: condition,
    });
  };

  refreshConversations = async () => {
    this.conversations = await ConversationModel.findAll({
      order: [['lastMessageTime', 'desc']],
    });
    if (this.selectedConversation && this.selectedConversation.jid !== NEW_CONVERSATION) {
      this.selectedConversation = await this.getConversationByJid(this.selectedConversation.jid);
    }
    this._triggerDebounced();
    let count = 0;
    this.conversations.forEach(item => {
      count += item.unreadMessages;
      // if (item.isGroup) {
      //   const room = RoomStore.rooms && RoomStore.rooms[item.jid];
      //   if (room) {
      //     item.members = room.dataValues? room.dataValues.members: room.members;
      //   }
      // }
    });
    this.setTrayChatUnreadCount(count);
  };

  setTrayChatUnreadCount = _.debounce(count => AppEnv.setTrayChatUnreadCount(count), 500);

  saveConversations = async convs => {
    console.log(' saveConversations: ', convs);
    for (const conv of convs) {
      const convInDb = await ConversationModel.findOne({
        where: {
          jid: conv.jid,
        },
      });
      // if exists in db, don't update curJid
      if (convInDb) {
        delete conv.curJid;
        delete conv.name;
      }
      await ConversationModel.upsert(conv);
    }
    this.refreshConversations();
  };

  updateConversationByJid = async (data, jid) => {
    await ConversationModel.update(data, {
      where: {
        jid,
      },
    });
    this.refreshConversations();
  };

  createGroupConversation = async payload => {
    await RoomStore.createGroupChatRoom(payload);
    const { contacts, roomId, name, curJid } = payload;
    const content = '';
    const timeSend = new Date().getTime();
    const conversation = {
      jid: roomId,
      curJid: curJid,
      name: name,
      isGroup: true,
      unreadMessages: 0,
      lastMessageTime: new Date(timeSend).getTime(),
      lastMessageText: content,
      lastMessageSender: curJid,
    };
    let avatarMembers = contacts;
    avatarMembers = avatarMembers.filter(contact => contact);
    avatarMembers = [
      avatarMembers.find(contact => contact.jid === conversation.curJid),
      contacts.find(contact => contact.jid !== conversation.curJid),
    ];
    avatarMembers = [avatarMembers[0], avatarMembers[1]];
    conversation.avatarMembers = avatarMembers;
    await this.saveConversations([conversation]);
    await this.setSelectedConversation(roomId);
  };

  createPrivateConversation = async contact => {
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
      lastMessageTime: new Date().getTime(),
    };
    await this.saveConversations([conversation]);
    await this.setSelectedConversation(jid);
  };

  onChangeConversationName = async data => {
    // called by xmpp.on('edimucconfig', data => {...})
    if (!data || !data.edimucevent || !data.edimucevent.edimucconfig) {
      return;
    }
    const config = data.edimucevent.edimucconfig;
    const convJid = data.from.bare;
    let contact = await ContactStore.findContactByJid(config.actorJid);
    if (!contact) {
      contact = UserCacheStore.getUserInfoByJid(config.actorJid);
    }
    const name = (contact && (contact.name || contact.email)) || config.actorJid.split('@')[0];
    const body = {
      content: `${name} changes the group name to ${config.name}`,
      type: 'change-group-name',
    };
    const msg = {
      id: data.id,
      conversationJid: convJid,
      sender: config.actorJid,
      body: JSON.stringify(body),
      sentTime: new Date().getTime(),
      status: MESSAGE_STATUS_RECEIVED,
    };
    MessageStore.saveMessagesAndRefresh([msg]);
    await this.saveConversationName(convJid, config.name);
    await RoomStore.updateRoomName(convJid, config.name);
  };

  convName = {};
  saveConversationName = async (jid, name) => {
    const conv = await this.getConversationByJid(jid);
    if (!conv || conv.name === name) {
      return;
    } else {
      this.convName[jid] = { name, ts: new Date().getTime() };

      setTimeout(async () => {
        let obj = this.convName[jid];
        if (new Date().getTime() - obj.ts > 45) {
          await conv.update({ name });
          this.refreshConversations();
        }
      }, 50);
    }
  };
}

module.exports = new ConversationStore();
