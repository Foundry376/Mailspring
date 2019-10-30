import MailspringStore from 'mailspring-store';

import DatabaseStore from './database-store';
import Block from '../models/block';

class BlockedSendersStore extends MailspringStore {
  constructor() {
    super();
    this.basicData = [];
    this.blockedSenders = [];
    this.loadBlockedSenders();
  }

  loadBlockedSenders = async () => {
    // const blocks = await DatabaseStore.findAll(Block);
    const blocks = [
      {
        id: 1,
        name: 'Near',
        email: 'y.near@hotmail.com',
      },
      {
        id: 2,
        name: 'Young near',
        email: 'ning@edison.tech',
      },
      {
        id: 3,
        name: 'Young',
        email: 'ning@edison.tech',
      },
    ];
    const blockEmailSet = new Set();
    const blockDeDuplication = [];
    // status is 1 or 3 mean this data is deleted
    blocks
      .filter(block => block.state !== 1 && block.state !== 3)
      .forEach(block => {
        // delete the duplication email data
        if (!blockEmailSet.has(block.email)) {
          blockEmailSet.add(block.email);
          blockDeDuplication.push(block);
        }
      });
    this.basicData = blocks;
    this.blockedSenders = blockDeDuplication;
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

  unBlockEmails = emails => {
    const shouldUnBlockList = this.basicData.filter(block => emails.indexOf(block.email) >= 0);
    console.error('^^^^^^^^^^^^^^^^^^^^^^');
    console.error(shouldUnBlockList);
    console.error('^^^^^^^^^^^^^^^^^^^^^^');
  };
}

module.exports = new BlockedSendersStore();
