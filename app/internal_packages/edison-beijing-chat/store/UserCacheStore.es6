import MailspringStore from 'mailspring-store';
import UserCacheModel from '../model/UserCache';
import fs from 'fs';
import path from 'path';
import _ from 'underscore';
import { ContactStore, OnlineUserStore } from 'chat-exports';

const download = require('download');
let configDirPath = AppEnv.getConfigDirPath();
let avatarDirPath = path.join(configDirPath, 'chat_avatar_cache');

const AVATAR_BASE_URL = 'https://s3.us-east-2.amazonaws.com/edison-profile-stag/';
class UserCacheStore extends MailspringStore {
  constructor() {
    super();
    this.downloading = {};
    this._triggerDebounced = _.debounce(() => this.trigger(), 20);
    // this.loadUserCacheData(); // 这里执行貌似无实际作用，待观察
  }

  init = async () => {
    if (!this.userCache) {
      await this.loadUserCacheData();
    }
  };

  loadUserCacheData = async () => {
    // 从UserCache中取数据
    const UserCacheDatas = await UserCacheModel.findAll();
    this.userCache = {};
    for (const item of UserCacheDatas) {
      this.userCache[item.jid] = item;
    }
    // 从Contact中取数据，优先级要高于UserCache中的数据
    const ContactDatas = await ContactStore.getContacts();
    for (const item of ContactDatas) {
      let avatar;
      // 如果userCache表中有avatar数据，使用userCache表中的。
      if (this.userCache[item.jid] && this.userCache[item.jid].avatar) {
        avatar = this.userCache[item.jid].avatar;
      } else if (item.avatar && item.avatar.indexOf('http') === -1) {
        avatar = 'https://s3.us-east-2.amazonaws.com/edison-profile/' + item.avatar;
      }
      this.userCache[item.jid] = Object.assign({}, item.dataValues, { avatar });
    }

    this._triggerDebounced();
  };

  refreshUserCache = async () => {
    await this.loadUserCacheData();
  };

  saveUserCache = async members => {
    if (members) {
      try {
        members = [...members];
      } catch (e) {
        console.trace('saveUserCache: members: ', members, e);
      }
      for (const member of members) {
        await UserCacheModel.upsert({
          jid: member.jid.bare,
          email: member.email,
          name: member.name,
          info: member,
        });
      }
      await this.fetchAllAvatars(members);
      this.refreshUserCache();
    }
  };

  fetchAllAvatars = async members => {
    if (members) {
      for (const member of members) {
        if (member.avatar) {
          const jid = member.jid.bare;
          const avatarLocalPath = `${avatarDirPath}/${jid}${path.extname(member.avatar)}`;
          const userInfoInstance = await UserCacheModel.findOne({ where: { jid } });
          const isAvatarUpdated =
            userInfoInstance &&
            userInfoInstance.info &&
            userInfoInstance.info.avatar !== member.avatar;
          if (!fs.existsSync(avatarLocalPath) || isAvatarUpdated) {
            try {
              if (this.downloading[jid]) {
                return;
              }
              this.downloading[jid] = 1;
              const data = await download(this._getAvatarUrl(member.avatar));
              fs.writeFileSync(avatarLocalPath, data);
              this.downloading[jid] = 0;
              await userInfoInstance.update({
                avatar: avatarLocalPath,
              });
            } catch (e) {
              console.warn('**avatar download error', member, e);
            }
          }
        }
      }
    }
  };

  getAvatarByJid = jid => {
    const member = this.userCache && this.userCache[jid];
    if (member && member.avatar) {
      const avatarPath = encodeURI(member.avatar);
      if (!fs.existsSync(avatarPath)) {
        return avatarPath;
      }
      return this._getAvatarUrl(member.info.avatar);
    }
    return null;
  };

  getUserInfoByJid = jid => {
    return (this.userCache && this.userCache[jid]) || OnlineUserStore.getSelfAccountById(jid);
  };

  _getAvatarUrl = avatar => {
    if (avatar) {
      return AVATAR_BASE_URL + avatar;
    }
    return null;
  };

  getUserCache = () => {
    return this.userCache;
  };
}

module.exports = new UserCacheStore();
