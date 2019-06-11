import MailspringStore from 'mailspring-store';
import RoomModel from '../model/Room';
import xmpp from '../chat-components/xmpp';
import {jidlocal} from '../chat-components/utils/jid';

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
      if (typeof members === 'string')  {
        members = JSON.parse(members);
      }
      return members;
    }
    return await this.refreshRoomMember(roomId, curJid);
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
}

module.exports = new RoomStore();
