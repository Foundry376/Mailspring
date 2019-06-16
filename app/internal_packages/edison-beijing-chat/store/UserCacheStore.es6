import MailspringStore from 'mailspring-store';
import UserCacheModel from '../model/UserCache';

class UserCacheStore extends MailspringStore {
  constructor() {
    super();
    this.loadUserCacheData();
  }

  loadUserCacheData = async () => {
    this.userCache = {};
    const data = await UserCacheModel.findAll();
    for (const item of data) {
      this.userCache[item.email] = item;
    }
  }

  refreshUserCache = async () => {
    await this.loadUserCacheData();
    this.trigger();
  }

  saveUserCache(members) {
    if (members) {
      for (const member of members) {
        UserCacheModel.upsert({
          email: member.email,
          name: member.name,
          info: member
        });
      }
      this.refreshUserCache();
    }
  }

  getUserCache = () => {
    return this.userCache;
  }
}

module.exports = new UserCacheStore();
