import MailspringStore from 'mailspring-store';

import DatabaseStore from './database-store';
import BlockContact from '../models/block-contact';

class BlockedSendersStore extends MailspringStore {
  constructor() {
    super();
    this.basicData = [];
    this.blockedSenders = [];
    this.loadBlockedSenders();
  }

  loadBlockedSenders = async () => {
    // status is 1 or 3 mean this data is deleted
    const blocks = await DatabaseStore.findAll(BlockContact).where([
      BlockContact.attributes.state.not(1),
      BlockContact.attributes.state.not(3),
    ]);
    const blockEmailSet = new Set();
    const blockDeDuplication = [];
    blocks.forEach(block => {
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
