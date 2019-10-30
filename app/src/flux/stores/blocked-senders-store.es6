import MailspringStore from 'mailspring-store';
import {
  Actions,
  BlockContactTask,
  UnBlockContactTask,
  GetBlockListTask,
} from 'mailspring-exports';
import DatabaseStore from './database-store';
import BlockContact from '../models/block-contact';

class BlockedSendersStore extends MailspringStore {
  constructor() {
    super();
    this.basicData = [];
    this.blockedSenders = [];
    this.loadBlockedSenders();
    this.listenTo(Actions.changeBlockSucceeded, this.loadBlockedSenders);
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

  isBlockedByAccount = (accountId, email) => {
    const blockedEmailList = this.basicData.filter(
      block => block.email === email && block.accountId === accountId
    );
    return blockedEmailList.length > 0;
  };

  isBlocked = email => {
    const blockedEmailList = this.blockedSenders.filter(block => block.email === email);
    return blockedEmailList.length > 0;
  };

  blockEmailByAccount = (accountId, email) => {
    Actions.queueTask(new BlockContactTask({ accountId: accountId, email: email }));
  };

  unBlockEmailByAccount = (accountId, email) => {
    Actions.queueTask(new UnBlockContactTask({ accountId: accountId, email: email }));
  };

  unBlockEmails = emails => {
    const shouldUnBlockList = this.basicData.filter(block => emails.indexOf(block.email) >= 0);
    const unBlockTaskList = shouldUnBlockList.map(block => {
      return new UnBlockContactTask({ accountId: block.accountId, email: block.email });
    });
    Actions.queueTasks(unBlockTaskList);
  };
}

module.exports = new BlockedSendersStore();
