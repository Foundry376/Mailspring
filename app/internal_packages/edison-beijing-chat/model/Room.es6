const Sequelize = require('sequelize');
const Model = Sequelize.Model;
const { getSequelize } = require('../chat-components/db/index');
const sequelize = getSequelize();

export default class Room extends Model { }
Room.init({
  // attributes
  jid: {
    type: Sequelize.STRING,
    primaryKey: true
  },
  name: {
    type: Sequelize.STRING,
    indexed: true,
  }
}, {
    sequelize,
    modelName: 'room'
    // options
  });
Room.sync();