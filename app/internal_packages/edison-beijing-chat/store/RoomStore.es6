import MailspringStore from 'mailspring-store';
import RoomModel from '../model/Room';
import xmpp from '../chat-components/xmpp';

class RoomStore extends MailspringStore {
  constructor() {
    super();
    this.rooms = null;
  }

  refreshRooms = async () => {
    this.rooms = {};
    const data = await RoomModel.findAll();
    for (const item of data) {
      this.rooms[item.jid] = item;
    }
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

  getRooms = async () => {
    if (!this.rooms) {
      await this.refreshRooms();
    }
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
    return members;
  }

  getRoomMembers = async (roomId, curJid, force = false) => {
    if (force) {
      return await this.refreshRoomMember(roomId, curJid);
    }
    if (this.rooms
      && this.rooms[roomId]
      && this.rooms[roomId].members
      && this.rooms[roomId].members.length) {
      return this.rooms[roomId].members;
    }
    if (!this.rooms) {
      this.refreshRooms();
    }
    return await this.refreshRoomMember(roomId, curJid);
  }
}

module.exports = new RoomStore();
