const Sequelize = require('sequelize');
const Model = Sequelize.Model;
const { getdb } = require('../db/index');
const db = getdb();

export default class Block extends Model {}
Block.init(
  {
    curJid: {
      type: Sequelize.STRING,
    },
    jid: {
      type: Sequelize.STRING,
    },
  },
  {
    indexes: [
      {
        fields: ['curJid'],
      },
    ],
    sequelize: db,
    modelName: 'block',
  }
);
Block.sync();
db.block = Block;
