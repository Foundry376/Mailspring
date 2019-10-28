import MailspringStore from 'mailspring-store';
import { getLogo } from '../../../internal_packages/edison-beijing-chat/utils/restjs.es6';

// import DatabaseStore from './database-store';
// import Block from '../models/block';

class BlockedSendersStore extends MailspringStore {
  constructor() {
    super();
    this.blockedSenders = [];
    this.loadBlockedSenders();
  }

  loadBlockedSenders = async () => {
    // const blocks = await DatabaseStore.findAll(Block);
    this.blockedSenders = [
      {
        id: 1,
        name: 'Near',
        email: 'y.near@hotmail.com',
      },
      {
        id: 2,
        name: 'Young',
        email: 'ning@edison.tech',
      },
    ];

    for (const blocked of this.blockedSenders) {
      const avatarUrl = await getLogo(blocked.email);
      blocked.avatarUrl = avatarUrl;
    }
    this.trigger();
  };

  refreshBlockedSenders = async () => {
    await this.loadBlockedSenders();
    this.trigger();
  };

  getBlockedSenders = () => {
    return this.blockedSenders;
  };

  isBlocked = email => {
    const blockedList = this.blockedSenders.map(block => block.email);
    return blockedList.indexOf(email) >= 0;
  };

  unBlockEmail = email => {
    console.log('unBlock:' + email);
  };

  blockEmail = email => {
    console.log('block:' + email);
  };
}

module.exports = new BlockedSendersStore();
