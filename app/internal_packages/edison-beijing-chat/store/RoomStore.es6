import MailspringStore from 'mailspring-store';
import { AccountStore } from 'mailspring-exports';
import RoomModel from '../model/Room';
import xmpp from '../xmpp';
import { jidlocal } from '../utils/jid';
import { MESSAGE_STATUS_RECEIVED } from '../model/Message';
import { MessageStore, ContactStore, UserCacheStore, ConfigStore, ConversationStore, ChatActions } from 'chat-exports';
import delay from '../utils/delay'

const ROOM_MEMBER_VER = 'room_member_ver_';
const ROOM_LIST_VER = 'room_list_ver_';
class RoomStore extends MailspringStore {
  constructor() {
    super();
    this.loadRooms();
  }

  loadRooms = async () => {
    const data = await RoomModel.findAll();
    if (!this.rooms) {
      this.rooms = {};
    }
    for (const item of data) {
      this.rooms[item.jid] = item;
    }
    // ConversationStore.refreshConversations();
  }

  createGroupChatRoom = async (payload) => {
    const { contacts, roomId, name, curJid } = payload;
    const jidArr = contacts.map(contact => contact.jid).sort();
    const opt = {
      type: 'create',
      name,
      subject: 'test subject',
      description: 'test description',
      members: {
        jid: jidArr
      }
    }
    await xmpp.createRoom(roomId, opt, curJid);
    RoomModel.upsert({
      jid: roomId,
      name
    });
  }

  refreshRooms = async () => {
    await this.loadRooms();
    this.trigger();
  }

  saveRooms = async (rooms) => {
    if (rooms && rooms.discoItems && rooms.discoItems.items) {
      for (const room of rooms.discoItems.items) {
        await RoomModel.upsert({
          jid: room.jid.bare,
          name: room.name
        });
      }
      if (rooms.discoItems.ver) {
        const configKey = ROOM_LIST_VER + rooms.curJid;
        ConfigStore.saveConfig({ key: configKey, value: rooms.discoItems.ver });
      }
      this.refreshRooms();
    }
  }

  refreshRoomsFromXmpp = async (jid) => {
    const configKey = ROOM_LIST_VER + jid;
    const config = await ConfigStore.findOne(configKey)
    let ver = '1';
    if (config) {
      ver = config.value;
    }
    xmpp.getRoomList(ver, jid)
      .then(rooms => this.saveRooms(rooms));
  }

  getRooms = () => {
    return this.rooms;
  }

  refreshRoomMember = async (roomId, curJid, force) => {
    let members;
    if (force) {
      members = await this.getRoomMembersFromXmpp(roomId, curJid);
    }
    if (!members) {
      members = this.getRoomMembersFromCache(roomId, curJid);
      if (members) {
        return members;
      } else {
        console.warn('***members is null', roomId, curJid, force);
        members = await this.getRoomMembersFromXmpp(roomId, curJid, true);
      }
    }
    const room = this.rooms && this.rooms[roomId];
    if (room) {
      room.members = members;
    }
    await this.loadRooms();
    UserCacheStore.saveUserCache(members);
    return members;
  }

  getRoomMembersFromCache = (roomId, curJid) => {
    if (this.rooms
      && this.rooms[roomId]
      && this.rooms[roomId].members
      && this.rooms[roomId].members.length) {
      let members = this.rooms[roomId].members;
      if (typeof members === 'string') {
        members = JSON.parse(members);
      }
      return members;
    }
  }

  getRoomMembersFromXmpp = async (roomId, curJid, force) => {
    let members = null;
    const configKey = ROOM_MEMBER_VER + curJid + '_' + roomId;
    const config = await ConfigStore.findOne(configKey)
    let ver = '';
    if (!force && config) {
      ver = config.value;
    }
    const result = await xmpp.getRoomMembers(roomId, ver, curJid);
    if (result && result.mucAdmin && ver != result.mucAdmin.ver
      && result.mucAdmin.items) {
      members = result.mucAdmin.items;
      await RoomModel.upsert({
        jid: roomId,
        members
      });
      await ConfigStore.saveConfig({ key: configKey, value: result.mucAdmin.ver });
    }
    return members;
  }

  getRoomMembers = async (roomId, curJid, force = false) => {
    const members = await this.refreshRoomMember(roomId, curJid, force);
    if (!members) {
      console.warn('***members is null', roomId, curJid, force);
    }
    return members || [];
  }

  getConversationOccupants = async (roomId, curJid) => {
    const members = await this.getRoomMembers(roomId, curJid);
    if (members) {
      return members.map(m => m.jid);
    }
    return [];
  }

  getMemeberInfo = async (roomId, curJid, memberId) => {
    const members = await this.getRoomMembers(roomId, curJid);
    if (members && members.length > 0) {
      for (const member of members) {
        if (member.jid === memberId) {
          return { roomMembers: members, contact: member };
        }
      }
    }
    return { roomMembers: members, contact: null };
  }

  getMemberName = async (data) => {
    const roomJid = data.roomJid || data.curJid;
    const curJid = data.curJid || data.memberJid;
    const members = await this.getRoomMembers(roomJid, curJid);
    if (members) {
      const local = jidlocal(data.memberJid);
      for (const item of members) {
        if (jidlocal(item.jid) === local) {
          return item.name;
        }
      }
    }
    return null;
  }

  onMembersChange = async (payload) => {
    const nicknames = chatLocalStorage.nicknames;
    const conversationJid = payload.from.bare;
    const fromjid = payload.userJid;
    let fromcontact = await UserCacheStore.getUserInfoByJid(fromjid);
    if (!fromcontact) {
      fromcontact = ContactStore.findContactByJid(fromjid)
    }
    const byjid = payload.actorJid;
    let bycontact = await UserCacheStore.getUserInfoByJid(byjid);
    if (!bycontact) {
      bycontact = ContactStore.findContactByJid(byjid)
    }
    const item = {
      from: {
        jid: fromjid,
        email: payload.userEmail || payload.email,
        name: fromcontact && fromcontact.name,
        nickname: nicknames[fromjid]
      },
      type: payload.type,
      by: {
        jid: byjid,
        email: bycontact && bycontact.email,
        name: bycontact && bycontact.name,
        nickname: nicknames[byjid]
      }
    }

    let content;
    const fromName = item.from.nickname || item.from.name || item.from.email || fromcontact && fromcontact.email || fromjid;
    const byName = item.by.nickname || item.by.name || item.by.email || byjid;
    if (payload.type === 'join') {
      content = `${byName} invited ${fromName} to join the conversation.`;
    } else {
      if (fromName === byName) {
        content = `${fromName} left the conversation.`;
      } else {
        content = `${byName} removed ${fromName} from the conversation.`;
      }
      // curJid user is removed, and other self account is still in this group
      // update curJid to other self use
      await this.updateConversationCurJid(fromjid, conversationJid);
    }
    const conv = await ConversationStore.getConversationByJid(conversationJid);
    await this.refreshRoomMember(conversationJid, conv.curJid, true);
    await ConversationStore.refreshConversations();
    if (ConversationStore.selectedConversation.jid === conversationJid) {
      ChatActions.memberChange(conversationJid);
    }
    const body = {
      content,
      type: 'memberschange'
    }
    const msg = {
      id: payload.id,
      conversationJid: conversationJid,
      sender: fromjid,
      body: JSON.stringify(body),
      sentTime: (new Date()).getTime(),
      status: MESSAGE_STATUS_RECEIVED,
    };
    MessageStore.saveMessagesAndRefresh([msg]);
    this.trigger();
  }

  updateConversationCurJid = async (removedJid, conversationJid) => {
    // curJid user is removed, and other self account is still in this group
    // update curJid to other self use
    const conversation = await ConversationStore.getConversationByJid(conversationJid);
    if (conversation && removedJid === conversation.curJid) {
      const members = this.getRoomMembersFromCache(conversationJid);
      if (members) {
        for (const member of members) {
          if (removedJid !== member.jid && this._isMe(member.email)) {
            await ConversationStore.updateConversationByJid({
              curJid: member.jid
            }, conversationJid);
            await this.refreshRoomMember(conversationJid, member.jid, true);
            return true;
          }
        }
      }
    }
    return false;
  }

  updateRoomName = async (roomId, roomName) => {
    await RoomModel.upsert({
      jid: roomId,
      name: roomName
    });
  }

  _isMe(email) {
    return !!AccountStore.accountForEmail(email);
  }
}

module.exports = new RoomStore();
