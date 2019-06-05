import MailspringStore from 'mailspring-store';
import { ChatActions } from 'chat-exports';
import RoomModel from '../model/Room';

class RoomStore extends MailspringStore {
  constructor() {
    super();
    this.rooms = null;
  }

  refreshRooms = async () => {
    this.rooms = {};
    const data = await RoomModel.findAll();
    for (const item of data) {
      this.rooms[item.jid] = item.name;
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
}

module.exports = new RoomStore();
