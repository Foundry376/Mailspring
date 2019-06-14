const Sequelize = require('sequelize');
const Model = Sequelize.Model;
const { getdb } = require('../chat-components/db/index');
const db = getdb();

export default class E2ee extends Model { }
E2ee.init({
  jid: {
    type: Sequelize.STRING,
    primaryKey: true
  },
  devices: {
    type: Sequelize.STRING,
    allowNull: false
  }
}, {
    sequelize:db,
    modelName: 'e2ees'
  });
E2ee.sync();
db.e2ees = E2ee;
