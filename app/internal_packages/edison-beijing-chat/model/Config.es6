const Sequelize = require('sequelize');
const Model = Sequelize.Model;
const { getSequelize } = require('../chat-components/db/index');
const sequelize = getSequelize();

export default class Config extends Model { }
Config.init({
  key: {
    type: Sequelize.STRING,
    primaryKey: true
  },
  value: {
    type: Sequelize.STRING,
    indexed: true,
  },
  time: {
    type: Sequelize.INTEGER,
  }
}, {
    sequelize,
    modelName: 'configs'
  });
Config.sync();
sequelize.configs = Config;
