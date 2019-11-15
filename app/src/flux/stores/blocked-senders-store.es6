import MailspringStore from 'mailspring-store';
import {
  Actions,
  BlockContactTask,
  UnBlockContactTask,
  GetBlockListTask,
  AccountStore,
} from 'mailspring-exports';
import DatabaseStore from './database-store';
import BlockContact from '../models/block-contact';

class BlockedSendersStore extends MailspringStore {
  constructor() {
    super();
    this.basicData = [];
    this.blockedSenders = [];
    this.refreshBlockedSenders();
    this.listenTo(Actions.changeBlockSucceeded, this.refreshBlockedSenders);

    DatabaseStore.listen(change => {
      if (change.objectClass === BlockContact.name) {
        this.refreshBlockedSenders();
      }
    });
  }

  refreshBlockedSenders = async () => {
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

  syncBlockedSenders = () => {
    Actions.queueTask(new GetBlockListTask());
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
    const unBlockTaskList = [];
    AccountStore.accounts().forEach(account => {
      emails.forEach(email => {
        unBlockTaskList.push(new UnBlockContactTask({ accountId: account.id, email: email }));
      });
    });
    Actions.queueTasks(unBlockTaskList);
  };
}

module.exports = new BlockedSendersStore();
