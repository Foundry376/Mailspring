import MailspringStore from 'mailspring-store';
import RoomModel from '../model/Room';
import xmpp from '../xmpp';
import { jidlocal } from '../utils/jid';
import { MESSAGE_STATUS_RECEIVED } from '../model/Message';
import { MessageStore, ContactStore, UserCacheStore, ConfigStore } from 'chat-exports';


const ROOM_MEMBER_VER = 'room_member_ver_';
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

  saveRooms(rooms) {
    if (rooms && rooms.discoItems && rooms.discoItems.items) {
      for (const room of rooms.discoItems.items) {
        RoomModel.upsert({
          jid: room.jid.bare,
          name: room.name
        });
      }
      this.refreshRooms();
    }
  }

  getRooms = () => {
    return this.rooms;
  }

  refreshRoomMember = async (roomId, curJid) => {
    let members = await this.getRoomMembersFromXmpp(roomId, curJid);
    if (!members) {
      return this.getRoomMembersFromCache(roomId, curJid);
    } else {
      await this.loadRooms();
      UserCacheStore.saveUserCache(members);
    }
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

  getRoomMembersFromXmpp = async (roomId, curJid) => {
    let members = null;
    const configKey = ROOM_MEMBER_VER + curJid + '_' + roomId;
    const config = await ConfigStore.findOne(configKey)
    let ver = '';
    if (config) {
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
    if (force) {
      const members = await this.refreshRoomMember(roomId, curJid);
      if (members && members.length > 0) {
        return members;
      }
    }

    let members = this.getRoomMembersFromCache(roomId, curJid);
    if (!members) {
      members = await this.getRoomMembersFromXmpp(roomId, curJid);
      if (members) {
        await this.loadRooms();
        UserCacheStore.saveUserCache(members);
      }
    }
    if (!members) {
      console.error('***members is null', roomId, curJid, force);
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
    return { roomMembers: members, contact: null };;
  }

  getMemberName = async (data) => {
    // data: {roomJid, memberJid, curJid}

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
    const fromjid = payload.userJid;
    const fromcontact = await ContactStore.findContactByJid(fromjid);
    const byjid = payload.actorJid;
    const bycontact = await ContactStore.findContactByJid(byjid);
    const item = {
      from: {
        jid: fromjid,
        email: payload.userEmail,
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
    const fromName = item.from.nickname || item.from.name || item.from.email;
    const byName = item.by.nickname || item.by.name || item.by.email;
    if (payload.type === 'join') {
      content = `${fromName} joined by invitation from ${byName}.`
    } else {
      content = `${fromName} quited by operation from ${byName}.`
    }
    const body = {
      content,
      type: 'memberschange'
    }
    const msg = {
      id: payload.id,
      conversationJid: payload.from.bare,
      sender: fromjid,
      body: JSON.stringify(body),
      sentTime: (new Date()).getTime(),
      status: MESSAGE_STATUS_RECEIVED,
    };
    MessageStore.saveMessagesAndRefresh([msg]);
    this.trigger();
    return;
  }
}

module.exports = new RoomStore();
