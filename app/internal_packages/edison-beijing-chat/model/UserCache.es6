const Sequelize = require('sequelize');
const Model = Sequelize.Model;
const { getSequelize } = require('../chat-components/db/index');
const sequelize = getSequelize();

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
    sequelize,
    modelName: 'configs'
  });
UserCache.sync();
sequelize.configs = UserCache;
