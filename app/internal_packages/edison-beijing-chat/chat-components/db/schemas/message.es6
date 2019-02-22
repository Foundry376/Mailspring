// For messages from current user
export const MESSAGE_STATUS_FILE_UPLOADING = 'MESSAGE_STATUS_FILE_UPLOADING';
export const MESSAGE_STATUS_SENDING = 'MESSAGE_STATUS_SENDING';
export const MESSAGE_STATUS_DELIVERED = 'MESSAGE_STATUS_DELIVERED';
export const MESSAGE_STATUS_READ = 'MESSAGE_STATUS_READ';
export const MESSAGE_STATUS_UPLOAD_FAILED = 'MESSAGE_STATUS_UPLOAD_FAILED';

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

export const getStatusWeight = status => STATUS_WEIGHTS[status];

export default {
  title: 'message schema',
  version: 0,
  description: 'describes a message',
  type: 'object',
  properties: {
    id: {
      type: 'string',
      primary: true
    },
    conversationJid: {
      type: 'string',
      index: true
    },
    sender: {
      type: 'string'
    },
    body: {
      type: 'string'
    },
    sentTime: {
      type: 'number', //cxm: sentTime is the first sentTime
      min: 0
    },
    updateTime: {
      type: 'number', //cxm: updateTime is the last sentTime(including edit sent messages)
      min: 0
    },
    readTime: {
      type: 'number', //cxm: readTime is set at the time while message.jsx.componentWillUnmount
      min: 0
    },
    status: {
      type: 'string',
      enum: [
        MESSAGE_STATUS_FILE_UPLOADING,
        MESSAGE_STATUS_SENDING,
        MESSAGE_STATUS_DELIVERED,
        MESSAGE_STATUS_READ,
        MESSAGE_STATUS_RECEIVED,
        MESSAGE_STATUS_UPLOAD_FAILED,
      ],
    },
  },
  required: [
    'conversationJid',
    'sender',
    'body',
    'sentTime',
    'status',
  ],
};
