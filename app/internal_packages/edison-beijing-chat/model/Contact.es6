const Sequelize = require('sequelize');
const Model = Sequelize.Model;
const { getdb } = require('../db/index');
const db = getdb();

export default class Contact extends Model { }
Contact.init({
  // attributes
  jid: {
    type: Sequelize.STRING,
    primaryKey: true
  },
  curJid: {
    type: Sequelize.STRING,
  },
  name: {
    type: Sequelize.STRING,
    allowNull: false
  },
  email: {
    type: Sequelize.STRING
  },
  avatar: {
    type: Sequelize.STRING
  },
  isApp: {
    type: Sequelize.BOOLEAN,
    defaultValue: false
  }
}, {
    sequelize:db,
    modelName: 'contact'
    // options
  });
Contact.sync();
db.concatcs = Contact;
