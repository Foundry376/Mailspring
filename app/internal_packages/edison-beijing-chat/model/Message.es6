// For messages from current user
import Conversation from './Conversation';

export const MESSAGE_STATUS_FILE_UPLOADING = 'MESSAGE_STATUS_FILE_UPLOADING';
export const MESSAGE_STATUS_SENDING = 'MESSAGE_STATUS_SENDING';
export const MESSAGE_STATUS_DELIVERED = 'MESSAGE_STATUS_DELIVERED';
export const MESSAGE_STATUS_READ = 'MESSAGE_STATUS_READ';
export const MESSAGE_STATUS_TRANSFER_FAILED = 'MESSAGE_STATUS_TRANSFER_FAILED';

// For messages from others
export const MESSAGE_STATUS_RECEIVED = 'MESSAGE_STATUS_RECEIVED';

// Messages from others have weights < 0,
// Messages from self have weights > 0
const STATUS_WEIGHTS = {
  MESSAGE_STATUS_FILE_UPLOADING: -2,
  MESSAGE_STATUS_RECEIVED: -1,
  MESSAGE_STATUS_SENDING: 1,
  MESSAGE_STATUS_DELIVERED: 2,
  MESSAGE_STATUS_READ: 3,
};

const Sequelize = require('sequelize');
const Model = Sequelize.Model;
const { getdb } = require('../db/index');
const db = getdb();

export const getStatusWeight = status => STATUS_WEIGHTS[status];

export default class Message extends Model { }
Message.init({
  // attributes
  id: {
    type: Sequelize.STRING,
    primaryKey: true
  },
  conversationJid: {
    type: Sequelize.STRING,
    index: true
  },
  sender: {
    type: Sequelize.STRING,
    allowNull: false
  },
  body: {
    type: Sequelize.STRING,
    allowNull: false
  },
  sentTime: {
    type: Sequelize.INTEGER, //cxm: sentTime is the first sentTime
    allowNull: false
  },
  updateTime: {
    type: Sequelize.INTEGER, //cxm: updateTime is the last sentTime(including edit sent messages)
  },
  readTime: {
    type: Sequelize.INTEGER, //cxm: readTime is set at the time while message.jsx.componentWillUnmount
  },
  status: {
    type: Sequelize.STRING,
    allowNull: false
  },
}, {
    sequelize:db,
    indexes: [
      {
        name: 'conversation_jid_index',
        fields: ['conversationJid']
      }
    ],
    modelName: 'messages'
    // options
  });
Message.sync();
db.messages = Message;
