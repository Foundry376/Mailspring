import MailspringStore from 'mailspring-store';
import BlockModel from '../model/Block';
import xmpp from '../xmpp';

class BlockStore extends MailspringStore {
  constructor() {
    super();
    this.loadBlocks();
  }

  loadBlocks = async () => {
    const data = await BlockModel.findAll();
    this.blocked = new Map();
    for (const item of data) {
      const jidList = new Set(this.blocked.get(item.curJid) || []);
      jidList.add(item.jid);
      this.blocked.set(item.curJid, [...jidList]);
    }
  };

  refreshBlocks = async () => {
    await this.loadBlocks();
    this.trigger();
  };

  refreshBlocksFromXmpp = async curJid => {
    const block = await xmpp.getBlocked(null, curJid);
    const blockMap = new Map();
    const jidList = [];
    if (
      block &&
      block.curJid &&
      block.blockList &&
      block.blockList.jids &&
      block.blockList.jids.length
    ) {
      block.blockList.jids.forEach(jid => {
        jidList.push(typeof jid === 'object' ? jid.bare : jid);
      });
    }
    blockMap.set(block.curJid, jidList);
    await this.saveBlocks(blockMap);
    await this.refreshBlocks();
  };

  saveBlocks = async blockMap => {
    const oldCurJids = new Set();
    const insetBlocks = [];
    for (const [curJid, jids = []] of blockMap) {
      oldCurJids.add(curJid);
      for (const jid of jids) {
        insetBlocks.push({
          curJid,
          jid,
        });
      }
    }
    await BlockModel.destroy({
      where: {
        curJid: [...oldCurJids],
      },
    });
    await BlockModel.bulkCreate(insetBlocks);
  };

  getBlocked = async curJid => {
    if (!this.blocked) {
      await this.refreshBlocks();
    }
    return this.blocked && this.blocked.get(curJid) ? this.blocked.get(curJid) : [];
  };

  block = async (jid, curJid) => {
    const myXmpp = xmpp.getXmpp(curJid);
    await myXmpp.block(jid);
    await this.refreshBlocksFromXmpp(curJid);
  };

  unblock = async (jid, curJid) => {
    const myXmpp = xmpp.getXmpp(curJid);
    await myXmpp.unblock(jid);
    await this.refreshBlocksFromXmpp(curJid);
  };

  isBlocked = async (jid, curJid) => {
    if (!this.blocked) {
      await this.refreshBlocks();
    }
    const blockedList = this.blocked && this.blocked.get(curJid) ? this.blocked.get(curJid) : [];
    return blockedList.indexOf(jid) >= 0;
  };
}

module.exports = new BlockStore();
