const Sequelize = require('sequelize');
const Model = Sequelize.Model;
const { getdb } = require('../db/index');
const db = getdb();
const { tableCompletedSync } = require('../utils/databaseCompleteInt');

export default class Contact extends Model {}
Contact.init(
  {
    // attributes
    jid: {
      type: Sequelize.STRING,
    },
    curJid: {
      type: Sequelize.STRING,
    },
    name: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    email: {
      type: Sequelize.STRING,
      primaryKey: true,
    },
    avatar: {
      type: Sequelize.STRING,
    },
    isApp: {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
    },
  },
  {
    sequelize: db,
    modelName: 'contact_v2',
    // options
  }
);
Contact.sync().then(tableCompletedSync);
db.concatcs = Contact;
