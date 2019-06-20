import MailspringStore from 'mailspring-store';
import UserCacheModel from '../model/UserCache';
import fs from 'fs';
import path from 'path';
import _ from 'underscore';
const download = require('download');
let configDirPath = AppEnv.getConfigDirPath();
let avatarDirPath = path.join(configDirPath, 'chat_avatar_cache');

const AVATAR_BASE_URL = 'https://s3.us-east-2.amazonaws.com/edison-profile-stag/';
class UserCacheStore extends MailspringStore {
  constructor() {
    super();
    this.downloading = {};
    this._triggerDebounced = _.debounce(() => this.trigger(), 20);
    this.loadUserCacheData();
  }

  init = async () => {
    if (!this.userCache) {
      await this.loadUserCacheData();
    }
  }

  loadUserCacheData = async () => {
    const data = await UserCacheModel.findAll();
    this.userCache = {};
    for (const item of data) {
      this.userCache[item.jid] = item;
    }
    this._triggerDebounced();
  }

  refreshUserCache = async () => {
    await this.loadUserCacheData();
  }

  saveUserCache = async (members) => {
    if (members) {
      members = [...members];
      for (const member of members) {
        await UserCacheModel.upsert({
          jid: member.jid.bare,
          email: member.email,
          name: member.name,
          info: member
        });
      }
      this.refreshUserCache();
      this.fetchAllAvatars(members);
    }
  }

  fetchAllAvatars = async (members) => {
    if (members) {
      for (const member of members) {
        if (member.avatar) {
          const jid = member.jid.bare;
          const avatarLocalPath = `${avatarDirPath}/${jid}${path.extname(member.avatar)}`;
          const userInfo = this.getUserInfoByJid(jid);
          const isAvatarUpdated = userInfo && userInfo.info.avatar !== member.avatar;
          if (!fs.existsSync(avatarLocalPath)
            || isAvatarUpdated) {
            try {
              if (this.downloading[jid]) {
                return;
              }
              this.downloading[jid] = 1;
              const data = await download(this._getAvatarUrl(member.avatar));
              fs.writeFileSync(avatarLocalPath, data);
              this.downloading[jid] = 0;
              await UserCacheModel.update({
                avatar: avatarLocalPath
              }, { where: { jid } });
              await this.refreshUserCache();
            } catch (e) {
              console.warn('**avatar download error', member, e);
            }
          }
        }
      }
    }
  }

  getAvatarByJid = (jid) => {
    const member = this.userCache && this.userCache[jid];
    if (member && member.avatar) {
      const avatarPath = encodeURI(member.avatar);
      if (!fs.existsSync(avatarPath)) {
        return avatarPath;
      }
      return this._getAvatarUrl(member.info.avatar);
    }
    return null;
  }

  getUserInfoByJid = (jid) => {
    return this.userCache && this.userCache[jid];
  }

  _getAvatarUrl = (avatar) => {
    if (avatar) {
      return AVATAR_BASE_URL + avatar;
    }
    return null;
  }

  getUserCache = () => {
    return this.userCache;
  }
}

module.exports = new UserCacheStore();
