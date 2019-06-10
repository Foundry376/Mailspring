const Sequelize = require('sequelize');
const Model = Sequelize.Model;
const { getSequelize } = require('../chat-components/db/index');
const sequelize = getSequelize();

export default class E2ee extends Model { }
E2ee.init({
  jid: {
    type: Sequelize.STRING,
    primaryKey: true
  },
  devices: {
    type: Sequelize.STRING,
    allowNull: false
  },
  key: {
    type: Sequelize.STRING,
  }
}, {
    sequelize,
    modelName: 'e2ees'
  });
E2ee.sync();
sequelize.e2ees = E2ee;
