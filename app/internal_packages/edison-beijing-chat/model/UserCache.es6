const Sequelize = require('sequelize');
const Model = Sequelize.Model;
const { getdb } = require('../db/index');
const db = getdb();

export default class UserCache extends Model { }
UserCache.init({
  email: {
    type: Sequelize.STRING,
    primaryKey: true
  },
  name: {
    type: Sequelize.STRING,
  },
  avatar: {
    type: Sequelize.STRING,
  },
  info: {
    type: Sequelize.JSON,
  },
}, {
    sequelize: db,
    modelName: 'usercache'
  });
UserCache.sync();
db.userCache = UserCache;
