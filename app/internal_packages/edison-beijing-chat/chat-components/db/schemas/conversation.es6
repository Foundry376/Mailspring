export default {
  title: 'conversation schema',
  version: 0,
  description: 'describes a conversation',
  type: 'object',
  properties: {
    jid: {
      type: 'string',
      primary: true
    },
    curJid: {
      type: 'string',
    },
    name: {
      type: 'string'
    },
    avatar: {
      type: 'string'
    },
    isGroup: {
      type: 'boolean'
    },
    isHiddenNotification: {
      type: 'boolean'
    },
    at: { // be '@'
      type: 'boolean'
    },
    unreadMessages: {
      type: 'number',
      min: 0
    },
    occupants: { // Jids of occupants
      type: 'array',
      // uniqueItems: true,
      item: {
        type: 'string'
      }
    },
    roomMembers: { // group chat members
      type: 'array',
      default: [],
    },
    nicknames: { // array of jid with nickname
      type: 'array',
      items: {
        type: 'object',
        "properties": {
          "jid": {
            "type": "string"
          },
          "nickname": {
            "type": "string"
          }
        }
      }
    },
    avatarMembers: {
      type: 'array',
      item: {
        type: 'object'
      }
    },
    lastMessageTime: {
      type: 'number',
      min: 0
    },
    lastMessageText: {
      type: 'string'
    },
    lastMessageSender: { // Jid of last sender
      type: 'string'
    },
    lastMessageSenderName: {
      type: 'string'
    }
  },
  required: [
    'name',
    'isGroup',
    'unreadMessages',
    'occupants',
  ]
};
