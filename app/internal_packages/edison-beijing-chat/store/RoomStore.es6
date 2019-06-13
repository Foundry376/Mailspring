import MailspringStore from 'mailspring-store';
import RoomModel from '../model/Room';
import xmpp from '../chat-components/xmpp';
import {jidlocal} from '../chat-components/utils/jid';
import { MESSAGE_STATUS_RECEIVED } from '../chat-components/db/schemas/message';
import { beginStoringMessage } from '../chat-components/actions/db/message';
import { MessageStore, ContactStore } from 'chat-exports';
import uuid from 'uuid/v4';

class RoomStore extends MailspringStore {
  constructor() {
    super();
    this.loadRooms();
  }

  loadRooms = async () => {
    this.rooms = {};
    const data = await RoomModel.findAll();
    for (const item of data) {
      this.rooms[item.jid] = item;
    }
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
    let members = [];
    const result = await xmpp.getRoomMembers(roomId, null, curJid);
    if (!result) {
      return members;
    }
    if (result && result.mucAdmin) {
      members = result.mucAdmin.items;
    }
    await RoomModel.upsert({
      jid: roomId,
      members
    });
    await this.loadRooms();
    return members;
  }

  getRoomMembers = async (roomId, curJid, force = false) => {
    if (force) {
      const members = await this.refreshRoomMember(roomId, curJid);
      if (members && members.length > 0) {
        return members;
      }
    }
    if (this.rooms[roomId]
      && this.rooms[roomId].members
      && this.rooms[roomId].members.length) {
      let members = this.rooms[roomId].members;
      if (typeof members === 'string') {
        members = JSON.parse(members);
      }
      return members;
    }
    return await this.refreshRoomMember(roomId, curJid);
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
    const local = jidlocal(data.memberJid);
    for (const item of members) {
      if (jidlocal(item.jid) === local) {
        return item.name;
      }
    }
    return null;
  }

  onMembersChange = async (payload) => {
    console.log( 'onMembersChange: payload: ', payload);
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
    this.refreshRoomMember(payload.from.bare, payload.curJid);
    MessageStore.saveMessagesAndRefresh([msg]);
    return;
  }
}

module.exports = new RoomStore();
