import MailspringStore from 'mailspring-store';
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
