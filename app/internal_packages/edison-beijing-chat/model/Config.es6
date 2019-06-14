const Sequelize = require('sequelize');
const Model = Sequelize.Model;
const { getdb } = require('../db/index');
const db = getdb();

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
    sequelize:db,
    modelName: 'configs'
  });
Config.sync();
db.configs = Config;
